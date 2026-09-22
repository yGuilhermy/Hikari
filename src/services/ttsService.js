const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const config = require('../config');

const PHONETIC_DICT = {
    r_discord: [/\bdiscord\b/gi, 'discórd'],
    r_pubg: [/\bpubg\b/gi, 'púbiji'],
    r_pc: [/\bpc\b/gi, 'pê-cê'],
    r_fps: [/\bfps\b/gi, 'éfe-pê-ésse'],
    r_windows: [/\bwindows\b/gi, 'uíndous'],
    r_app: [/\bapp\b/gi, 'aplicativo'],
    r_apps: [/\bapps\b/gi, 'aplicativos'],
    r_game: [/\bgame\b/gi, 'gueime'],
    r_games: [/\bgames\b/gi, 'gueimes'],
    r_gameplay: [/\bgameplay\b/gi, 'gueime-plei'],
    r_stream: [/\bstream\b/gi, 'strim'],
    r_streaming: [/\bstreaming\b/gi, 'striming'],
    r_live: [/\blive\b/gi, 'laive'],
    r_lives: [/\blives\b/gi, 'laives'],
    r_online: [/\bonline\b/gi, 'on-laine'],
    r_offline: [/\boffline\b/gi, 'óf-laine'],
    r_call: [/\bcall\b/gi, 'cól'],
    r_mute: [/\bmute\b/gi, 'miút'],
    r_unmute: [/\bunmute\b/gi, 'anmiút'],
    r_lag: [/\blag\b/gi, 'lég'],
    r_bug: [/\bbug\b/gi, 'bág'],
    r_drop: [/\bdrop\b/gi, 'dróp'],
    r_setup: [/\bsetup\b/gi, 'setáp'],
    r_spotify: [/\bspotify\b/gi, 'spotifai'],
    r_youtube: [/\byoutube\b/gi, 'iutubi'],
    r_playlist: [/\bplaylist\b/gi, 'pleilist'],
    r_playlists: [/\bplaylists\b/gi, 'pleilists'],
    r_bluetooth: [/\bbluetooth\b/gi, 'blutuf'],
    r_wifi: [/\bwi-fi\b|\bwifi\b/gi, 'uai-fai'],
    r_bot: [/\bbot\b/gi, 'bót'],
    r_ia: [/\bia\b/gi, 'í-á'],
    r_dm: [/\bdm\b/gi, 'dê-eme'],
    r_dms: [/\bdms\b/gi, 'dê-emes']
};

function cleanForTts(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]*`/g, '')
        .replace(/<@!?\d+>/g, '')
        .replace(/<#\d+>/g, '')
        .replace(/<@&\d+>/g, '')
        .replace(/<a?:\w+:\d+>/g, '')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/[*_~#>-]/g, ' ')
        .replace(/\n-# .*$/gm, '');

    for (const key of Object.keys(PHONETIC_DICT)) {
        const [pattern, replacement] = PHONETIC_DICT[key];
        text = text.replace(pattern, replacement);
    }

    text = text.replace(/,\s*([A-ZÀ-Ú])/g, '. $1');
    text = text.replace(/[!]+/g, '.');
    text = text.replace(/[,]{2,}/g, ',');
    text = text.replace(/\s+/g, ' ').trim();
    text = text.replace(/[.,;: ]+$/, '').trim();
    return text;
}

async function synthesizeModal(text, options = {}) {
    const endpoint = options.modalEndpoint || config.modalTtsEndpoint || process.env.MODAL_TTS_ENDPOINT;
    if (!endpoint) throw new Error('MODAL_TTS_ENDPOINT não configurado');
    const payload = {
        text,
        model: options.model || 'v1',
        speed: options.speed || config.voiceSpeed || 1.15,
        temperature: options.temperature || config.voiceTemperature || 0.65,
        pause_spacing_ms: options.pauseSpacingMs || 200
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 90000);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) {
            throw new Error(`Modal TTS retornou status ${response.status}: ${response.statusText}`);
        }
        const arrayBuf = await response.arrayBuffer();
        return Buffer.from(arrayBuf);
    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

async function synthesizeHf(text, options = {}) {
    const endpoint = options.hfEndpoint || config.hfTtsEndpoint || process.env.HF_TTS_ENDPOINT;
    if (!endpoint) throw new Error('HF_TTS_ENDPOINT não configurado');
    const token = config.hfToken || process.env.HF_TOKEN || '';
    const { Client } = await import('@gradio/client');
    const client = await Client.connect(endpoint, token ? { hf_token: token } : {});
    const timeoutMs = options.timeoutMs || 35000;
    const predictPromise = client.predict('/synthesize', [
        text,
        options.model || 'v1',
        options.speed || config.voiceSpeed || 1.15,
        options.temperature || config.voiceTemperature || 0.65,
        options.pauseSpacingMs || 200
    ]);
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout de ${timeoutMs}ms no Hugging Face`)), timeoutMs)
    );
    const result = await Promise.race([predictPromise, timeoutPromise]);
    const fileObj = result?.data?.[0];
    const audioUrl = fileObj?.url || (fileObj?.path ? `${endpoint}/file=${fileObj.path}` : null);
    if (!audioUrl) throw new Error('HF Space não retornou arquivo de áudio');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const audioRes = await fetch(audioUrl, { headers });
    if (!audioRes.ok) throw new Error(`Falha ao baixar áudio do HF: ${audioRes.status}`);
    const arrayBuf = await audioRes.arrayBuffer();
    return Buffer.from(arrayBuf);
}

