const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');
const telemetryLogger = require('../utils/telemetryLogger');

const cacheFilePath = path.join(__dirname, '../data/image_descriptions.json');
const MAX_CACHE_ENTRIES = 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

let imageDescriptionCache = new Map();
const inFlightRequests = new Map();

function formatCompactDescription(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/[*_#`~>]/g, '')
        .replace(/(^|\n)[\s-•*]+/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function loadCache() {
    try {
        if (fs.existsSync(cacheFilePath)) {
            const raw = fs.readFileSync(cacheFilePath, 'utf8');
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                const entries = Object.entries(data).map(([k, v]) => [k, formatCompactDescription(v)]);
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
        const tmpPath = `${cacheFilePath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
        fs.renameSync(tmpPath, cacheFilePath);
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

const VISION_MODELS = [
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    config.geminiModel,
    config.geminiModelFallback
].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

async function describeWithGemini(buffer, mimeType) {
    const keys = config.geminiApiKeys || [];
    if (!keys.length) {
        console.warn('[Vision] Nenhuma chave Gemini configurada.');
        return null;
    }

    const base64Data = buffer.toString('base64');
    const promptText = 'Descreva esta imagem em português de forma detalhada, rica em elementos e compacta. Identifique o sujeito principal, cenário, objetos, cores, personagens ou pessoas, ações e transcreva ou resuma textos legíveis importantes. OBRIGATÓRIO: Responda em no máximo UM ÚNICO PARÁGRAFO contínuo, sem nenhuma quebra de linha, sem tópicos, sem listas e SEM FORMATAÇÃO MARKDOWN (não use asteriscos, negrito nem títulos).';

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        for (const model of VISION_MODELS) {
            try {
                const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
                const payload = {
                    contents: [{
                        parts: [
                            { text: promptText },
                            { inlineData: { mimeType, data: base64Data } }
                        ]
                    }],
                    generationConfig: {
                        maxOutputTokens: 450,
                        temperature: 0.2
                    }
                };

                const response = await axios.post(nativeUrl, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 20000
                });

                const candidate = response.data?.candidates?.[0];
                const text = candidate?.content?.parts?.[0]?.text;
                if (typeof text === 'string' && text.trim().length > 10) {
                    const cleaned = formatCompactDescription(text);
                    console.log(`[Vision] Imagem descrita com sucesso via chave ${i + 1}/${keys.length} (${model}).`);
                    return cleaned;
                }
            } catch (err) {
                const status = err.response?.status;
                const errMsg = err.response?.data?.error?.message || err.message;
                if (status === 404) {
                    continue;
                }
                if (status === 429) {
                    console.warn(`[Vision] Cota excedida na chave ${i + 1}/${keys.length} (${model}): ${errMsg}`);
                    break;
                }
                console.warn(`[Vision] Falha na chave ${i + 1}/${keys.length} (${model}):`, errMsg);
            }
        }

        try {
            const compatPayload = {
                model: 'gemini-2.5-flash-lite',
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
                max_tokens: 450,
                temperature: 0.2
            };

            const compatResponse = await axios.post(config.geminiUrl, compatPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                timeout: 20000
            });

            const text = compatResponse.data?.choices?.[0]?.message?.content;
            if (typeof text === 'string' && text.trim().length > 10) {
                const cleaned = formatCompactDescription(text);
                console.log(`[Vision] Imagem descrita com sucesso via fallback OpenAI na chave ${i + 1}/${keys.length}.`);
                return cleaned;
            }
        } catch (_) {}
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
        const startTime = Date.now();
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
                const durationMs = Date.now() - startTime;
                telemetryLogger.vision({ durationMs, status: '200 OK' });
                const compact = formatCompactDescription(description);
                imageDescriptionCache.set(attachmentId, compact);
                if (imageDescriptionCache.size > MAX_CACHE_ENTRIES) {
                    const firstKey = imageDescriptionCache.keys().next().value;
                    imageDescriptionCache.delete(firstKey);
                }
                saveCache();
                return compact;
            }
            return null;
        } catch (err) {
            console.warn(`[Vision] Erro geral ao processar anexo ${attachmentId}:`, err.message);
            telemetryLogger.warn(`Falha na análise de visão: ${err.message || 'desconhecido'}`);
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
                const compact = formatCompactDescription(description);
                visualItems.push(`[imagem]: ${compact}`);
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
    formatCompactDescription,
    loadCache,
    saveCache
};
