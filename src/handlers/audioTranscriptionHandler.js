const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const { transcribeAudio } = require('../services/sttService');

const cacheFilePath = path.join(__dirname, '../data/audio_transcriptions.json');
const MAX_CACHE_ENTRIES = 1000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

let transcriptionCache = new Map();
const inFlightRequests = new Map();

function loadCache() {
    try {
        if (fs.existsSync(cacheFilePath)) {
            const raw = fs.readFileSync(cacheFilePath, 'utf8');
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                const entries = Object.entries(data);
                const recentEntries = entries.slice(-MAX_CACHE_ENTRIES);
                transcriptionCache = new Map(recentEntries);
            }
        }
    } catch (_) {
        transcriptionCache = new Map();
    }
}

function saveCache() {
    try {
        const dir = path.dirname(cacheFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const obj = Object.fromEntries(transcriptionCache);
        fs.writeFileSync(cacheFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (_) {}
}

loadCache();

function isVoiceMessage(msg, attachment) {
    if (!attachment) return false;
    if (msg?.flags?.has?.(8192) || (msg?.flags && (msg.flags.bitfield & 8192) !== 0)) {
        return true;
    }
    if (attachment.waveform) {
        return true;
    }
    const name = (attachment.name || '').toLowerCase();
    if (name === 'voice-message.ogg' || name === 'voice_message.ogg' || name.startsWith('audio_message') || name.startsWith('ptt-') || name.startsWith('gravacao') || name.startsWith('gravação') || name.startsWith('voice')) {
        return true;
    }
    return false;
}

function isAudioAttachment(attachment) {
    if (!attachment) return false;
    const contentType = (attachment.contentType || '').toLowerCase();
    if (contentType.startsWith('audio/')) return true;
    const name = (attachment.name || '').toLowerCase();
    const audioExtensions = ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.opus', '.wma'];
    return audioExtensions.some(ext => name.endsWith(ext));
}

function convertToWav(audioBuffer) {
    return new Promise((resolve) => {
        let isDone = false;
        const ffmpeg = spawn('ffmpeg', [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', 'pipe:0',
            '-f', 'wav',
            '-ar', '16000',
            '-ac', '1',
            '-t', '60',
            'pipe:1'
        ]);

        const chunks = [];
        const timer = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                try { ffmpeg.kill('SIGKILL'); } catch (_) {}
                resolve(audioBuffer);
            }
        }, 8000);

        ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
        ffmpeg.stderr.on('data', () => {});
        ffmpeg.on('close', (code) => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timer);
            if (code === 0 && chunks.length > 0) {
                resolve(Buffer.concat(chunks));
            } else {
                resolve(audioBuffer);
            }
        });
        ffmpeg.on('error', () => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timer);
            resolve(audioBuffer);
        });

        try {
            ffmpeg.stdin.write(audioBuffer);
            ffmpeg.stdin.end();
        } catch (_) {
            if (!isDone) {
                isDone = true;
                clearTimeout(timer);
                resolve(audioBuffer);
            }
        }
    });
}

async function fetchAudioBuffer(url) {
    if (!url || typeof url !== 'string') return null;
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: 10000,
        maxContentLength: MAX_AUDIO_BYTES
    });
    return Buffer.from(response.data);
}

async function transcribeVoiceAttachment(attachmentId, attachmentUrl) {
    if (transcriptionCache.has(attachmentId)) {
        return transcriptionCache.get(attachmentId);
    }
    if (inFlightRequests.has(attachmentId)) {
        return await inFlightRequests.get(attachmentId);
    }

    const task = (async () => {
        try {
            if (!attachmentUrl) return null;
            const rawBuffer = await fetchAudioBuffer(attachmentUrl);
            if (!rawBuffer || rawBuffer.length > MAX_AUDIO_BYTES) {
                return null;
            }
            const wavBuffer = await convertToWav(rawBuffer);
            const result = await transcribeAudio(wavBuffer, 'voice.wav');
            const text = (typeof result === 'string') ? result.trim() : null;
            if (text) {
                transcriptionCache.set(attachmentId, text);
                if (transcriptionCache.size > MAX_CACHE_ENTRIES) {
                    const firstKey = transcriptionCache.keys().next().value;
                    transcriptionCache.delete(firstKey);
                }
                saveCache();
                return text;
            }
            return null;
        } catch (err) {
            console.warn(`[VoiceTranscription] Falha ao transcrever anexo ${attachmentId}:`, err.message);
            return null;
        } finally {
            inFlightRequests.delete(attachmentId);
        }
    })();

    inFlightRequests.set(attachmentId, task);
    return await task;
}

async function resolveMessageAudioContent(msg) {
    if (!msg) return '';
    let baseText = (msg.content || '').trim();
    if (!msg.attachments || msg.attachments.size === 0) {
        return baseText;
    }

    const audioItems = [];
    for (const [, attachment] of msg.attachments) {
        if (!isAudioAttachment(attachment)) continue;

        const isVoice = isVoiceMessage(msg, attachment) ||
            Boolean(attachment.waveform) ||
            Boolean(attachment.duration && attachment.duration <= 180) ||
            /\b(áudio|audio|gravação|gravacao|voz|escuta|ouve|transcreva|ouça)\b/i.test(baseText);
        if (isVoice) {
            const cacheKey = attachment.id || msg.id;
            let transcribedText = transcriptionCache.get(cacheKey);
            if (!transcribedText) {
                transcribedText = await transcribeVoiceAttachment(cacheKey, attachment.url);
            }
            if (transcribedText) {
                audioItems.push(`audio transcrito: ${transcribedText}`);
            } else {
                audioItems.push('audio de voz inaudível');
            }
        } else {
            const fileName = attachment.name || 'musica.mp3';
            audioItems.push(`"${fileName}"`);
        }
    }

    if (audioItems.length === 0) {
        return baseText;
    }

    const audioString = audioItems.join(' | ');
    if (!baseText) {
        return audioString;
    }
    return `${baseText} (${audioString})`;
}

module.exports = {
    isVoiceMessage,
    isAudioAttachment,
    resolveMessageAudioContent,
    transcribeVoiceAttachment,
    loadCache
};

