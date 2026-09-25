const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });
const botToken = process.env.DISCORD_TOKEN;

const BASE_URL = 'https://discord.com/api/v10';
const DEFAULT_CHANNEL_ID = process.env.DEFAULT_CHANNEL_ID || process.env.HIKARI_LOGS_CHANNEL_ID;

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
  AI: {
    tag: 'AI/LLM   ',
    color: DISCORD_ANSI.pink
  },
  TOOL: {
    tag: 'MCP/TOOL ',
    color: DISCORD_ANSI.cyan
  },
  IMAGE: {
    tag: 'IMAGE/GEN',
    color: DISCORD_ANSI.green
  },
  VISION: {
    tag: 'VISION   ',
    color: DISCORD_ANSI.cyan
  },
  VOICE: {
    tag: 'VOICE    ',
    color: DISCORD_ANSI.blue
  },
  MEDIA: {
    tag: 'MEDIA/DL ',
    color: DISCORD_ANSI.green
  },
  SYSTEM: {
    tag: 'SYSTEM   ',
    color: DISCORD_ANSI.cyan
  },
  WARN: {
    tag: 'WARN     ',
    color: DISCORD_ANSI.yellow
  },
  ERROR: {
    tag: 'ERROR    ',
    color: DISCORD_ANSI.red
  }
};

let queue = [];
let flushTimeout = null;
let isFlushing = false;
let clientInstance = null;
let targetChannelId = DEFAULT_CHANNEL_ID;

