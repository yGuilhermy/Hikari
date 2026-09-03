const { reportNewGuild } = require('../handlers/tosHandler');
const { setAutoBlock, checkBan } = require('../handlers/banHandler');
const config = require('../config');

module.exports = {
    name: 'guildCreate',
    once: false,
    async execute(guild) {
        if (!guild || !guild.id) return;
        const banInfo = checkBan(guild.ownerId, guild.id, null);
        if (banInfo) {
            console.log(`[EVENT] Servidor ${guild.name} (${guild.id}) ou proprietário (${guild.ownerId}) está banido. Saindo.`);
            try {
                const targetChannel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.client.user)?.has('SendMessages'));
                if (targetChannel) {
                    await targetChannel.send(`🛑 **Acesso Negado**: Este ${banInfo.typeName.toLowerCase()} está permanentemente bloqueado da Hikari. Saindo do servidor...`).catch(() => {});
                }
                await guild.leave();
            } catch (e) {
                console.error('[guildCreate] Erro ao sair do servidor banido:', e.message);
            }
            return;
        }
        console.log(`[EVENT] Hikari foi adicionada ao servidor: ${guild.name} (${guild.id})`);
        const defaultMode = config.defaultAutoMod !== false ? (config.automodMode || 'both') : 'off';
        setAutoBlock(guild.id, defaultMode);
        await reportNewGuild(guild);
    },
};