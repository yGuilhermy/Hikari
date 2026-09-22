const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');

const cacheFilePath = path.join(__dirname, '../data/image_descriptions.json');
const MAX_CACHE_ENTRIES = 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

let imageDescriptionCache = new Map();
const inFlightRequests = new Map();

function loadCache() {
    try {
        if (fs.existsSync(cacheFilePath)) {
            const raw = fs.readFileSync(cacheFilePath, 'utf8');
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                const entries = Object.entries(data);
                const recentEntries = entries.slice(-MAX_CACHE_ENTRIES);
                imageDescriptionCache = new Map(recentEntries);
            }
        }
    } catch (_) {
        imageDescriptionCache = new Map();
    }
}

function saveCache() {
    try {
        const dir = path.dirname(cacheFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const obj = Object.fromEntries(imageDescriptionCache);
        fs.writeFileSync(cacheFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (_) {}
}

loadCache();

function isImageAttachment(attachment) {
    if (!attachment) return false;
    const contentType = (attachment.contentType || '').toLowerCase();
    if (contentType.startsWith('image/')) return true;
    const name = (attachment.name || '').toLowerCase();
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
    return imageExtensions.some(ext => name.endsWith(ext));
}

function isVideoAttachment(attachment) {
    if (!attachment) return false;
    const contentType = (attachment.contentType || '').toLowerCase();
    if (contentType.startsWith('video/')) return true;
    const name = (attachment.name || '').toLowerCase();
    const videoExtensions = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.wmv', '.flv'];
    return videoExtensions.some(ext => name.endsWith(ext));
}

function getMimeType(attachmentName) {
    const name = (attachmentName || '').toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
}

async function fetchImageBuffer(url) {
    if (!url || typeof url !== 'string') return null;
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: 10000,
        maxContentLength: MAX_IMAGE_BYTES
    });
    return Buffer.from(response.data);
}

async function describeWithGemini(buffer, mimeType) {
    const keys = config.geminiApiKeys || [];
    if (!keys.length) {
        console.warn('[Vision] Nenhuma chave Gemini configurada.');
        return null;
    }

    const base64Data = buffer.toString('base64');
    const promptText = 'Descreva brevemente esta imagem em português em 2 a 3 frases objetivas. Se for um print, documento ou imagem contendo texto ou código relevante, transcreva as partes mais importantes, para memes descreva o meme em até 5 frases. Seja conciso, direto e natural.';

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        try {
            const payload = {
                model: 'gemini-2.5-flash',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: promptText },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${mimeType};base64,${base64Data}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 350,
                temperature: 0.2
            };

            const response = await axios.post(config.geminiUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                timeout: 15000
            });

            const text = response.data?.choices?.[0]?.message?.content;
            if (typeof text === 'string' && text.trim().length > 0) {
                const cleaned = text.trim().replace(/\r?\n+/g, ' ');
                console.log(`[Vision] Imagem descrita com sucesso via chave ${i + 1}/${keys.length}.`);
                return cleaned;
            }
        } catch (err) {
            console.warn(`[Vision] Falha na chave ${i + 1}/${keys.length}:`, err.response?.data?.error?.message || err.message);
        }
    }

    return null;
}

async function describeImageAttachment(attachmentId, attachmentUrl, attachmentName) {
    if (imageDescriptionCache.has(attachmentId)) {
        return imageDescriptionCache.get(attachmentId);
    }
    if (inFlightRequests.has(attachmentId)) {
        return await inFlightRequests.get(attachmentId);
    }

    const task = (async () => {
        try {
            if (!attachmentUrl) return null;
            console.log(`[Vision] Baixando anexo: ${attachmentName || attachmentId}...`);
            const buffer = await fetchImageBuffer(attachmentUrl);
            if (!buffer || buffer.length > MAX_IMAGE_BYTES) {
                console.warn(`[Vision] Buffer inválido ou acima do limite de tamanho.`);
                return null;
            }

            const mimeType = getMimeType(attachmentName);
            let description = await describeWithGemini(buffer, mimeType);

            if (description) {
                imageDescriptionCache.set(attachmentId, description);
                if (imageDescriptionCache.size > MAX_CACHE_ENTRIES) {
                    const firstKey = imageDescriptionCache.keys().next().value;
                    imageDescriptionCache.delete(firstKey);
                }
                saveCache();
                return description;
            }
            return null;
        } catch (err) {
            console.warn(`[Vision] Erro geral ao processar anexo ${attachmentId}:`, err.message);
            return null;
        } finally {
            inFlightRequests.delete(attachmentId);
        }
    })();

    inFlightRequests.set(attachmentId, task);
    return await task;
}

async function resolveMessageVisualContent(msg, currentText = '') {
    if (!msg) return currentText || '';
    let text = (typeof currentText === 'string') ? currentText : (msg.content || '');
    if (!msg.attachments || msg.attachments.size === 0) {
        return text;
    }

    const { isAudioAttachment } = require('./audioTranscriptionHandler');
    const visualItems = [];
    for (const [, attachment] of msg.attachments) {
        if (isImageAttachment(attachment)) {
            const cacheKey = attachment.id || msg.id;
            let description = imageDescriptionCache.get(cacheKey);
            if (!description) {
                description = await describeImageAttachment(cacheKey, attachment.url, attachment.name);
            }
            if (description) {
                visualItems.push(`[imagem]: ${description}`);
            } else {
                const fileName = attachment.name || 'imagem.png';
                visualItems.push(`[imagem anexada]: "${fileName}"`);
            }
        } else if (isVideoAttachment(attachment)) {
            const fileName = attachment.name || 'video.mp4';
            visualItems.push(`[vídeo anexado]: "${fileName}"`);
        } else if (!isAudioAttachment(attachment)) {
            const fileName = attachment.name || 'arquivo';
            visualItems.push(`[arquivo anexado]: "${fileName}"`);
        }
    }

    if (visualItems.length === 0) {
        return text;
    }

    const visualString = visualItems.join(' ');
    if (!text || text.trim().length === 0) {
        return visualString;
    }
    return `${text} ${visualString}`;
}

module.exports = {
    isImageAttachment,
    isVideoAttachment,
    describeImageAttachment,
    resolveMessageVisualContent,
    loadCache
};
