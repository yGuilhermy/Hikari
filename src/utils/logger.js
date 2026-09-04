const axios = require('axios');
const util = require('util');

const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    gray: '\x1b[90m',
    red: '\x1b[91m',
    redBold: '\x1b[91;1m',
    green: '\x1b[92m',
    greenBold: '\x1b[92;1m',
    yellow: '\x1b[93m',
    yellowBold: '\x1b[93;1m',
    blue: '\x1b[94m',
    blueBold: '\x1b[94;1m',
    magenta: '\x1b[95m',
    magentaBold: '\x1b[95;1m',
    cyan: '\x1b[96m',
    cyanBold: '\x1b[96;1m',
    white: '\x1b[97m',
    whiteBold: '\x1b[97;1m'
};

const DISCORD_ANSI = {
    reset: '\u001b[0m',
    bold: '\u001b[1m',
    gray: '\u001b[0;30m',
    red: '\u001b[1;31m',
    green: '\u001b[1;32m',
    yellow: '\u001b[1;33m',
    blue: '\u001b[1;34m',
    pink: '\u001b[1;35m',
    cyan: '\u001b[1;36m',
    white: '\u001b[0;37m'
};

const CATEGORIES = {
    HISTORICO: {
        tag: 'HISTORICO',
        termColor: ANSI.magentaBold,
        discColor: DISCORD_ANSI.pink
    },
    SYSTEM: {
        tag: 'SYSTEM',
        termColor: ANSI.cyanBold,
        discColor: DISCORD_ANSI.cyan
    },
    DISCORD: {
        tag: 'DISCORD',
        termColor: ANSI.blueBold,
        discColor: DISCORD_ANSI.blue
    },
    COMMAND: {
        tag: 'COMMAND',
        termColor: ANSI.greenBold,
        discColor: DISCORD_ANSI.green
    },
    AI: {
        tag: 'AI/LLM',
        termColor: ANSI.magentaBold,
        discColor: DISCORD_ANSI.pink
    },
    VOICE: {
        tag: 'VOICE',
        termColor: ANSI.cyan,
        discColor: DISCORD_ANSI.cyan
    },
    MUSIC: {
        tag: 'MUSIC',
        termColor: ANSI.magenta,
        discColor: DISCORD_ANSI.pink
    },
    SECURITY: {
        tag: 'SECURITY',
        termColor: ANSI.yellowBold,
        discColor: DISCORD_ANSI.yellow
    },
    SEARCH: {
        tag: 'SEARCH',
        termColor: ANSI.blue,
        discColor: DISCORD_ANSI.blue
    },
    WARN: {
        tag: 'WARN',
        termColor: ANSI.yellowBold,
        discColor: DISCORD_ANSI.yellow
    },
    ERROR: {
        tag: 'ERROR',
        termColor: ANSI.redBold,
        discColor: DISCORD_ANSI.red
    },
    INFO: {
        tag: 'INFO',
        termColor: ANSI.white,
        discColor: DISCORD_ANSI.white
    }
};

let webhookUrl = null;
let logQueue = [];
let flushTimeout = null;
let isFlushing = false;
let isHooked = false;

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

function getTimeString() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function cleanString(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
}

function cleanLegacyTags(text) {
    return text
        .replace(/^\[(LOG|EVENT|SECURITY|STT|STARTUP|HISTORY|HISTORICO|VOICE|ERROR|WARN|INFO)\]\s*/i, '')
        .trim();
}

