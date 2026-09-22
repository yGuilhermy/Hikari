const { EmbedBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');
const config = require('../config');

let isGlobalPaused = false;

function isBotPaused() {
    return isGlobalPaused;
}

function setBotPaused(val) {
    isGlobalPaused = Boolean(val);
}

async function handleStop(message, client) {
    if (isGlobalPaused) {
        return message.reply({
            content: '⏸️ **A Hikari já está pausada globalmente.** Envie `-hstart` para reativar.'
        }).catch(() => {});
    }

    isGlobalPaused = true;

    try {
        const { abortCurrentGeneration, clearProcessingQueue } = require('./llmHandler');
        if (typeof abortCurrentGeneration === 'function') abortCurrentGeneration();
        if (typeof clearProcessingQueue === 'function') clearProcessingQueue();
    } catch (_) {}

    try {
        const { unlockAllUsers } = require('./youtubeAudioHandler');
        if (typeof unlockAllUsers === 'function') unlockAllUsers();
    } catch (_) {}

    try {
        if (client?.guilds?.cache) {
            for (const guild of client.guilds.cache.values()) {
                const conn = getVoiceConnection(guild.id);
                if (conn) conn.destroy();
            }
        }
    } catch (_) {}

    const embed = new EmbedBuilder()
        .setColor(0xE11D48)
        .setTitle('💤 HIKARI PAUSADA GLOBALMENTE')
        .setDescription(
            '> **Status:** Todas as operações ativas foram canceladas em tempo real.\n' +
            '> **Fila de IA:** Esvaziada e requisições pendentes descartadas.\n' +
            '> **Mídia:** Locks de downloads e conexões de voz interrompidas.\n' +
            '> **Bloqueio:** Novas requisições de usuários estão totalmente pausadas.\n\n' +
            '💡 Para reativar o bot a qualquer momento, envie `-hstart`.'
        )
        .setFooter({ text: `Hikari Core • Solicitado por ${message.author.username}` })
        .setTimestamp();

    return message.reply({ embeds: [embed] }).catch(() => {});
}

async function handleStart(message) {
    if (!isGlobalPaused) {
        return message.reply({
            content: '▶️ **A Hikari já está operando normalmente.**'
        }).catch(() => {});
    }

    isGlobalPaused = false;

    const embed = new EmbedBuilder()
        .setColor(0x10B981)
        .setTitle('☀️ HIKARI RETOMADA')
        .setDescription(
            '> **Status:** O bot voltou a operar normalmente.\n' +
            '> **Requisições:** Novas mensagens, menções e comandos serão processados a partir de agora.\n' +
            '> **Fila:** Limpa, sem reprocessar mensagens descartadas durante a pausa.'
        )
        .setFooter({ text: `Hikari Core • Solicitado por ${message.author.username}` })
        .setTimestamp();

    return message.reply({ embeds: [embed] }).catch(() => {});
}

async function handleDel(message) {
    try {
        await message.react('🫡');
    } catch (_) {}

    try {
        const { clearHistory } = require('./llmHandler');
        if (typeof clearHistory === 'function') {
            clearHistory(message.channelId);
        }
    } catch (_) {}
}

async function handleVoice(message, client, argsText) {
    if (isGlobalPaused) {
        return message.reply({ content: '⏸️ O bot está pausado globalmente. Envie `-hstart` primeiro.' }).catch(() => {});
    }

    let promptText = argsText;
    if (!promptText && message.reference?.messageId) {
        try {
            const ref = await message.channel.messages.fetch(message.reference.messageId);
            if (ref?.content) promptText = ref.content;
        } catch (_) {}
    }

    const hasAttachments = Boolean(message.attachments && message.attachments.size > 0);
    if (!hasAttachments && (!promptText || promptText.length === 0)) {
        return message.reply({
            content: '⚠️ **Instrução Ausente**\n> Forneça uma mensagem ou instrução após o comando.\n> Exemplo: `-hvoice como você está hoje?`'
        }).catch(() => {});
    }

    if (message.channel && typeof message.channel.sendTyping === 'function') {
        message.channel.sendTyping().catch(() => {});
    }

    const { addToQueue } = require('./llmHandler');
    const { buildMessagePrompt } = require('./messagePromptBuilder') || {};

    const initialSearchPrompt = promptText || (hasAttachments ? 'analise do anexo' : 'voz');
    const messageEvent = require('../events/messageCreate');

    if (typeof messageEvent.buildMessagePromptExternal === 'function') {
        addToQueue(initialSearchPrompt, message, 'mention', {
            allowSearch: true,
            searchPrompt: initialSearchPrompt,
            guildId: message.guildId,
            forceVoice: true,
            resolvePrompt: () => messageEvent.buildMessagePromptExternal(message, client, { isMention: true, forceVoice: true, customPrompt: promptText })
        });
    } else {
        addToQueue(initialSearchPrompt, message, 'mention', {
            allowSearch: true,
            searchPrompt: initialSearchPrompt,
            guildId: message.guildId,
            forceVoice: true
        });
    }
}

async function handleNewVoice(message, client, argsText) {
    if (isGlobalPaused) {
        return message.reply({ content: '⏸️ O bot está pausado globalmente. Envie `-hstart` primeiro.' }).catch(() => {});
    }

    let textToSpeak = argsText;
    if (!textToSpeak && message.reference?.messageId) {
        try {
            const ref = await message.channel.messages.fetch(message.reference.messageId);
            if (ref?.content) textToSpeak = ref.content;
        } catch (_) {}
    }

    if (!textToSpeak || textToSpeak.trim().length === 0) {
        return message.reply({
            content: '⚠️ **Texto Ausente**\n> Digite o texto exato que a Hikari deve falar diretamente sem passar pela IA.\n> Exemplo: `-hnewvoice Bom dia a todos, este é um áudio oficial!`'
        }).catch(() => {});
    }

    if (textToSpeak.length > 1000) {
        return message.reply({
            content: '⚠️ **Texto Muito Longo**\n> O comando `-hnewvoice` aceita no máximo 1000 caracteres por áudio.'
        }).catch(() => {});
    }

    if (message.channel && typeof message.channel.sendTyping === 'function') {
        message.channel.sendTyping().catch(() => {});
    }

    try {
        const { generateAndSendVoiceMessage } = require('../services/ttsService');
        const replyTargetId = message.id;
        const result = await generateAndSendVoiceMessage(textToSpeak, message.channel, replyTargetId);
        if (result && result.message) {
            try {
                const { registerBotAudio } = require('./audioTranscriptionHandler');
                if (typeof registerBotAudio === 'function') {
                    registerBotAudio(result.message.id, result.cleanText);
                    if (result.message.attachments) {
                        for (const att of result.message.attachments) {
                            registerBotAudio(att.id, result.cleanText);
                        }
                    }
                }
            } catch (_) {}
            try {
                await message.react('🎙️');
            } catch (_) {}
        } else {
            return message.reply({
                content: '❌ **Falha na Síntese**\n> Não foi possível gerar o áudio diretamente. Verifique se o provedor TTS está acessível.'
            }).catch(() => {});
        }
    } catch (err) {
        return message.reply({
            content: `❌ **Erro ao Gerar Voz Direta:** ${err.message}`
        }).catch(() => {});
    }
}

async function handleHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle('Comandos de Chat para donos (-h)')
        .setDescription('Comandos administrativos diretos de chat com prefixo `-h`, restritos exclusivamente aos proprietários da Hikari.')
        .addFields(
            {
                name: '`-hvoice <texto>`',
                value: 'Força a resposta da Hikari diretamente em formato de nota de voz oficial (passa pela IA e sintetiza o áudio gerado por ela).',
                inline: false
            },
            {
                name: '`-hnewvoice <texto>`',
                value: 'Sintetiza exatamente o texto digitado usando a voz oficial da Hikari, sem passar pela IA. Ideal para recados e falas personalizadas.',
                inline: false
            },
            {
                name: '`-hstop`',
                value: 'Pausa global imediata. Cancela em tempo real qualquer geração ativa (texto, imagem, voz, download, rádio), limpa a fila e bloqueia todas as próximas requisições.',
                inline: false
            },
            {
                name: '`-hstart`',
                value: 'Retoma o funcionamento normal da Hikari a partir do momento atual, permitindo novas mensagens sem reprocessar requisições descartadas.',
                inline: false
            },
            {
                name: '`-hdel`',
                value: 'Limpa a memória e o histórico de contexto da Hikari no canal atual.',
                inline: false
            },
            {
                name: '`-hhelp`',
                value: 'Exibe este painel de ajuda com todos os comandos disponíveis para o dono.',
                inline: false
            }
        )
        .setFooter({ text: 'Hikari Admin • Prefixo Oficial: -h' })
        .setTimestamp();

    return message.reply({ embeds: [embed] }).catch(() => {});
}

