const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');

const TEMP_AUDIO_DIR = path.join(__dirname, '../data/temp_audio');
const TEMP_VIDEO_DIR = path.join(__dirname, '../data/temp_videos');
if (!fs.existsSync(TEMP_AUDIO_DIR)) fs.mkdirSync(TEMP_AUDIO_DIR, { recursive: true });
if (!fs.existsSync(TEMP_VIDEO_DIR)) fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });

const YOUTUBE_VIDEO_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11,})(?:\S+)?$/;
const YOUTUBE_MUSIC_REGEX = /^(?:https?:\/\/)?(?:www\.)?music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11,})(?:\S+)?$/;
const YOUTUBE_PLAYLIST_REGEX = /(?:youtube\.com|youtu\.be)\/playlist\?list=|youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11,}&list=([a-zA-Z0-9_-]+)|music\.youtube\.com\/playlist\?list=|music\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11,}&list=/;
const YOUTUBE_SHORTS_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/shorts\/([a-zA-Z0-9_-]{11,})(?:\S+)?$/;
const INSTAGRAM_REGEX = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels)\/([a-zA-Z0-9_-]+)(?:\/|\?.*)?$/;
const TIKTOK_REGEX = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?tiktok\.com\/(?:@[a-zA-Z0-9_.-]+\/video\/\d+|t\/[a-zA-Z0-9]+|[a-zA-Z0-9_.-]+)(?:\/|\?.*)?$/;
const TWITTER_REGEX = /^(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)\/(?:(?:i\/status\/|[a-zA-Z0-9_]+\/status\/)(\d+))(?:\S*)?$/i;