function detectCategory(rawText) {
    const upper = rawText.toUpperCase();
    if (upper.includes('[HISTORICO]') || upper.includes('PROMPT IA:') || upper.includes('RESPOSTA IA:') || upper.includes('HISTÓRICO') || upper.includes('HISTORICO')) {
        return CATEGORIES.HISTORICO;
    }
    if (upper.includes('[SECURITY]') || upper.includes('BANIDO') || upper.includes('DESBAN') || upper.includes('AUTOMOD') || upper.includes('RESTRICT')) {
        return CATEGORIES.SECURITY;
    }
    if (upper.includes('[RADIOVOICE]') || upper.includes('[RADIOMCP]') || upper.includes('[RADIOPROVIDERS]') || upper.includes('[DEEZER]') || upper.includes('RADIO') || upper.includes('YOUTUBE')) {
        return CATEGORIES.MUSIC;
    }
    if (upper.includes('[STT]') || upper.includes('[VOICE]') || upper.includes('CALL') || upper.includes('TRANSCRI')) {
        return CATEGORIES.VOICE;
    }
    if (upper.includes('[MCP]') || upper.includes('[STRIPTHINKING]') || upper.includes('[IMAGE') || upper.includes('GEMINI') || upper.includes('LLM')) {
        return CATEGORIES.AI;
    }
    if (upper.includes('[🔎') || upper.includes('[LEITURA]') || upper.includes('[BRAVE]') || upper.includes('[DUCK]') || upper.includes('[BUSCA]') || upper.includes('SCRAPER')) {
        return CATEGORIES.SEARCH;
    }
    if (upper.includes('[LOG] SLASH:') || upper.includes('SLASH:') || upper.includes('COMANDO:')) {
        return CATEGORIES.COMMAND;
    }
    if (upper.includes('[EVENT]') || upper.includes('GUILD') || upper.includes('SERVIDOR')) {
        return CATEGORIES.DISCORD;
    }
    if (upper.includes('[STARTUP]') || upper.includes('LOGADO COMO') || upper.includes('INICIANDO REGISTRO') || upper.includes('COMANDOS REGISTRADOS')) {
        return CATEGORIES.SYSTEM;
    }
    return CATEGORIES.INFO;
}

function printToTerminal(item) {
    const timeFormatted = `${ANSI.white}[${item.time}]${ANSI.reset}`;
    const tagFormatted = `${item.category.termColor}[${item.category.tag.padEnd(9)}]${ANSI.reset}`;
    const levelFormatted = item.level === 'ERROR' ? `${ANSI.redBold}[ERR]${ANSI.reset} ` : item.level === 'WARN' ? `${ANSI.yellowBold}[WRN]${ANSI.reset} ` : '';
    const output = `${timeFormatted} ${tagFormatted} ${levelFormatted}${item.text}\n`;
    originalStdoutWrite(output);

    if (item.errorStack) {
        originalStderrWrite(`${ANSI.red}${item.errorStack}${ANSI.reset}\n`);
    }
}

function enqueueLog(category, level, text, errorStack = null) {
    const time = getTimeString();
    const item = { time, category, level, text, errorStack };

    printToTerminal(item);

    if (!webhookUrl) return;

    logQueue.push(item);

    if (level === 'ERROR' || level === 'FATAL') {
        if (flushTimeout) {
            clearTimeout(flushTimeout);
            flushTimeout = null;
        }
        flushLogsToWebhook();
    } else if (!flushTimeout) {
        flushTimeout = setTimeout(flushLogsToWebhook, 3500);
    }
}