async function processOwnerCommand(message, client) {
    if (!message?.content || typeof message.content !== 'string') return false;
    const content = message.content.trim();
    if (!content.startsWith('-h') && !content.startsWith('-H')) return false;

    if (!config.isOwner(message.author.id)) {
        return false;
    }

    const match = content.match(/^-h([a-z0-9_]+)(?:\s+([\s\S]*))?$/i);
    if (!match) return false;

    const command = match[1].toLowerCase();
    const argsText = (match[2] || '').trim();

    switch (command) {
        case 'voice':
            await handleVoice(message, client, argsText);
            return true;
        case 'newvoice':
            await handleNewVoice(message, client, argsText);
            return true;
        case 'stop':
            await handleStop(message, client);
            return true;
        case 'start':
            await handleStart(message);
            return true;
        case 'del':
            await handleDel(message);
            return true;
        case 'help':
            await handleHelp(message);
            return true;
        default:
            await message.reply({
                content: `❓ Comando \`-h${command}\` não reconhecido. Envie \`-hhelp\` para ver a lista de comandos do dono.`
            }).catch(() => {});
            return true;
    }
}

module.exports = {
    isBotPaused,
    setBotPaused,
    processOwnerCommand,
    handleStop,
    handleStart,
    handleDel,
    handleVoice,
    handleNewVoice,
    handleHelp
};