async function synthesizeAudio(text, options = {}) {
    const cleanText = cleanForTts(text);
    if (!cleanText || cleanText.length < 2) return null;

    try {
        const wavBuffer = await synthesizeHf(cleanText, options);
        if (wavBuffer && wavBuffer.length > 1000) return wavBuffer;
    } catch (hfErr) {
        console.warn('[TTS] Falha no Hugging Face, tentando fallback Modal:', hfErr.message);
    }

    try {
        const wavBuffer = await synthesizeModal(cleanText, options);
        if (wavBuffer && wavBuffer.length > 1000) return wavBuffer;
    } catch (modalErr) {
        console.error('[TTS] Falha no fallback Modal:', modalErr.message);
    }

    return null;
}

function convertWavToOggOpus(wavBuffer) {
    return new Promise((resolve) => {
        let isDone = false;
        const ffmpeg = spawn('ffmpeg', [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', 'pipe:0',
            '-c:a', 'libopus',
            '-b:a', '48k',
            '-vbr', 'on',
            '-f', 'ogg',
            'pipe:1'
        ]);

        const chunks = [];
        const timer = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                try { ffmpeg.kill('SIGKILL'); } catch (_) {}
                resolve(null);
            }
        }, 10000);

        ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
        ffmpeg.stderr.on('data', () => {});
        ffmpeg.on('close', (code) => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timer);
            if (code === 0 && chunks.length > 0) {
                resolve(Buffer.concat(chunks));
            } else {
                resolve(null);
            }
        });
        ffmpeg.on('error', () => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timer);
            resolve(null);
        });

        try {
            ffmpeg.stdin.write(wavBuffer);
            ffmpeg.stdin.end();
        } catch (_) {
            if (!isDone) {
                isDone = true;
                clearTimeout(timer);
                resolve(null);
            }
        }
    });
}

function extractWaveformAndDuration(wavBuffer) {
    const dataOffset = 44;
    const sampleRate = 24000;
    const bytesPerSample = 2;
    const dataSize = Math.max(0, wavBuffer.length - dataOffset);
    const totalSamples = Math.floor(dataSize / bytesPerSample);
    const durationSecs = Number(Math.max(0.1, totalSamples / sampleRate).toFixed(2));

    if (totalSamples <= 0) {
        return {
            durationSecs,
            waveform: Buffer.from(new Uint8Array(256).fill(128)).toString('base64')
        };
    }

    const blockSize = Math.max(1, Math.floor(totalSamples / 256));
    const waveform = new Uint8Array(256);
    let globalMax = 1;
    const blockPeaks = new Float32Array(256);

    for (let b = 0; b < 256; b++) {
        let blockPeak = 0;
        const startSample = b * blockSize;
        const endSample = Math.min(startSample + blockSize, totalSamples);
        for (let s = startSample; s < endSample; s++) {
            const byteOffset = dataOffset + s * 2;
            if (byteOffset + 1 < wavBuffer.length) {
                const val = Math.abs(wavBuffer.readInt16LE(byteOffset));
                if (val > blockPeak) blockPeak = val;
            }
        }
        blockPeaks[b] = blockPeak;
        if (blockPeak > globalMax) globalMax = blockPeak;
    }

    for (let b = 0; b < 256; b++) {
        waveform[b] = Math.min(255, Math.max(8, Math.round((blockPeaks[b] / globalMax) * 255)));
    }

    return {
        durationSecs,
        waveform: Buffer.from(waveform).toString('base64')
    };
}

