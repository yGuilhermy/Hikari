const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { checkBan } = require('../handlers/banHandler');
const { resolveMentions } = require('../utils/mentions');
const { addToQueue, getChannelSettings, getServerSettings } = require('../handlers/llmHandler');
const config = require('../config');

async function buildMessagePrompt(message, client, options = {}) {
    const { isMention = false, isChatter = false } = options;
    const { resolveMessageAudioContent } = require('../handlers/audioTranscriptionHandler');
    const { resolveMessageVisualContent } = require('../handlers/imageVisionHandler');
    let rawUserPrompt = await resolveMessageAudioContent(message);
    rawUserPrompt = await resolveMessageVisualContent(message, rawUserPrompt);
    let currentUserPrompt = rawUserPrompt;
    if (isMention) {
        currentUserPrompt = currentUserPrompt.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    }
    if (options.forceVoice) {
        currentUserPrompt = currentUserPrompt.replace(/^<@!?\d+>\s*/, '').trim();
        currentUserPrompt = currentUserPrompt.replace(/^-hvoice\s*/i, '').trim();
        currentUserPrompt = currentUserPrompt.replace(/^!+\s*/, '').trim();
    }
    currentUserPrompt = resolveMentions(currentUserPrompt, client);
    const history = [];
    let repliedMessage = null;
    if (message.reference && message.reference.messageId) {
        try {
            repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
        } catch (err) {
            console.error(err.message);
        }
    }
    const limit = isChatter ? 5 : 10;
    const recentMessages = await message.channel.messages.fetch({ limit, before: message.id });
    const messageMap = new Map();
    if (repliedMessage) messageMap.set(repliedMessage.id, repliedMessage);
    recentMessages.forEach(msg => {
        if (msg.author.bot && msg.author.id !== client.user.id) return;
        if (!messageMap.has(msg.id)) messageMap.set(msg.id, msg);
    });
    const sortedMessages = [...messageMap.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    let lastDelIndex = -1;
    for (let i = sortedMessages.length - 1; i >= 0; i--) {
        const c = sortedMessages[i].content.trim().toLowerCase();
        if (c === '-hdel' || c === '-hdel.' || c === 'hikari -hdel' || c.replace(/<@!?\d+>/g, '').trim() === '-hdel' ||
            c === 'mcp del' || c === 'mcp del.' || c === 'hikari mcp del' || c.replace(/<@!?\d+>/g, '').trim() === 'mcp del') {
            lastDelIndex = i;
            break;
        }
    }
    const filteredMessages = lastDelIndex !== -1 ? sortedMessages.slice(lastDelIndex + 1) : sortedMessages;
    for (const msg of filteredMessages) {
        const isBot = msg.author.id === client.user.id;
        const authorName = isBot ? 'Hikari' : msg.author.username;
        let rawContent = await resolveMessageAudioContent(msg);
        rawContent = await resolveMessageVisualContent(msg, rawContent);
        let content = resolveMentions(rawContent, client);
        if (isBot && (content.includes('erro ao processar seu pedido') || content.includes('Limites de Processamento Atingidos') || content.includes('Desculpe, tive um erro'))) {
            content = 'erro da ia';
        }
        if (isBot) {
            content = content.replace(/^-# .*$/gm, '').replace(/🧠 \*\*Processando\.\.\.\*\*/g, '').replace(/🎙️ \*\*Gravando voz\.\.\.\*\*/g, '').trim();
        }
        if (content.trim().length === 0) continue;
        if (content.length > 2500) content = content.substring(0, 2500) + '...';
        history.push(`${authorName}: ${content}`);
    }
    const currentDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let envInfo = '';
    if (config.sendEnvironmentInfo) {
        envInfo = `Servidor: ${message.guild?.name || 'DM'} | Canal: #${message.channel?.name || 'Chat'}\n`;
    }
    const instruction = options.forceVoice
        ? 'INSTRUÇÃO: Responda diretamente à mensagem atual de forma natural e concisa para ser falada em áudio (1 a 4 frases curtas, sem emojis, sem markdown complexo, sem listas, sem código).'
        : isChatter
            ? 'INSTRUÇÃO: Entre na conversa espontaneamente sem repetir o que foi dito.'
            : 'INSTRUÇÃO: Responda diretamente à mensagem atual.';
    const finalPrompt = `--- CONTEXTO ---\nData: ${currentDate}\n${envInfo}${history.join('\n')}\n--- MENSAGEM ATUAL ---\n${message.author.username}: "${currentUserPrompt}"\n${instruction}`;
    return { prompt: finalPrompt, searchPrompt: currentUserPrompt };
}

module.exports = {
    name: 'messageCreate',
    once: false,
    buildMessagePromptExternal: (message, client, options = {}) => {
        if (options.customPrompt) {
            const currentDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            let envInfo = '';
            if (config.sendEnvironmentInfo) {
                envInfo = `Servidor: ${message.guild?.name || 'DM'} | Canal: #${message.channel?.name || 'Chat'}\n`;
            }
            const instruction = 'INSTRUÇÃO: Responda diretamente à mensagem atual de forma natural e concisa para ser falada em áudio (1 a 4 frases curtas, sem emojis, sem markdown complexo, sem listas, sem código).';
            const finalPrompt = `--- CONTEXTO ---\nData: ${currentDate}\n${envInfo}\n--- MENSAGEM ATUAL ---\n${message.author.username}: "${options.customPrompt}"\n${instruction}`;
            return { prompt: finalPrompt, searchPrompt: options.customPrompt };
        }
        return buildMessagePrompt(message, client, options);
    },
    async execute(message, client) {
        if (message.author.bot) return;

        const { processOwnerCommand, isBotPaused } = require('../handlers/ownerCommandHandler');
        const isOwnerUser = config.isOwner(message.author.id);

        if (isOwnerUser && (message.content.trim().startsWith('-h') || message.content.trim().startsWith('-H'))) {
            const handled = await processOwnerCommand(message, client);
            if (handled) return;
        }

        if (isBotPaused()) {
            return;
        }

        const banInfo = checkBan(message.author.id, message.guildId, message.channelId);
        if (banInfo) {
            const isMentionForBan = message.mentions.has(client.user, { ignoreEveryone: true });
            if (!isMentionForBan) return;
            const banEmbed = new EmbedBuilder()
                .setColor(0xE11D48)
                .setTitle('🛑 ACESSO NEGADO — VOCÊ ESTÁ BANIDO!')
                .setDescription(`Sua tentativa de interação foi abortada. O acesso à **IA Hikari** está permanentemente bloqueado para você.\n\n**DETALHES DO SEU BANIMENTO:**\n- **ALVO:** ${banInfo.typeName || banInfo.type}\n- **MOTIVO:** ${banInfo.reason || 'Violação severa dos Termos de Uso da IA Hikari.'}\n- **STATUS:** 🔴 TOTALMENTE RESTRITO / SUSPENSO.\n\nVocê perdeu todos os privilégios de utilização dos nossos serviços.\n\nSe acredita que isso é um erro, solicite um desbanimento pelo botão abaixo.\n\n---\n💡 **Quer usar a Hikari sem restrições?** Hospede sua própria versão!\n🚀 **Repositório:** [yGuilhermy/Hikari](https://github.com/yGuilhermy/Hikari)`)
                .setFooter({ text: 'Hikari Security & Moderation • by yGuilhermy' })
                .setTimestamp();
            const appealButton = new ButtonBuilder()
                .setCustomId(`appeal_ban_${banInfo.type}_${banInfo.id || message.author.id}`)
                .setLabel('⚖️ Solicitar Apelação')
                .setStyle(ButtonStyle.Secondary);
            const githubButton = new ButtonBuilder()
                .setLabel('Página do Projeto')
                .setURL('https://github.com/yGuilhermy/Hikari')
                .setStyle(ButtonStyle.Link)
                .setEmoji('🚀');
            const banRow = new ActionRowBuilder().addComponents(appealButton, githubButton);
            return message.reply({ embeds: [banEmbed], components: [banRow] }).catch(() => {});
        }
        let isReplyToBot = false;
        if (message.reference && message.reference.messageId) {
            if (message.mentions.repliedUser && message.mentions.repliedUser.id === client.user.id) {
                isReplyToBot = true;
            } else {
                let refMsg = message.channel.messages?.cache?.get(message.reference.messageId);
                if (!refMsg && message.channel.messages?.fetch) {
                    try {
                        refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                    } catch (_) {}
                }
                if (refMsg && refMsg.author && refMsg.author.id === client.user.id) {
                    isReplyToBot = true;
                }
            }
        }
        if (message.guildId) {
            const { isServerAccepted, sendTermsOfService } = require('../handlers/tosHandler');
            if (!isServerAccepted(message.guildId)) {
                const serverSettings = getServerSettings(message.guildId);
                const respondToEveryone = serverSettings.respondToEveryone || false;
                const isMention = message.mentions.has(client.user, { ignoreEveryone: true }) || (respondToEveryone && message.mentions.everyone);
                const botName = config.botName || 'Hikari';
                const nameRegex = new RegExp(`\\b${botName}\\b`, 'i');
                const hasHikariName = nameRegex.test(message.content);
                const settings = getChannelSettings(message.channelId);
                const isChatterActive = settings?.chatter?.active || false;
                if (isMention || hasHikariName || isReplyToBot || isChatterActive) {
                    await sendTermsOfService(message);
                }
                return;
            }
        }
        const serverSettings = getServerSettings(message.guildId);
        const respondToEveryone = serverSettings.respondToEveryone || false;
        const isMention = message.mentions.has(client.user, { ignoreEveryone: true }) || (respondToEveryone && message.mentions.everyone);
        const botName = config.botName || 'Hikari';
        const nameRegex = new RegExp(`\\b${botName}\\b`, 'i');
        const hasHikariName = nameRegex.test(message.content);
        const isTargetingBot = Boolean(isMention || hasHikariName || isReplyToBot || !message.guildId);
        const trimmedRaw = (message.content || '').trim();
        const contentWithoutBotMention = trimmedRaw.replace(new RegExp(`^<@!?${client.user.id}>\\s*`), '').trim();
        const startsWithExclamation = trimmedRaw.startsWith('!') || contentWithoutBotMention.startsWith('!');
        const forceVoiceByOwner = Boolean(isOwnerUser && startsWithExclamation && isTargetingBot);
        if (isTargetingBot) {
            if (message.guildId && message.channelId) {
                const { setServerLastChannel } = require('../handlers/llmHandler');
                setServerLastChannel(message.guildId, message.channelId);
                const { checkAndInitializeUpdateChannel } = require('../handlers/tosHandler');
                await checkAndInitializeUpdateChannel(message.guild, message.channel);
            }
            const hasAttachments = Boolean(message.attachments && message.attachments.size > 0);
            let rawClean = (message.content || '');
            if (isMention) {
                rawClean = rawClean.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
            }
            if (forceVoiceByOwner) {
                rawClean = rawClean.replace(/^!+\s*/, '').trim();
            }
            rawClean = resolveMentions(rawClean, client).trim();
            if (!hasAttachments && rawClean.length === 0) {
                message.reply('Oi! Vi que me chamou, mas não entendi o que você precisa.');
                return;
            }
            if (message.channel && typeof message.channel.sendTyping === 'function') {
                message.channel.sendTyping().catch(() => {});
            }
            const initialSearchPrompt = rawClean || (hasAttachments ? 'analise do anexo' : message.content);
            addToQueue(initialSearchPrompt, message, 'mention', {
                allowSearch: true,
                searchPrompt: initialSearchPrompt,
                guildId: message.guildId,
                forceVoice: forceVoiceByOwner,
                resolvePrompt: () => buildMessagePrompt(message, client, { isMention, forceVoice: forceVoiceByOwner })
            });
        } else {
            const settings = getChannelSettings(message.channelId);
            if (settings?.chatter?.active) {
                let chance = 0;
                if (settings.chatter.percentage !== undefined && settings.chatter.percentage !== null) {
                    chance = settings.chatter.percentage / 100;
                } else {
                    switch (settings.chatter.frequency) {
                        case 'low': chance = 0.01; break;
                        case 'medium': chance = 0.05; break;
                        case 'high': chance = 0.15; break;
                    }
                }
                if (Math.random() < chance) {
                    if (message.guildId && message.channelId) {
                        const { setServerLastChannel } = require('../handlers/llmHandler');
                        setServerLastChannel(message.guildId, message.channelId);
                        const { checkAndInitializeUpdateChannel } = require('../handlers/tosHandler');
                        await checkAndInitializeUpdateChannel(message.guild, message.channel);
                    }
                    if (message.channel && typeof message.channel.sendTyping === 'function') {
                        message.channel.sendTyping().catch(() => {});
                    }
                    const initialSearchPrompt = message.content || 'conversa';
                    addToQueue(initialSearchPrompt, message, 'mention', {
                        allowSearch: true,
                        searchPrompt: initialSearchPrompt,
                        guildId: message.guildId,
                        resolvePrompt: () => buildMessagePrompt(message, client, { isMention: false, isChatter: true })
                    });
                }
            }
        }
    },
};