function splitIntoDiscordChunks(lines, maxLen = 1850) {
    const chunks = [];
    let current = '';
    for (const line of lines) {
        if ((current ? current + '\n' + line : line).length > maxLen) {
            if (current) chunks.push(current);
            if (line.length > maxLen) {
                let remaining = line;
                while (remaining.length > maxLen) {
                    chunks.push(remaining.substring(0, maxLen));
                    remaining = remaining.substring(maxLen);
                }
                current = remaining;
            } else {
                current = line;
            }
        } else {
            current = current ? current + '\n' + line : line;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

async function flushLogsToWebhook() {
    flushTimeout = null;
    if (isFlushing || !logQueue.length || !webhookUrl) return;
    isFlushing = true;

    const batch = logQueue.splice(0, 15);

    try {
        const discordLines = [];

        for (const log of batch) {
            const timePart = `${DISCORD_ANSI.white}[${log.time}]${DISCORD_ANSI.reset}`;
            const tagPart = `${log.category.discColor}[${log.category.tag.padEnd(9)}]${DISCORD_ANSI.reset}`;
            const msgPart = log.level === 'ERROR' ? `${DISCORD_ANSI.red}${log.text}${DISCORD_ANSI.reset}` : `${DISCORD_ANSI.white}${log.text}${DISCORD_ANSI.reset}`;

            discordLines.push(`${timePart} ${tagPart} ${msgPart}`);

            if (log.errorStack) {
                discordLines.push(`${DISCORD_ANSI.red}${log.errorStack}${DISCORD_ANSI.reset}`);
            }
        }

        const chunks = splitIntoDiscordChunks(discordLines);

        for (const chunk of chunks) {
            await axios.post(webhookUrl, {
                content: `\`\`\`ansi\n${chunk}\n\`\`\``
            }, { timeout: 8000 });
        }

    } catch (e) {
        if (e.response && e.response.status === 429) {
            const retryAfter = (e.response.data?.retry_after || 5) * 1000;
            setTimeout(flushLogsToWebhook, retryAfter);
            isFlushing = false;
            return;
        }
    } finally {
        isFlushing = false;
        if (logQueue.length > 0 && !flushTimeout) {
            flushTimeout = setTimeout(flushLogsToWebhook, 3500);
        }
    }
}

function hookConsole() {
    if (isHooked) return;
    isHooked = true;

    console.log = function (...args) {
        const formatted = util.format(...args);
        const clean = cleanString(formatted);
        if (!clean) return;
        const category = detectCategory(clean);
        const text = cleanLegacyTags(clean);
        enqueueLog(category, 'INFO', text);
    };

    console.info = function (...args) {
        const formatted = util.format(...args);
        const clean = cleanString(formatted);
        if (!clean) return;
        enqueueLog(CATEGORIES.INFO, 'INFO', cleanLegacyTags(clean));
    };

    console.warn = function (...args) {
        const formatted = util.format(...args);
        const clean = cleanString(formatted);
        if (!clean) return;
        enqueueLog(CATEGORIES.WARN, 'WARN', cleanLegacyTags(clean));
    };

    console.error = function (...args) {
        let errStack = null;
        const parts = [];
        for (const arg of args) {
            if (arg instanceof Error) {
                errStack = arg.stack || arg.message;
                parts.push(arg.message || String(arg));
            } else if (typeof arg === 'object' && arg !== null) {
                parts.push(util.inspect(arg, { depth: 2, colors: false }));
            } else {
                parts.push(String(arg));
            }
        }
        const clean = cleanString(parts.join(' '));
        if (!clean && !errStack) return;
        enqueueLog(CATEGORIES.ERROR, 'ERROR', cleanLegacyTags(clean) || 'Erro capturado', errStack);
    };
}

function init(url) {
    if (url && typeof url === 'string' && url.startsWith('http')) {
        webhookUrl = url;
    }
    hookConsole();
    logger.system('Logger centralizado inicializado com sucesso.');
}

const logger = {
    init,
    CATEGORIES,

    system(message, meta) {
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(CATEGORIES.SYSTEM, 'INFO', text);
    },

    discord(message, meta) {
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(CATEGORIES.DISCORD, 'INFO', text);
    },

    command(name, userTag, location, details) {
        const detailStr = details ? ` | ${typeof details === 'object' ? JSON.stringify(details) : details}` : '';
        const text = `/${name} • ${userTag} @ ${location}${detailStr}`;
        enqueueLog(CATEGORIES.COMMAND, 'INFO', text);
    },

    ai(message, meta) {
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(CATEGORIES.AI, 'INFO', text);
    },

    historico(message, meta) {
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(CATEGORIES.HISTORICO, 'INFO', text);
    },

    voice(message, meta) {
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(CATEGORIES.VOICE, 'INFO', text);
    },

    music(message, meta) {
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(CATEGORIES.MUSIC, 'INFO', text);
    },

    security(message, meta) {
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(CATEGORIES.SECURITY, 'WARN', text);
    },

    search(message, meta) {
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(CATEGORIES.SEARCH, 'INFO', text);
    },

    info(categoryName, message, meta) {
        const cat = CATEGORIES[String(categoryName).toUpperCase()] || CATEGORIES.INFO;
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(cat, 'INFO', text);
    },

    success(categoryName, message, meta) {
        const cat = CATEGORIES[String(categoryName).toUpperCase()] || CATEGORIES.COMMAND;
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(cat, 'INFO', text);
    },

    warn(categoryName, message, meta) {
        const cat = CATEGORIES[String(categoryName).toUpperCase()] || CATEGORIES.WARN;
        const text = meta ? `${message} ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : message;
        enqueueLog(cat, 'WARN', text);
    },

    error(categoryName, message, error) {
        const cat = CATEGORIES[String(categoryName).toUpperCase()] || CATEGORIES.ERROR;
        let stack = null;
        let msg = message;
        if (error instanceof Error) {
            stack = error.stack;
            msg = `${message}: ${error.message}`;
        } else if (error) {
            msg = `${message}: ${typeof error === 'object' ? JSON.stringify(error) : error}`;
        }
        enqueueLog(cat, 'ERROR', msg, stack);
    }
};

function hookConsoleAndStreams(url) {
    init(url);
}

module.exports = {
    logger,
    init,
    hookConsoleAndStreams
};