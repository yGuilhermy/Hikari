const fs = require('fs');
const path = require('path');
const config = require('../config');
require('dotenv').config();

const SAFETY_NEGATIVE_BASE = 'nsfw, nude, explicit, gore, violence, blood, adult content, 18+, pornographic, sexual, disturbing, hentai, r18, genitals, suggestive, semi-nude';

function enforceSafetyNegative(negativePrompt = '') {
    if (!negativePrompt.trim()) return SAFETY_NEGATIVE_BASE;
    const safetyTokens = SAFETY_NEGATIVE_BASE.split(',').map(t => t.trim());
    const existing = negativePrompt.toLowerCase();
    const missing = safetyTokens.filter(t => !existing.includes(t));
    return missing.length > 0 ? negativePrompt + ', ' + missing.join(', ') : negativePrompt;
}

function getTempImagePath(ext = 'png', seed = 'na') {
    const tempDir = path.join(__dirname, '../data/temp_images');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    return path.join(tempDir, `image_${Date.now()}_${seed}.${ext}`);
}

async function translateToEnglish(text) {
    if (!text || typeof text !== 'string') return text;
    const trimmed = text.trim();
    if (!trimmed) return text;
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=en&dt=t&q=${encodeURIComponent(trimmed)}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.[0])) {
                const translated = data[0].map(item => item?.[0]).filter(Boolean).join('');
                if (translated && translated.trim()) return translated.trim();
            }
        }
    } catch (_) {}
    return trimmed;
}

async function tryFluxSpace(prompt, negativePrompt, width, height) {
    const hfToken = config.hfToken;
    if (!hfToken) throw new Error('HF_TOKEN não configurado');
    console.log('[Image 3/3] Tentando FLUX.1 Oficial (HuggingFace Space)...');
    const { Client } = await import('@gradio/client');
    const client = await Client.connect('black-forest-labs/FLUX.1-schnell', { hf_token: hfToken });
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const result = await client.predict('/infer', {
        prompt,
        seed,
        randomize_seed: true,
        width: Math.min(width, 1024),
        height: Math.min(height, 1024),
        num_inference_steps: 4,
    });
    const imageUrl = result?.data?.[0]?.url;
    const actualSeed = result?.data?.[1] ?? seed;
    if (!imageUrl) throw new Error('URL não retornada pelo Space FLUX.1');
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!imageResponse.ok) throw new Error(`Download FLUX HTTP ${imageResponse.status}`);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const localFilePath = getTempImagePath('webp', actualSeed);
    fs.writeFileSync(localFilePath, buffer);
    console.log(`[Image 3/3] FLUX.1 imagem salva: ${localFilePath}`);
    return { imageUrl: null, localFilePath, actualSeed, modelName: 'FLUX.1-schnell (Official Space)' };
}

async function tryPollinations(prompt, negativePrompt, width, height, customModel = null) {
    const isAnimePrompt = /anime|manga|kawaii|hikari|waifu|illustration|chibi|2d/i.test(prompt);
    const model = customModel || (isAnimePrompt ? 'flux-anime' : 'flux');
    console.log(`[Image 1/3] Tentando Pollinations AI (${model})...`);
    const encodedPrompt = encodeURIComponent(prompt);
    const encodedNegative = encodeURIComponent(negativePrompt || '');
    const seed = Math.floor(Math.random() * 1e9);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?negative=${encodedNegative}&width=${Math.min(width, 1280)}&height=${Math.min(height, 1280)}&seed=${seed}&model=${model}&nologo=true`;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
            if (res.status === 429) {
                console.warn(`[Pollinations] 429 (fila ocupada), tentativa ${attempt}/2. Aguardando 2.5s...`);
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 2500));
                    continue;
                }
                throw new Error('Pollinations fila de IP ocupada (429)');
            }
            if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('image')) throw new Error(`Content-Type inesperado: ${contentType}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            if (!buffer.length) throw new Error('Buffer vazio recebido');
            const localFilePath = getTempImagePath('png', seed);
            fs.writeFileSync(localFilePath, buffer);
            console.log(`[Image 1/3] Pollinations imagem salva: ${localFilePath}`);
            return { imageUrl: null, localFilePath, actualSeed: seed, modelName: `Pollinations (${model})` };
        } catch (err) {
            if (attempt === 2 || err.name === 'TimeoutError') throw err;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw new Error('Pollinations falhou após tentativas');
}

