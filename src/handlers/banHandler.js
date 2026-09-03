const fs = require('fs');
const path = require('path');
const config = require('../config');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

const BANS_FILE = path.join(__dirname, '../data/bans.json');
if (!fs.existsSync(path.dirname(BANS_FILE))) {
    fs.mkdirSync(path.dirname(BANS_FILE), { recursive: true });
}

let bans = { users: {}, guilds: {}, channels: {}, autoblock: {} };
const pendingAppeals = new Map();

function loadBans() {
    if (fs.existsSync(BANS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(BANS_FILE, 'utf8'));
            if (data && typeof data === 'object') {
                bans = {
                    users: data.users && typeof data.users === 'object' ? data.users : {},
                    guilds: data.guilds && typeof data.guilds === 'object' ? data.guilds : {},
                    channels: data.channels && typeof data.channels === 'object' ? data.channels : {},
                    autoblock: data.autoblock && typeof data.autoblock === 'object' ? data.autoblock : {}
                };
                return;
            }
        } catch (e) {
            console.error('Erro ao ler bans.json:', e);
        }
    }
    bans = { users: {}, guilds: {}, channels: {}, autoblock: {} };
}
loadBans();

function saveBans() {
    try {
        const tempPath = `${BANS_FILE}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(bans, null, 2), 'utf8');
        fs.renameSync(tempPath, BANS_FILE);
    } catch (e) {
        console.error('Erro ao salvar bans.json:', e);
        try {
            fs.writeFileSync(BANS_FILE, JSON.stringify(bans, null, 2), 'utf8');
        } catch (_) {}
    }
}

function getAutoBlockMode(guildId) {
    if (!guildId) return 'off';
    const val = bans.autoblock[guildId];
    if (val === undefined) {
        return config.defaultAutoMod !== false ? (config.automodMode || 'both') : 'off';
    }
    if (val === true) return 'both';
    if (val === false) return 'off';
    if (['off', 'both', 'mcp', 'trigger'].includes(val)) return val;
    return 'off';
}

function getAutoBlock(guildId) {
    return getAutoBlockMode(guildId) !== 'off';
}

function setAutoBlock(guildId, val) {
    if (!guildId) return false;
    bans.autoblock[guildId] = val;
    saveBans();
    return true;
}

function sanitizeId(id) {
    if (!id) return null;
    const cleaned = String(id).replace(/\D/g, '').trim();
    return cleaned.length > 0 ? cleaned : null;
}

function normalizeTargetType(type) {
    if (!type) return null;
    const lower = String(type).toLowerCase().trim();
    if (['user', 'usuario', 'usuário', 'u'].includes(lower)) return 'user';
    if (['guild', 'guilds', 'server', 'servidor', 's', 'g'].includes(lower)) return 'guild';
    if (['channel', 'channels', 'canal', 'c'].includes(lower)) return 'channel';
    return null;
}

function checkBan(userId, guildId, channelId) {
    const cleanUserId = sanitizeId(userId);
    const cleanGuildId = sanitizeId(guildId);
    const cleanChannelId = sanitizeId(channelId);

    if (cleanUserId && config.isOwner && config.isOwner(cleanUserId)) {
        return null;
    }

    const sanitize = (r) => {
        if (!r) return null;
        if (r.includes('Identificado termo proibido no') && r.includes(':')) {
            return r.split(':')[0] + '.';
        }
        return r;
    };

    if (cleanUserId && bans.users[cleanUserId]) {
        return { type: 'user', id: cleanUserId, typeName: 'Usuário', reason: sanitize(bans.users[cleanUserId].reason) };
    }
    if (cleanGuildId && bans.guilds[cleanGuildId]) {
        return { type: 'guild', id: cleanGuildId, typeName: 'Servidor', reason: sanitize(bans.guilds[cleanGuildId].reason) };
    }
    if (cleanChannelId && bans.channels[cleanChannelId]) {
        return { type: 'channel', id: cleanChannelId, typeName: 'Canal', reason: sanitize(bans.channels[cleanChannelId].reason) };
    }
    return null;
}

function addBan(type, rawId, reason = "Violação dos Termos de Uso.") {
    const normType = normalizeTargetType(type);
    const id = sanitizeId(rawId);
    if (!normType || !id) return false;
    const banInfo = { reason: String(reason || 'Violação dos Termos de Uso.'), timestamp: new Date().toISOString() };
    if (normType === 'user') bans.users[id] = banInfo;
    else if (normType === 'guild') bans.guilds[id] = banInfo;
    else if (normType === 'channel') bans.channels[id] = banInfo;
    saveBans();
    return true;
}

function removeBan(type, rawId) {
    const normType = normalizeTargetType(type);
    const id = sanitizeId(rawId);
    if (!normType || !id) return false;
    let removed = false;
    if (normType === 'user' && bans.users[id]) {
        delete bans.users[id];
        removed = true;
    } else if (normType === 'guild' && bans.guilds[id]) {
        delete bans.guilds[id];
        removed = true;
    } else if (normType === 'channel' && bans.channels[id]) {
        delete bans.channels[id];
        removed = true;
    }
    if (removed) saveBans();
    return removed;
}

const forbiddenKeywords = [
    'nsfw', 'porn', 'hentai', 'gore', 'sexo', 'puta', 'caralho', 'buceta', 'pinto', 'pênis', 'vagina', '18+', 'pornografia', 'pornô',
    'estupro', 'pedofilia', 'bestialidade', 'necrofilia', 'zoofilia', "porno", "pornhub", "redtube", "rule34", "r34", "lolicon", "shotacon",
    'suicídio', 'auto-mutilação', 'autoflagelação',
    'terrorismo', 'nazismo', 'hitler', 'suástica', 'extremismo', '1488',
    'xvideos', 'pornhub', 'redtube', 'rule34', 'r34', 'lolicon', 'shotacon',
    'foder', 'fodendo', 'foda-se', 'fodase', 'boquete', 'viado', 'traveco', 'punheta', 'orgia', 'suruba', 'nude', 'nudes', 'clitóris', 'ânus', 'felação',
    'masturbação', 'masturbar', 'ejaculação', 'sêmen',
    'arrombado', 'filho da puta', 'fdp',
    'cuzão', 'bicha',
    'boob', 'boobs', 'tits', 'fuck', 'bitch',
    'estuprar', 'estuprador',
    'pedófilo',
    'automutilação', 'suicidar',
    'homicídio', 'assassinato', 'decapitação', 'desmembramento', 'tortura', 'esquartejamento', 'assassinar',
    'fascismo', 'fascista', 'neonazista', 'neonazismo',
    'ku klux klan', 'swastika', 'white power'
];

function checkAutoBan(prompt, guildName, guildId, channelName, channelId, userId) {
    if (userId && (config.isOwner(userId) || config.isAutomodWhitelisted(userId))) {
        return null;
    }

    const lowerPrompt = (prompt || "").toLowerCase();
    const lowerGuild = (guildName || "").toLowerCase();
    const lowerChannel = (channelName || "").toLowerCase();

    const isForbidden = (text, isPrompt = true) => {
        if (!text) return null;
        return forbiddenKeywords.find(k => {
            const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!isPrompt) {
                const regex = new RegExp(`(^|[\\s_\\-.,!?/|])${escaped}($|[\\s_\\-.,!?/|])`, 'i');
                return regex.test(text);
            }
            if (k.length <= 3 || k.includes('+') || k.includes('-')) {
                return new RegExp(`(^|[\\s_\\-.,!?/|])${escaped}($|[\\s_\\-.,!?/|])`, 'i').test(text);
            }
            const regex = new RegExp(`\\b${escaped}\\b`, 'i');
            return regex.test(text);
        });
    };

    const guildK = isForbidden(lowerGuild, false);
    if (guildK && guildId) return { type: 'guild', id: guildId, keyword: guildK, reason: 'Identificado termo proibido no servidor.' };

    const channelK = isForbidden(lowerChannel, false);
    if (channelK && channelId) return { type: 'channel', id: channelId, keyword: channelK, reason: 'Identificado termo proibido no canal.' };

    const promptK = isForbidden(lowerPrompt, true);
    if (promptK && userId) return { type: 'user', id: userId, keyword: promptK, reason: 'Identificado termo proibido no prompt.' };

    return null;
}

async function handleBanInteraction(interaction, client) {
    if (!interaction.isButton()) return;
    const cid = interaction.customId;

    if (cid.startsWith('appeal_ban_')) {
        const parts = cid.split('_');
        const type = parts[2];
        const targetId = parts[3];

        if (type === 'user') {
            if (interaction.user.id !== targetId) {
                return interaction.reply({ content: '❌ Apenas o usuário bloqueado pode enviar esta apelação.', ephemeral: true });
            }
        } else {
            const hasPerm = interaction.member?.permissions.has(PermissionFlagsBits.Administrator) ||
                            interaction.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
                            interaction.member?.permissions.has(PermissionFlagsBits.ManageChannels);
            if (!hasPerm) {
                return interaction.reply({ content: '❌ Apenas Administradores ou Moderadores podem solicitar apelação por bloqueios de servidor/canal.', ephemeral: true });
            }
        }

        const lastAppeal = pendingAppeals.get(targetId);
        if (lastAppeal && Date.now() - lastAppeal < 600000) {
            return interaction.reply({ content: '⏳ Já existe um pedido de apelação recente em análise para este alvo. Aguarde a avaliação da administração.', ephemeral: true });
        }

        const appealChannel = client.channels.cache.get(config.appealChannelId) || await client.channels.fetch(config.appealChannelId).catch(() => null);
        if (!appealChannel) {
            return interaction.reply({ content: '❌ O canal de apelações está indisponível no momento. Por favor, entre em contato diretamente com o desenvolvedor.', ephemeral: true });
        }

        pendingAppeals.set(targetId, Date.now());

        await interaction.message?.delete().catch(() => {});
        await interaction.reply({ content: '✅ Apelação enviada com sucesso para os desenvolvedores. Aguarde a revisão.', ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor(0xF59E0B)
            .setTitle('⚖️ Novo Pedido de Appeal (Desbanimento)')
            .addFields(
                { name: 'Tipo do Bloqueio', value: (type || 'USER').toUpperCase(), inline: true },
                { name: 'ID Bloqueado', value: targetId, inline: true },
                { name: 'Solicitante', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`unban_${type}_${targetId}_${interaction.user.id}`)
                .setLabel('✅ Desbanir')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`keepban_${type}_${targetId}_${interaction.user.id}`)
                .setLabel('❌ Manter Bloqueio')
                .setStyle(ButtonStyle.Danger)
        );

        await appealChannel.send({
            content: `🔔 Um novo appeal requer atenção dos Administradores (<@${config.ownerId}> [\[Abrir Perfil\](https://discord.com/users/${config.ownerId})]).`,
            embeds: [embed],
            components: [row]
        }).catch(err => {
            console.error('Erro ao enviar mensagem no canal de appeal:', err.message);
        });

    } else if (cid.startsWith('unban_')) {
        if (!config.isOwner(interaction.user.id)) return interaction.reply({ content: '❌ Somente dono!', ephemeral: true });
        const parts = cid.split('_');
        const type = parts[1];
        const targetId = parts[2];
        const requestorId = parts[3];

        pendingAppeals.delete(targetId);
        removeBan(type, targetId);

        const currentEmbed = interaction.message.embeds[0];
        const embed = currentEmbed ? EmbedBuilder.from(currentEmbed) : new EmbedBuilder();
        embed.setColor(0x10B981)
            .setTitle('✅ Apelação Aceita')
            .addFields({ name: 'Veredito', value: `Bloqueio removido pelo Administrador <@${interaction.user.id}>.` });

        await interaction.update({ embeds: [embed], components: [] });

        if (requestorId) {
            try {
                const user = await client.users.fetch(requestorId);
                await user.send(`🎉 Sua apelação foi aceita! O bloqueio de \`${targetId}\` (${type}) foi removido da IA Hikari.`);
            } catch(e) {}
        }

    } else if (cid.startsWith('keepban_')) {
        if (!config.isOwner(interaction.user.id)) return interaction.reply({ content: '❌ Somente dono!', ephemeral: true });
        const parts = cid.split('_');
        const type = parts[1];
        const targetId = parts[2];
        const requestorId = parts[3];

        pendingAppeals.delete(targetId);

        const currentEmbed = interaction.message.embeds[0];
        const embed = currentEmbed ? EmbedBuilder.from(currentEmbed) : new EmbedBuilder();
        embed.setColor(0xE11D48)
            .setTitle('❌ Apelação Negada')
            .addFields({ name: 'Veredito', value: `Bloqueio MANTIDO pelo Administrador <@${interaction.user.id}>.` });

        await interaction.update({ embeds: [embed], components: [] });

        if (requestorId) {
            try {
                const user = await client.users.fetch(requestorId);
                await user.send(`❌ Sua apelação para \`${targetId}\` (${type}) foi analisada e **mantida/recusada** pelo Administrador da Hikari.`);
            } catch(e) {}
        }
    }
}

module.exports = {
    checkBan,
    addBan,
    removeBan,
    getBans: () => bans,
    checkAutoBan,
    handleBanInteraction,
    getAutoBlock,
    getAutoBlockMode,
    setAutoBlock,
    forbiddenKeywords
};