function isSafeUrl(url) {
    if (typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.length === 0 || trimmed.length > 2048) return false;
    if (trimmed.startsWith('-')) return false;
    if (/[\r\n\0"'`$|;&<>\\]/.test(trimmed)) return false;
    try {
        const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        const host = parsed.hostname.toLowerCase();
        if (!host || host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal')) return false;
        return true;
    } catch {
        return false;
    }
}

function normalizeTwitterUrl(url) {
    const match = url.match(TWITTER_REGEX);
    if (match && match[1]) {
        const cleanDigits = match[1].replace(/[^0-9]/g, '');
        return `https://x.com/i/status/${cleanDigits}`;
    }
    return url;
}

function execYtdlp(args, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
        const proc = spawn('yt-dlp', args);
        let stdout = '';
        let stderr = '';
        let timer = null;
        let isTimedOut = false;

        if (timeoutMs > 0) {
            timer = setTimeout(() => {
                isTimedOut = true;
                try {
                    proc.kill('SIGKILL');
                } catch (_) {}
                const err = new Error(`yt-dlp timed out after ${timeoutMs}ms`);
                err.stdout = stdout;
                err.stderr = stderr;
                reject(err);
            }, timeoutMs);
        }

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('error', (err) => {
            if (timer) clearTimeout(timer);
            if (!isTimedOut) reject(err);
        });
        proc.on('close', (code) => {
            if (timer) clearTimeout(timer);
            if (isTimedOut) return;
            if (code !== 0) {
                const err = new Error(`yt-dlp exited with code ${code}`);
                err.stdout = stdout;
                err.stderr = stderr;
                return reject(err);
            }
            resolve({ stdout, stderr });
        });
    });
}

const activeUserProcesses = new Set();
let isCompressing = false;
const compressionQueue = [];
const pendingVideoFiles = new Map();

function logMediaAction(type, platform, url, context, status, extra = '') {
    let source = 'Desconhecido';
    let userStr = 'N/A';
    let localStr = 'DM';
    if (context) {
        source = context.source || source;
        if (context.user) {
            userStr = `${context.user.tag} (${context.user.id})`;
        } else if (context.userTag && context.userId) {
            userStr = `${context.userTag} (${context.userId})`;
        } else if (context.userId) {
            userStr = `ID: ${context.userId}`;
        }
        if (context.guild) {
            localStr = context.guild.name;
        } else if (context.guildName) {
            localStr = context.guildName;
        }
    }
    const platformStr = platform ? ` [${platform.toUpperCase()}]` : '';
    const extraStr = extra ? ` | ${extra}` : '';
    console.log(`[LOG] ${type} (${source})${platformStr} | Usuário: ${userStr} | Local: ${localStr} | URL: ${url} | Status: ${status}${extraStr}`);
}

function logCompressionAction(context, status, extra = '') {
    let userStr = 'N/A';
    let localStr = 'DM';
    if (context) {
        if (context.user) {
            userStr = `${context.user.tag} (${context.user.id})`;
        } else if (context.userTag && context.userId) {
            userStr = `${context.userTag} (${context.userId})`;
        } else if (context.userId) {
            userStr = `ID: ${context.userId}`;
        }
        if (context.guild) {
            localStr = context.guild.name;
        } else if (context.guildName) {
            localStr = context.guildName;
        }
    }
    const extraStr = extra ? ` | ${extra}` : '';
    console.log(`[LOG] Compressão (Botão) | Usuário: ${userStr} | Local: ${localStr} | Status: ${status}${extraStr}`);
}

function formatVideoSuccessMessage(videoData, showDetails = false) {
    const metadata = videoData.metadata || {};
    let providerName = 'undefined';
    const extractor = (metadata.extractor_key || '').toLowerCase();
    if (extractor.includes('instagram')) {
        providerName = 'Instagram Reels';
    } else if (extractor.includes('tiktok')) {
        providerName = 'TikTok';
    } else if (extractor.includes('twitter')) {
        providerName = 'Twitter / X';
    } else if (extractor.includes('youtube')) {
        const isShorts = (metadata.webpage_url || '').includes('/shorts/') || (metadata.title || '').toLowerCase().includes('shorts');
        providerName = isShorts ? 'YouTube Shorts' : 'YouTube';
    }
    let msg = `🎬 Vídeo baixado do ${providerName}:`;
    if (showDetails) {
        const author = metadata.uploader || metadata.creator || metadata.channel || metadata.artist;
        const description = metadata.description;
        if (author) {
            msg += `\n👤 By: ${author}`;
        }
        if (description && description.trim().length > 0) {
            let cleanDesc = description.trim();
            if (cleanDesc.length > 150) {
                cleanDesc = cleanDesc.substring(0, 150) + '...';
            }
            msg += `\n📝 Descrição: ${cleanDesc}`;
        }
    }
    return msg;
}

function sanitizeFilenameForDiscord(filename) {
    let sanitized = filename.replace(/[<>:"/\\|?*`!,;&$(){}[\]~^#'%]/g, '');
    sanitized = sanitized.replace(/\.\.+/g, '');
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    const MAX_FILENAME_LENGTH = 100;
    if (sanitized.length > MAX_FILENAME_LENGTH) {
        const lastSpace = sanitized.lastIndexOf(' ', MAX_FILENAME_LENGTH);
        sanitized = sanitized.substring(0, lastSpace > 0 ? lastSpace : MAX_FILENAME_LENGTH);
    }
    return sanitized || 'media';
}

function detectPlatform(url) {
    if (YOUTUBE_SHORTS_REGEX.test(url)) return 'youtube_shorts';
    if (YOUTUBE_MUSIC_REGEX.test(url)) return 'youtube_music';
    if (YOUTUBE_VIDEO_REGEX.test(url)) return 'youtube';
    if (INSTAGRAM_REGEX.test(url)) return 'instagram';
    if (TIKTOK_REGEX.test(url)) return 'tiktok';
    if (TWITTER_REGEX.test(url)) return 'twitter';
    return null;
}

function buildYtdlpAudioFlags(outputPath, url) {
    const flags = ['--no-playlist', '--no-exec', '-x', '--audio-format', 'mp3'];
    const cookiesPath = config.ytdlpCookiesPath;
    if (cookiesPath && fs.existsSync(cookiesPath)) {
        flags.push('--cookies', cookiesPath);
    }
    if (Array.isArray(config.ytdlpExtraFlags)) {
        flags.push(...config.ytdlpExtraFlags.filter(f => typeof f === 'string' && !f.includes('exec')));
    }
    flags.push('-o', outputPath, '--print-json', '--', url);
    return flags;
}

function buildYtdlpVideoFlags(outputPath, url) {
    const flags = ['--no-playlist', '--no-exec', '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'];
    const cookiesPath = config.ytdlpCookiesPath;
    if (cookiesPath && fs.existsSync(cookiesPath)) {
        flags.push('--cookies', cookiesPath);
    }
    if (Array.isArray(config.ytdlpExtraFlags)) {
        flags.push(...config.ytdlpExtraFlags.filter(f => typeof f === 'string' && !f.includes('exec')));
    }
    flags.push('-o', outputPath, '--print-json', '--', url);
    return flags;
}

function isUserBusy(userId) {
    return activeUserProcesses.has(userId);
}

function lockUser(userId) {
    activeUserProcesses.add(userId);
}

function unlockUser(userId) {
    activeUserProcesses.delete(userId);
}

function canBypass(userId) {
    return config.isOwner(userId);
}

function getMemoryUsagePercent() {
    const total = os.totalmem();
    const free = os.freemem();
    return ((total - free) / total) * 100;
}

function parseMetadata(stdout, fallbackId) {
    let videoMetadata = {};
    try {
        const jsonLineMatch = stdout.match(/^\{.*\}$/ms);
        if (jsonLineMatch) {
            videoMetadata = JSON.parse(jsonLineMatch[0]);
        } else {
            const titleMatch = stdout.match(/\[ExtractAudio\] Destination: .*? - (.+?)\./);
            if (titleMatch && titleMatch[1]) {
                videoMetadata.title = titleMatch[1].trim();
            } else {
                videoMetadata.title = `Media_${fallbackId}`;
            }
        }
    } catch (parseError) {
        videoMetadata.title = `Media_${fallbackId}`;
    }
    if (!videoMetadata.title) videoMetadata.title = `Media_${fallbackId}`;
    return videoMetadata;
}

function extractVideoId(url, platform) {
    let rawId = '';
    let match;
    switch (platform) {
        case 'youtube_shorts':
            match = url.match(YOUTUBE_SHORTS_REGEX);
            rawId = match ? match[1] : '';
            break;
        case 'youtube_music':
            match = url.match(YOUTUBE_MUSIC_REGEX);
            rawId = match ? match[1] : '';
            break;
        case 'youtube':
            match = url.match(YOUTUBE_VIDEO_REGEX);
            rawId = match ? match[1] : '';
            break;
        case 'instagram':
            match = url.match(INSTAGRAM_REGEX);
            rawId = match ? match[1] : '';
            break;
        case 'twitter':
            match = url.match(TWITTER_REGEX);
            rawId = match ? match[1] : '';
            break;
        case 'tiktok':
            rawId = crypto.randomUUID().slice(0, 8);
            break;
        default:
            rawId = crypto.randomUUID().slice(0, 8);
            break;
    }
    const cleanId = (rawId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return cleanId && cleanId.length > 0 ? cleanId.slice(0, 32) : crypto.randomUUID().slice(0, 8);
}

async function downloadTikTokMedia(url, isAudioOnly, targetFilePath) {
    let metadata = { title: 'TikTok Video' };

    try {
        const form = new URLSearchParams({ url, hd: '1' });
        const res = await axios.post('https://www.tikwm.com/api/', form, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 12000
        });

        if (res.data?.code === 0 && res.data?.data) {
            const data = res.data.data;
            metadata.title = data.title || data.desc || 'TikTok Video';
            const mediaUrl = (isAudioOnly && data.music) ? data.music : (data.play || data.wmplay);

            if (mediaUrl) {
                const downloadRes = await axios.get(mediaUrl, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });

                if (isAudioOnly && !mediaUrl.includes('audio_mpeg') && !mediaUrl.endsWith('.mp3')) {
                    const tempRawPath = targetFilePath + '.tmp';
                    await fs.promises.writeFile(tempRawPath, Buffer.from(downloadRes.data));
                    try {
                        await new Promise((resolve, reject) => {
                            const proc = spawn('ffmpeg', ['-y', '-i', tempRawPath, '-vn', '-ab', '192k', '-ar', '44100', targetFilePath]);
                            proc.on('close', (code) => {
                                if (code !== 0) return reject(new Error(`ffmpeg falhou com código ${code}`));
                                resolve();
                            });
                            proc.on('error', (err) => {
                                reject(err);
                            });
                        });
                    } finally {
                        try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
                    }
                } else {
                    await fs.promises.writeFile(targetFilePath, Buffer.from(downloadRes.data));
                }

                return { success: true, metadata };
            }
        }
    } catch (e) {}

    try {
        const res = await axios.post('https://api.tikmate.app/api/lookup', new URLSearchParams({ url }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 12000
        });

        if (res.data?.success && res.data?.token && res.data?.id) {
            metadata.title = res.data.desc || 'TikTok Video';
            const downloadUrl = `https://tikmate.app/download/${res.data.token}/${res.data.id}.mp4`;
            const downloadRes = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 35000
            });

            if (isAudioOnly) {
                const tempRawPath = targetFilePath + '.tmp.mp4';
                await fs.promises.writeFile(tempRawPath, Buffer.from(downloadRes.data));
                try {
                    await new Promise((resolve, reject) => {
                        const proc = spawn('ffmpeg', ['-y', '-i', tempRawPath, '-vn', '-ab', '192k', '-ar', '44100', targetFilePath]);
                        proc.on('close', (code) => {
                            if (code !== 0) return reject(new Error(`ffmpeg falhou com código ${code}`));
                            resolve();
                        });
                        proc.on('error', (err) => {
                            reject(err);
                        });
                    });
                } finally {
                    try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
                }
            } else {
                await fs.promises.writeFile(targetFilePath, Buffer.from(downloadRes.data));
            }

            return { success: true, metadata };
        }
    } catch (e) {}

    throw new Error('TIKTOK_FALLBACK_FAILED: Não foi possível obter o vídeo pelos provedores alternativos.');
}

