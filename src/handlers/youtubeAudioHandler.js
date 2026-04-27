const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const TEMP_AUDIO_DIR = path.join(__dirname, '../data/temp_audio');
if (!fs.existsSync(TEMP_AUDIO_DIR)) {
    fs.mkdirSync(TEMP_AUDIO_DIR, { recursive: true });
}
const YOUTUBE_VIDEO_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11,})(?:\S+)?$/;
const YOUTUBE_MUSIC_REGEX = /^(?:https?:\/\/)?(?:www\.)?music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11,})(?:\S+)?$/;
const YOUTUBE_PLAYLIST_REGEX = /(?:youtube\.com|youtu\.be)\/playlist\?list=|youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11,}&list=([a-zA-Z0-9_-]+)|music\.youtube\.com\/playlist\?list=|music\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11,}&list=/;
function sanitizeFilenameForDiscord(filename) {
    let sanitized = filename.replace(/[<>:"/\\|?*`!,]/g, '');
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    const MAX_FILENAME_LENGTH = 100;
    if (sanitized.length > MAX_FILENAME_LENGTH) {
        const lastSpace = sanitized.lastIndexOf(' ', MAX_FILENAME_LENGTH);
        sanitized = sanitized.substring(0, lastSpace > 0 ? lastSpace : MAX_FILENAME_LENGTH);
    }
    return sanitized;
}
function buildYtdlpFlags(outputPath, url) {
    const flags = ['--no-playlist', '-x', '--audio-format', 'mp3'];
    const cookiesPath = config.ytdlpCookiesPath;
    if (cookiesPath && fs.existsSync(cookiesPath)) {
        flags.push('--cookies', `"${cookiesPath}"`);
        console.log(`[YouTubeAudioHandler] Usando cookies: ${cookiesPath}`);
    }
    flags.push(...config.ytdlpExtraFlags);
    flags.push('-o', `"${outputPath}"`, '--print-json', `"${url}"`);
    return flags.join(' ');
}
async function downloadYouTubeAudio(videoUrl) {
    return new Promise((resolve, reject) => {
        let processedUrl = videoUrl;
        let videoId = null;
        if (YOUTUBE_PLAYLIST_REGEX.test(videoUrl)) {
            return reject(new Error("PLAYLIST_DETECTED: O download de playlists não é suportado no momento. Por favor, forneça uma URL de vídeo individual."));
        }
        const musicMatch = videoUrl.match(YOUTUBE_MUSIC_REGEX);
        if (musicMatch && musicMatch[1]) {
            videoId = musicMatch[1];
            processedUrl = `https://www.youtube.com/watch?v=${videoId}`;
            console.log(`[YouTubeAudioHandler] URL do YouTube Music convertida para: ${processedUrl}`);
        } else {
            const videoMatch = videoUrl.match(YOUTUBE_VIDEO_REGEX);
            if (videoMatch && videoMatch[1]) {
                videoId = videoMatch[1];
            }
        }
        if (!videoId || !YOUTUBE_VIDEO_REGEX.test(processedUrl)) {
            return reject(new Error("URL_INVALID: A URL fornecida não é um link de vídeo do YouTube válido. Por favor, verifique e tente novamente."));
        }
        const tempOutputFilename = `${videoId}.mp3`;
        const tempOutputFilePath = path.join(TEMP_AUDIO_DIR, tempOutputFilename);
        const command = `yt-dlp ${buildYtdlpFlags(tempOutputFilePath, processedUrl)}`;
        console.log(`[YouTubeAudioHandler] Executando comando: ${command}`);
        const childProcess = exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[YouTubeAudioHandler] Erro na execução do yt-dlp: ${error.message}`);
                console.error(`[YouTubeAudioHandler] yt-dlp stdout: ${stdout}`);
                console.error(`[YouTubeAudioHandler] yt-dlp stderr: ${stderr}`);
                if (stderr.includes("Private video") || stdout.includes("Private video")) {
                    return reject(new Error("VIDEO_PRIVATE: Este vídeo é privado ou não está disponível."));
                }
                if (stderr.includes("age-restricted") || stdout.includes("age-restricted")) {
                    return reject(new Error("VIDEO_AGE_RESTRICTED: Este vídeo é restrito por idade."));
                }
                if (stderr.includes("no appropriate format") || stdout.includes("no appropriate format")) {
                    return reject(new Error("FORMAT_UNAVAILABLE: Não foi encontrado um formato de áudio adequado para este vídeo."));
                }
                return reject(new Error(`Falha ao baixar o áudio: ${stderr || stdout || error.message}`));
            }
            let videoMetadata = {};
            try {
                const jsonLineMatch = stdout.match(/^{.*}$/ms);
                if (jsonLineMatch) {
                    videoMetadata = JSON.parse(jsonLineMatch[0]);
                } else {
                    console.warn('[YouTubeAudioHandler] Não foi possível encontrar a linha JSON completa no stdout do yt-dlp. Tentando extrair título de outras formas.');
                    const titleMatch = stdout.match(/\[ExtractAudio\] Destination: .*? - (.+?)\./);
                    if (titleMatch && titleMatch[1]) {
                        videoMetadata.title = titleMatch[1].trim();
                    } else {
                        videoMetadata.title = `Audio_${videoId}`;
                    }
                }
            } catch (parseError) {
                console.error('[YouTubeAudioHandler] Erro ao parsear JSON do yt-dlp:', parseError);
                videoMetadata.title = `Audio_${videoId}`;
            }
            if (!videoMetadata.title) {
                videoMetadata.title = `Audio_${videoId}`;
            }
            const sanitizedTitle = sanitizeFilenameForDiscord(videoMetadata.title);
            const finalFilePath = path.join(TEMP_AUDIO_DIR, `${sanitizedTitle}.mp3`);
            if (fs.existsSync(tempOutputFilePath)) {
                fs.rename(tempOutputFilePath, finalFilePath, (renameErr) => {
                    if (renameErr) {
                        console.error(`[YouTubeAudioHandler] Erro ao renomear arquivo de ${tempOutputFilePath} para ${finalFilePath}:`, renameErr);
                        console.warn(`[YouTubeAudioHandler] Enviando arquivo com nome temporário: ${tempOutputFilePath}`);
                        resolve({ filePath: tempOutputFilePath, metadata: videoMetadata });
                    } else {
                        console.log(`[YouTubeAudioHandler] Áudio baixado e renomeado com sucesso: ${finalFilePath}`);
                        resolve({ filePath: finalFilePath, metadata: videoMetadata });
                    }
                });
            } else {
                reject(new Error("Aviso! O áudio do seu vídeo não foi encontrado na pasta temporária após o download. (Isso pode acontecer por problemas de rede, vídeo indisponível, ou yt-dlp não salvando o arquivo corretamente). Tente novamente ou com outro vídeo."));
            }
        });
    });
}
module.exports = { downloadYouTubeAudio, sanitizeFilenameForDiscord };