async function sendVoiceMessage(channel, oggBuffer, durationSecs, waveform, replyToMessageId = null) {
    const isDm = channel?.isDMBased?.() || channel?.type === 1 || !channel?.guild;
    if (!isDm) {
        try {
            const token = config.discordToken;
            const authHeaders = {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json'
            };

            const attachRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/attachments`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    files: [
                        {
                            filename: 'voice-message.ogg',
                            file_size: oggBuffer.length,
                            id: '0'
                        }
                    ]
                })
            });

            if (attachRes.ok) {
                const attachData = await attachRes.json();
                const uploadFile = attachData?.attachments?.[0];
                if (uploadFile && uploadFile.upload_url) {
                    const putRes = await fetch(uploadFile.upload_url, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'audio/ogg' },
                        body: oggBuffer
                    });

                    if (putRes.ok) {
                        const messagePayload = {
                            flags: 8192,
                            attachments: [
                                {
                                    id: '0',
                                    filename: 'voice-message.ogg',
                                    uploaded_filename: uploadFile.upload_filename,
                                    duration_secs: durationSecs,
                                    waveform
                                }
                            ]
                        };

                        if (replyToMessageId) {
                            messagePayload.message_reference = {
                                message_id: replyToMessageId,
                                fail_if_not_exists: false
                            };
                        }

                        const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                            method: 'POST',
                            headers: authHeaders,
                            body: JSON.stringify(messagePayload)
                        });

                        if (msgRes.ok) {
                            return await msgRes.json();
                        }
                    }
                }
            }
        } catch (_) {}
    }

    const { AttachmentBuilder } = require('discord.js');
    const attachment = new AttachmentBuilder(oggBuffer, { name: 'voice-message.ogg' });
    const fallbackPayload = { files: [attachment] };
    if (replyToMessageId) {
        fallbackPayload.reply = { messageReference: replyToMessageId, failIfNotExists: false };
    }
    const fallbackMsg = await channel.send(fallbackPayload);
    return fallbackMsg;
}

async function synthesizeVoiceAudio(text, options = {}) {
    const cleanText = cleanForTts(text);
    if (!cleanText) return null;

    const wavBuffer = await synthesizeAudio(cleanText, options);
    if (!wavBuffer) return null;

    const oggBuffer = await convertWavToOggOpus(wavBuffer);
    if (!oggBuffer) return null;

    const { durationSecs, waveform } = extractWaveformAndDuration(wavBuffer);
    return {
        cleanText,
        wavBuffer,
        oggBuffer,
        durationSecs,
        waveform
    };
}

async function generateAndSendVoiceMessage(text, channel, replyToMessageId = null, options = {}) {
    const voiceData = await synthesizeVoiceAudio(text, options);
    if (!voiceData) return null;

    const sentMsgData = await sendVoiceMessage(channel, voiceData.oggBuffer, voiceData.durationSecs, voiceData.waveform, replyToMessageId);
    return {
        message: sentMsgData,
        cleanText: voiceData.cleanText,
        durationSecs: voiceData.durationSecs,
        oggBuffer: voiceData.oggBuffer
    };
}

module.exports = {
    cleanForTts,
    synthesizeAudio,
    synthesizeVoiceAudio,
    convertWavToOggOpus,
    extractWaveformAndDuration,
    sendVoiceMessage,
    generateAndSendVoiceMessage
};