function getTimeString() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function sanitize(text) {
  if (typeof text !== 'string') text = String(text || '');
  return text
    .replace(/```/g, '`\u200b`\u200b`')
    .replace(/<@!?\d+>/g, '[USER]')
    .replace(/<@&\d+>/g, '[ROLE]')
    .replace(/<#\d+>/g, '[CHANNEL]')
    .replace(/\b\d{17,20}\b/g, '[ID_REDACTED]')
    .replace(/[a-zA-Z0-9_\-]{24,}\.[a-zA-Z0-9_\-]{6,}\.[a-zA-Z0-9_\-]{27,}/g, '[TOKEN_REDACTED]')
    .replace(/[A-Za-z]:\\[^ \n\r\t]+/g, '[PATH]')
    .replace(/\/[a-zA-Z0-9_\-./]+/g, '[PATH]')
    .trim();
}

function formatDuration(ms) {
  if (!ms || typeof ms !== 'number') return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function enqueue(category, text, isImmediate = false) {
  const time = getTimeString();
  const timePart = `${DISCORD_ANSI.gray}[${time}]${DISCORD_ANSI.reset}`;
  const tagPart = `${category.color}[${category.tag}]${DISCORD_ANSI.reset}`;
  const msgPart = `${DISCORD_ANSI.white}${text}${DISCORD_ANSI.reset}`;
  const line = `${timePart} ${tagPart} ${msgPart}`;

  queue.push(line);

  if (isImmediate) {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    flush();
  } else if (!flushTimeout) {
    flushTimeout = setTimeout(flush, 3500);
  }
}

function splitChunks(lines, maxLen = 1800) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if ((current ? current + '\n' + line : line).length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendToDiscord(content) {
  const ch = clientInstance?.channels?.cache?.get(targetChannelId);
  if (ch && typeof ch.send === 'function') {
    return await ch.send({ content }).catch(() => null);
  }

  const token = botToken || process.env.DISCORD_TOKEN;
  if (!token) return;

  await fetch(`${BASE_URL}/channels/${targetChannelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  }).catch(() => null);
}

async function flush() {
  flushTimeout = null;
  if (isFlushing || queue.length === 0) return;
  isFlushing = true;

  const batch = queue.splice(0, 20);
  try {
    const chunks = splitChunks(batch);
    for (const chunk of chunks) {
      await sendToDiscord(`\`\`\`ansi\n${chunk}\n\`\`\``);
    }
  } catch (err) {
  } finally {
    isFlushing = false;
    if (queue.length > 0 && !flushTimeout) {
      flushTimeout = setTimeout(flush, 3500);
    }
  }
}

function init(client, channelId = DEFAULT_CHANNEL_ID) {
  if (client) clientInstance = client;
  if (channelId) targetChannelId = channelId;
  system({
    component: 'TelemetryEngine',
    action: 'ONLINE',
    status: 'Canal de telemetria conectado'
  });
}

function ai({ model, durationMs, tokens, isStream = false }) {
  const modelStr = sanitize(model || 'Auto');
  const durStr = formatDuration(durationMs);
  let tokensStr = 'Tokens: N/A';
  if (tokens && typeof tokens === 'object') {
    const total = tokens.total || ((tokens.prompt || 0) + (tokens.completion || 0));
    tokensStr = `Tokens: ${total} (in: ${tokens.prompt || 0}, out: ${tokens.completion || 0})`;
  } else if (typeof tokens === 'number') {
    tokensStr = `Tokens: ${tokens}`;
  }
  const streamStr = isStream ? ' • Stream: Sim' : '';
  const text = `Modelo: ${modelStr} • Latência: ${durStr} • ${tokensStr}${streamStr}`;
  enqueue(CATEGORIES.AI, text);
}

function image({ model, provider, width, height, durationMs, status = 'OK' }) {
  const modelStr = sanitize(model || 'FLUX');
  const provStr = sanitize(provider || 'Auto');
  const durStr = formatDuration(durationMs);
  const resStr = width && height ? `${width}x${height}` : '1024x1024';
  const text = `Modelo: ${modelStr} • Provedor: ${provStr} • Res: ${resStr} • Latência: ${durStr} • Status: ${status}`;
  enqueue(CATEGORIES.IMAGE, text);
}

function vision({ durationMs, status = 'OK' }) {
  const durStr = formatDuration(durationMs);
  const text = `Análise visual de imagem • Latência: ${durStr} • Status: ${status}`;
  enqueue(CATEGORIES.VISION, text);
}

function tool(arg) {
  let name = 'tool';
  let durationMs = null;
  let status = 'OK';
  if (typeof arg === 'string') {
    name = arg;
  } else if (arg && typeof arg === 'object') {
    name = arg.name || arg.toolName || 'tool';
    durationMs = arg.durationMs || null;
    status = arg.status || 'OK';
  }
  const nameStr = sanitize(name);
  const durStr = durationMs ? ` • Tempo: ${formatDuration(durationMs)}` : '';
  const text = `Ferramenta MCP: ${nameStr} • Status: ${status}${durStr}`;
  enqueue(CATEGORIES.TOOL, text);
}

function voice({ action, durationMs, details } = {}) {
  const actStr = sanitize(action || 'VoiceAction');
  const durStr = durationMs ? ` • Tempo: ${formatDuration(durationMs)}` : '';
  const detStr = details ? ` • ${sanitize(details)}` : '';
  const text = `${actStr}${detStr}${durStr} • DAVE Protocol Ativo`;
  enqueue(CATEGORIES.VOICE, text);
}

function media({ type, durationMs, status = 'Concluído' } = {}) {
  const typeStr = sanitize(type || 'Download');
  const durStr = formatDuration(durationMs);
  const text = `Mídia: ${typeStr} • Status: ${status} • Tempo: ${durStr}`;
  enqueue(CATEGORIES.MEDIA, text);
}

function system(arg) {
  if (typeof arg === 'string') {
    enqueue(CATEGORIES.SYSTEM, sanitize(arg));
    return;
  }
  const compStr = sanitize(arg?.component || 'System');
  const actStr = sanitize(arg?.action || 'Event');
  const stStr = sanitize(arg?.status || 'OK');
  const text = `${compStr}: ${actStr} • ${stStr}`;
  enqueue(CATEGORIES.SYSTEM, text);
}

function warn(arg) {
  let catStr = 'Sistema';
  let msgStr = 'Aviso operacional';
  if (typeof arg === 'string') {
    msgStr = sanitize(arg);
  } else if (arg && typeof arg === 'object') {
    catStr = sanitize(arg.category || 'Sistema');
    msgStr = sanitize(arg.message || 'Aviso operacional');
  }
  const text = `[${catStr}] ${msgStr}`;
  enqueue(CATEGORIES.WARN, text);
}

function error(arg) {
  let catStr = 'Sistema';
  let msgStr = 'Erro capturado';
  if (typeof arg === 'string') {
    msgStr = sanitize(arg);
  } else if (arg && typeof arg === 'object') {
    catStr = sanitize(arg.category || 'Sistema');
    msgStr = sanitize(arg.message || 'Erro capturado');
  }
  const text = `[${catStr}] ${msgStr}`;
  enqueue(CATEGORIES.ERROR, text, true);
}

module.exports = {
  init,
  ai,
  image,
  vision,
  tool,
  voice,
  media,
  system,
  warn,
  error,
  flush
};