async function downloadAudio(videoUrl, context = null) {
    return new Promise((resolve, reject) => {
        if (!isSafeUrl(videoUrl)) {
            const err = new Error("URL_INVALID: A URL fornecida contém caracteres inválidos.");
            logMediaAction('Download Áudio', 'desconhecido', videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
            return reject(err);
        }
        const platform = detectPlatform(videoUrl);
        if (!platform) {
            const err = new Error("URL_INVALID: A URL fornecida não é de uma plataforma suportada (YouTube, Instagram, TikTok ou Twitter/X).");
            logMediaAction('Download Áudio', platform, videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
            return reject(err);
        }
        if (YOUTUBE_PLAYLIST_REGEX.test(videoUrl)) {
            const err = new Error("PLAYLIST_DETECTED: O download de playlists não é suportado no momento. Por favor, forneça uma URL de vídeo individual.");
            logMediaAction('Download Áudio', platform, videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
            return reject(err);
        }

        const videoId = extractVideoId(videoUrl, platform);
        const tempOutputFilename = `${videoId}.mp3`;
        const tempOutputFilePath = path.join(TEMP_AUDIO_DIR, tempOutputFilename);

        const resolveAudioFile = (metadata) => {
            const sanitizedTitle = sanitizeFilenameForDiscord(metadata.title || `Media_${videoId}`);
            const finalFilePath = path.join(TEMP_AUDIO_DIR, `${sanitizedTitle}.mp3`);
            if (!path.resolve(finalFilePath).startsWith(path.resolve(TEMP_AUDIO_DIR))) {
                const err = new Error("PATH_SECURITY_ERROR: Caminho de arquivo temporário inválido.");
                logMediaAction('Download Áudio', platform, videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
                return reject(err);
            }
            const renameAndResolve = (src, dest) => {
                const sizeMB = (fs.statSync(src).size / (1024 * 1024)).toFixed(1);
                logMediaAction('Download Áudio', platform, videoUrl, context, 'Sucesso', `Título: "${metadata.title}" | Tamanho: ${sizeMB} MB`);
                resolve({ filePath: dest, metadata });
            };
            if (fs.existsSync(tempOutputFilePath)) {
                fs.rename(tempOutputFilePath, finalFilePath, (renameErr) => {
                    if (renameErr) {
                        renameAndResolve(tempOutputFilePath, tempOutputFilePath);
                    } else {
                        renameAndResolve(finalFilePath, finalFilePath);
                    }
                });
            } else {
                const err = new Error("O áudio não foi encontrado na pasta temporária após o download. Tente novamente ou com outro vídeo.");
                logMediaAction('Download Áudio', platform, videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
                reject(err);
            }
        };

        const runYtdlp = async () => {
            let processedUrl = videoUrl;
            if (platform === 'youtube_music') {
                const match = videoUrl.match(YOUTUBE_MUSIC_REGEX);
                if (match && match[1]) {
                    processedUrl = `https://www.youtube.com/watch?v=${match[1]}`;
                }
            } else if (platform === 'twitter') {
                processedUrl = normalizeTwitterUrl(videoUrl);
            }
            const args = buildYtdlpAudioFlags(tempOutputFilePath, processedUrl);
            logMediaAction('Download Áudio', platform, videoUrl, context, 'Iniciado');
            try {
                const { stdout } = await execYtdlp(args);
                const videoMetadata = parseMetadata(stdout, videoId);
                resolveAudioFile(videoMetadata);
            } catch (error) {
                try {
                    if (fs.existsSync(tempOutputFilePath)) {
                        fs.unlinkSync(tempOutputFilePath);
                    }
                    if (fs.existsSync(`${tempOutputFilePath}.part`)) {
                        fs.unlinkSync(`${tempOutputFilePath}.part`);
                    }
                } catch (_) {}
                const stdout = error.stdout || '';
                const stderr = error.stderr || '';
                console.error(`[MediaHandler] FALHA NO YT-DLP (Áudio):\nSTDOUT: ${stdout}\nSTDERR: ${stderr}\nERROR: ${error.message}`);
                let errObj = error;
                if (stderr.includes("Private video") || stdout.includes("Private video")) {
                    errObj = new Error("VIDEO_PRIVATE: Este vídeo é privado ou não está disponível.");
                } else if (stderr.includes("age-restricted") || stdout.includes("age-restricted")) {
                    errObj = new Error("VIDEO_AGE_RESTRICTED: Este vídeo é restrito por idade.");
                } else if (stderr.includes("No video could be found") || stdout.includes("No video could be found")) {
                    errObj = new Error("NO_MEDIA: Nenhum vídeo ou áudio encontrado nesta publicação do Twitter/X.");
                } else if (stderr.includes("requires authentication") || stdout.includes("requires authentication") || stderr.includes("account has been suspended") || stdout.includes("account has been suspended")) {
                    errObj = new Error("MEDIA_UNAVAILABLE: Esta publicação requer autenticação ou a conta foi suspensa.");
                } else if (stderr.includes("no appropriate format") || stdout.includes("no appropriate format")) {
                    errObj = new Error("FORMAT_UNAVAILABLE: Não foi encontrado um formato de áudio adequado.");
                } else {
                    errObj = new Error(`lib do ytdlp desatualizada, peça o <@${config.ownerId}> para atualizar na host`);
                }
                logMediaAction('Download Áudio', platform, videoUrl, context, 'Erro', `Detalhe: ${errObj.message}`);
                return reject(errObj);
            }
        };

        if (platform === 'tiktok') {
            logMediaAction('Download Áudio', platform, videoUrl, context, 'Iniciado (Fallback Nativo)');
            downloadTikTokMedia(videoUrl, true, tempOutputFilePath)
                .then((res) => {
                    resolveAudioFile(res.metadata);
                })
                .catch(() => {
                    runYtdlp();
                });
        } else {
            runYtdlp();
        }
    });
}

async function downloadVideo(videoUrl, context = null) {
    return new Promise((resolve, reject) => {
        if (!isSafeUrl(videoUrl)) {
            const err = new Error("URL_INVALID: A URL fornecida contém caracteres inválidos.");
            logMediaAction('Download Vídeo', 'desconhecido', videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
            return reject(err);
        }
        const platform = detectPlatform(videoUrl);
        if (!platform) {
            const err = new Error("URL_INVALID: A URL fornecida não é de uma plataforma suportada (YouTube Shorts, Instagram Reels, TikTok ou Twitter/X).");
            logMediaAction('Download Vídeo', platform, videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
            return reject(err);
        }
        if (platform === 'youtube' || platform === 'youtube_music') {
            const err = new Error("YOUTUBE_FULL_VIDEO: Para vídeos do YouTube, apenas Shorts são suportados para download de vídeo. Use /baixar_musica para extrair o áudio.");
            logMediaAction('Download Vídeo', platform, videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
            return reject(err);
        }
        if (YOUTUBE_PLAYLIST_REGEX.test(videoUrl)) {
            const err = new Error("PLAYLIST_DETECTED: O download de playlists não é suportado.");
            logMediaAction('Download Vídeo', platform, videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
            return reject(err);
        }

        const videoId = extractVideoId(videoUrl, platform);
        const tempOutputFilename = `${videoId}.mp4`;
        const tempOutputFilePath = path.join(TEMP_VIDEO_DIR, tempOutputFilename);

        const resolveVideoFile = (videoMetadata) => {
            const sanitizedTitle = sanitizeFilenameForDiscord(videoMetadata.title || `Media_${videoId}`);
            const possiblePaths = [
                tempOutputFilePath,
                tempOutputFilePath.replace('.mp4', '.webm'),
                tempOutputFilePath.replace('.mp4', '.mkv')
            ];
            let foundPath = possiblePaths.find(p => fs.existsSync(p));
            if (foundPath) {
                const finalFilePath = path.join(TEMP_VIDEO_DIR, `${sanitizedTitle}.mp4`);
                if (!path.resolve(finalFilePath).startsWith(path.resolve(TEMP_VIDEO_DIR))) {
                    const err = new Error("PATH_SECURITY_ERROR: Caminho de arquivo temporário inválido.");
                    logMediaAction('Download Vídeo', platform, videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
                    return reject(err);
                }
                if (foundPath !== finalFilePath) {
                    try {
                        fs.renameSync(foundPath, finalFilePath);
                        foundPath = finalFilePath;
                    } catch (e) {}
                }
                const fileSize = fs.statSync(foundPath).size;
                const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
                logMediaAction('Download Vídeo', platform, videoUrl, context, 'Sucesso', `Título: "${videoMetadata.title}" | Tamanho: ${sizeMB} MB`);
                resolve({ filePath: foundPath, metadata: videoMetadata, fileSize });
            } else {
                const err = new Error("O vídeo não foi encontrado na pasta temporária após o download. Tente novamente.");
                logMediaAction('Download Vídeo', platform, videoUrl, context, 'Erro', `Detalhe: ${err.message}`);
                reject(err);
            }
        };

        const runYtdlp = async () => {
            let processedUrl = videoUrl;
            if (platform === 'twitter') {
                processedUrl = normalizeTwitterUrl(videoUrl);
            }
            const args = buildYtdlpVideoFlags(tempOutputFilePath, processedUrl);
            logMediaAction('Download Vídeo', platform, videoUrl, context, 'Iniciado');
            try {
                const { stdout } = await execYtdlp(args);
                const videoMetadata = parseMetadata(stdout, videoId);
                resolveVideoFile(videoMetadata);
            } catch (error) {
                try {
                    const possibleCleanupPaths = [
                        tempOutputFilePath,
                        tempOutputFilePath.replace('.mp4', '.webm'),
                        tempOutputFilePath.replace('.mp4', '.mkv'),
                        `${tempOutputFilePath}.part`
                    ];
                    for (const p of possibleCleanupPaths) {
                        if (fs.existsSync(p)) fs.unlinkSync(p);
                    }
                } catch (_) {}
                const stdout = error.stdout || '';
                const stderr = error.stderr || '';
                console.error(`[MediaHandler] FALHA NO YT-DLP (Vídeo):\nSTDOUT: ${stdout}\nSTDERR: ${stderr}\nERROR: ${error.message}`);
                let errObj = error;
                if (stderr.includes("Private video") || stdout.includes("Private video")) {
                    errObj = new Error("VIDEO_PRIVATE: Este vídeo é privado ou não está disponível.");
                } else if (stderr.includes("age-restricted") || stdout.includes("age-restricted")) {
                    errObj = new Error("VIDEO_AGE_RESTRICTED: Este vídeo é restrito por idade.");
                } else if (stderr.includes("No video could be found") || stdout.includes("No video could be found")) {
                    errObj = new Error("NO_MEDIA: Nenhum vídeo ou áudio encontrado nesta publicação do Twitter/X.");
                } else if (stderr.includes("requires authentication") || stdout.includes("requires authentication") || stderr.includes("account has been suspended") || stdout.includes("account has been suspended")) {
                    errObj = new Error("MEDIA_UNAVAILABLE: Esta publicação requer autenticação ou a conta foi suspensa.");
                } else {
                    errObj = new Error(`lib do ytdlp desatualizada, peça o <@${config.ownerId}> para atualizar na host`);
                }
                logMediaAction('Download Vídeo', platform, videoUrl, context, 'Erro', `Detalhe: ${errObj.message}`);
                return reject(errObj);
            }
        };

        if (platform === 'tiktok') {
            logMediaAction('Download Vídeo', platform, videoUrl, context, 'Iniciado (Fallback Nativo)');
            downloadTikTokMedia(videoUrl, false, tempOutputFilePath)
                .then((res) => {
                    resolveVideoFile(res.metadata);
                })
                .catch(() => {
                    runYtdlp();
                });
        } else {
            runYtdlp();
        }
    });
}

function storeVideoForCompression(filePath) {
    const fileId = crypto.randomUUID().slice(0, 12);
    pendingVideoFiles.set(fileId, { filePath, createdAt: Date.now() });

    setTimeout(() => {
        const entry = pendingVideoFiles.get(fileId);
        if (entry) {
            pendingVideoFiles.delete(fileId);
            try {
                if (fs.existsSync(entry.filePath)) fs.unlinkSync(entry.filePath);
            } catch (e) {}
            console.log(`[MediaHandler] Arquivo expirado removido: ${fileId}`);
        }
    }, 6 * 60 * 60 * 1000);

    return fileId;
}

function getPendingVideo(fileId) {
    return pendingVideoFiles.get(fileId);
}

function removePendingVideo(fileId) {
    const entry = pendingVideoFiles.get(fileId);
    if (entry) {
        pendingVideoFiles.delete(fileId);
        try {
            if (fs.existsSync(entry.filePath)) fs.unlinkSync(entry.filePath);
        } catch (e) {}
    }
}

async function compressVideo(inputPath, attachmentLimit) {
    return new Promise((resolve, reject) => {
        if (!path.resolve(inputPath).startsWith(path.resolve(TEMP_VIDEO_DIR))) {
            return reject(new Error("PATH_SECURITY_ERROR: Caminho de entrada inválido."));
        }
        const outputPath = inputPath.replace(/\.[^.]+$/, '_compressed.mp4');
        if (!path.resolve(outputPath).startsWith(path.resolve(TEMP_VIDEO_DIR))) {
            return reject(new Error("PATH_SECURITY_ERROR: Caminho de saída inválido."));
        }
        const targetBytes = Math.floor(attachmentLimit * 0.95);
        const fileStat = fs.statSync(inputPath);
        const durationEstimate = Math.max(30, Math.min(300, fileStat.size / 500000));
        const targetBitrate = Math.floor((targetBytes * 8) / durationEstimate / 1000);
        const videoBitrate = Math.max(200, Math.min(targetBitrate - 64, 2000));

        const ffmpegArgs = [
            '-i', inputPath,
            '-vf', 'scale=-2:480',
            '-vcodec', 'libx264',
            '-crf', '28',
            '-preset', 'faster',
            '-acodec', 'aac',
            '-b:a', '64k',
            '-threads', '1',
            '-y',
            outputPath
        ];

        console.log(`[MediaHandler] Comprimindo: ffmpeg ${ffmpegArgs.join(' ')}`);
        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
        let killed = false;

        const memoryMonitor = setInterval(() => {
            const usage = getMemoryUsagePercent();
            if (usage > 95) {
                killed = true;
                ffmpegProcess.kill('SIGKILL');
                clearInterval(memoryMonitor);
                console.error(`[MediaHandler] FFmpeg KILLED - RAM em ${usage.toFixed(1)}%`);
            }
        }, 1000);

        ffmpegProcess.on('close', (code) => {
            clearInterval(memoryMonitor);
            if (killed) {
                try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}
                return reject(new Error(`MEMORY_ERROR`));
            }
            if (code !== 0) {
                try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}
                return reject(new Error(`FFmpeg falhou com código ${code}`));
            }
            if (!fs.existsSync(outputPath)) {
                return reject(new Error("Arquivo comprimido não encontrado após processamento."));
            }
            const compressedSize = fs.statSync(outputPath).size;
            if (compressedSize > attachmentLimit) {
                try { fs.unlinkSync(outputPath); } catch (e) {}
                return reject(new Error("STILL_TOO_LARGE: O vídeo continua muito grande mesmo após compressão. Tente um vídeo mais curto."));
            }
            resolve({ filePath: outputPath, fileSize: compressedSize });
        });

        ffmpegProcess.on('error', (err) => {
            clearInterval(memoryMonitor);
            reject(new Error(`Erro ao iniciar FFmpeg: ${err.message}`));
        });
    });
}

async function processCompressionQueue() {
    if (isCompressing || compressionQueue.length === 0) return;
    isCompressing = true;
    const task = compressionQueue.shift();

    try {
        const result = await compressVideo(task.inputPath, task.attachmentLimit);
        task.resolve(result);
    } catch (error) {
        task.reject(error);
    } finally {
        isCompressing = false;
        processCompressionQueue();
    }
}

function enqueueCompression(inputPath, attachmentLimit, userId) {
    if (canBypass(userId)) {
        return compressVideo(inputPath, attachmentLimit);
    }

    return new Promise((resolve, reject) => {
        compressionQueue.push({ inputPath, attachmentLimit, userId, resolve, reject });
        processCompressionQueue();
    });
}

function getCompressionQueuePosition(userId) {
    const idx = compressionQueue.findIndex(t => t.userId === userId);
    return idx === -1 ? compressionQueue.length : idx;
}

function isCompressionActive() {
    return isCompressing;
}

function unlockAllUsers() {
    const count = activeUserProcesses.size;
    activeUserProcesses.clear();
    return count;
}

module.exports = {
    downloadAudio,
    downloadVideo,
    sanitizeFilenameForDiscord,
    detectPlatform,
    isUserBusy,
    lockUser,
    unlockUser,
    unlockAllUsers,
    canBypass,
    storeVideoForCompression,
    getPendingVideo,
    removePendingVideo,
    enqueueCompression,
    getCompressionQueuePosition,
    isCompressionActive,
    getMemoryUsagePercent,
    logCompressionAction,
    formatVideoSuccessMessage,
    YOUTUBE_SHORTS_REGEX,
    INSTAGRAM_REGEX,
    TIKTOK_REGEX,
    TWITTER_REGEX
};