async function tryStableHorde(prompt, negativePrompt, width, height) {
    const apiKey = config.hordeImageApiKey || '0000000000';
    console.log('[Image 2/3] Tentando Stable Horde...');
    const submitRes = await fetch('https://stablehorde.net/api/v2/generate/async', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
            'Client-Agent': 'HikariBot:3.0:github.com/yguilhermy/Hikari',
        },
        body: JSON.stringify({
            prompt: negativePrompt ? `${prompt} ### ${negativePrompt}` : prompt,
            params: {
                sampler_name: 'k_euler',
                cfg_scale: 7,
                steps: 15,
                width: Math.round(Math.min(width, 768) / 64) * 64,
                height: Math.round(Math.min(height, 768) / 64) * 64,
                karras: true,
                n: 1,
            },
            models: ['AlbedoBase XL (SDXL)', 'ICBINP - I Cant Believe Its Not Photography', 'stable_diffusion'],
            nsfw: false,
            censor_nsfw: true,
            shared: true,
            r2: true,
        }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!submitRes.ok) {
        const errBody = await submitRes.text().catch(() => '');
        throw new Error(`Stable Horde submit HTTP ${submitRes.status}: ${errBody.substring(0, 100)}`);
    }
    const { id } = await submitRes.json();
    if (!id) throw new Error('Stable Horde não retornou ID de job');
    console.log(`[Image 2/3] Stable Horde job ID: ${id} — aguardando...`);

    for (let attempt = 0; attempt < 14; attempt++) {
        await new Promise(r => setTimeout(r, 3000));
        const checkRes = await fetch(`https://stablehorde.net/api/v2/generate/check/${id}`);
        if (!checkRes.ok) continue;
        const checkData = await checkRes.json();
        if (checkData.queue_position > 150) {
            console.warn(`[Stable Horde] Fila excessiva (${checkData.queue_position} pessoas > 150). Abortando.`);
            throw new Error(`Fila do Stable Horde muito cheia (${checkData.queue_position} na frente)`);
        }
        if (checkData.done) {
            const resultRes = await fetch(`https://stablehorde.net/api/v2/generate/status/${id}`);
            if (!resultRes.ok) throw new Error(`Stable Horde result HTTP ${resultRes.status}`);
            const resultData = await resultRes.json();
            const generation = resultData?.generations?.[0];
            const hordeModel = generation?.model || 'SDXL';
            if (generation?.img) {
                let buffer;
                if (generation.img.startsWith('http')) {
                    const imgRes = await fetch(generation.img, { signal: AbortSignal.timeout(20_000) });
                    if (!imgRes.ok) throw new Error(`Horde R2 download HTTP ${imgRes.status}`);
                    buffer = Buffer.from(await imgRes.arrayBuffer());
                } else {
                    buffer = Buffer.from(generation.img, 'base64');
                }
                const seed = generation?.seed || Math.floor(Math.random() * 1e9);
                const localFilePath = getTempImagePath('png', seed);
                fs.writeFileSync(localFilePath, buffer);
                console.log(`[Image 2/3] Stable Horde imagem salva: ${localFilePath}`);
                return { imageUrl: null, localFilePath, actualSeed: seed, modelName: `${hordeModel} (Stable Horde)` };
            }
            throw new Error('Stable Horde não retornou imagem válida');
        }
        if (checkData.faulted) throw new Error('Stable Horde: job falhou no nó worker');
    }
    throw new Error('Stable Horde timeout (42s)');
}

async function generateImage(prompt, negativePrompt = '', width = 1024, height = 1024, options = {}) {
    const startTime = Date.now();
    const { provider = 'auto', bypassSafety = false } = options;
    const translatedPrompt = await translateToEnglish(prompt);
    const translatedNegative = negativePrompt ? await translateToEnglish(negativePrompt) : '';
    console.log(`[IMAGE/FULL_PROMPT]: "${prompt}"`);
    console.log(`[IMAGE/TRANSLATED]: "${translatedPrompt}"`);
    console.log(`[IMAGE/NEGATIVE]: "${translatedNegative}"`);
    console.log(`[IMAGE/PARAMS]: Provedor: ${provider} | Resolução: ${width}x${height}`);
    const finalNegative = bypassSafety ? translatedNegative : enforceSafetyNegative(translatedNegative);
    const allProviders = [
        { id: 'pollinations', name: 'Pollinations AI', fn: tryPollinations },
        { id: 'stablehorde', name: 'Stable Horde', fn: tryStableHorde },
        { id: 'flux', name: 'FLUX.1 Oficial (HuggingFace)', fn: tryFluxSpace },
    ];
    let providersToTry = allProviders;
    if (provider && provider !== 'auto') {
        const selected = allProviders.find(p => p.id === provider);
        if (selected) providersToTry = [selected];
    }
    for (const p of providersToTry) {
        try {
            const result = await p.fn(translatedPrompt, finalNegative, width, height);
            if (result) {
                const durationMs = Date.now() - startTime;
                console.log(`[ImageHandler] ✅ Sucesso via ${p.name} em ${durationMs}ms | Seed: ${result.actualSeed} | Arquivo: ${result.localFilePath}`);
                const telemetryLogger = require('../utils/telemetryLogger');
                telemetryLogger.image({
                    model: result.modelName || p.name,
                    provider: p.name,
                    width,
                    height,
                    durationMs,
                    status: '200 OK'
                });
                return result;
            }
        } catch (err) {
            console.warn(`[ImageHandler] ❌ ${p.name} falhou: ${err.message}`);
        }
    }
    console.error(`[ImageHandler] CRITICAL: Fallback failed para lista de provedores (${providersToTry.map(p => p.id).join(', ')}).`);
    const telemetryLogger = require('../utils/telemetryLogger');
    telemetryLogger.error({
        category: 'IMAGE',
        message: `Falha na geração de imagem (${width}x${height}) após tentar provedores`
    });
    return null;
}

module.exports = { generateImage };