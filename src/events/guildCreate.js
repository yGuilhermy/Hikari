const { reportNewGuild } = require('../handlers/tosHandler');
const { setAutoBlock, checkBan } = require('../handlers/banHandler');
const { logger } = require('../utils/logger');
const config = require('../config');

module.exports = {
    name: 'guildCreate',
    once: false,
    async execute(guild) {
        if (!guild || !guild.id) return;
        const banInfo = checkBan(guild.ownerId, guild.id, null);
        if (banInfo) {
            logger.security(`Servidor banido ${guild.name} (${guild.id}) tentou adicionar o bot. Iniciando saída imediata.`);
            try {
                const targetChannel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.client.user)?.has('SendMessages'));
                if (targetChannel) {
                    await targetChannel.send(`🛑 **Acesso Negado**: Este ${banInfo.typeName.toLowerCase()} está permanentemente bloqueado da Hikari. Saindo do servidor...`).catch(() => {});
                }
                await guild.leave();
            } catch (e) {
                logger.error('SECURITY', 'Erro ao sair do servidor banido no guildCreate', e);
            }
            return;
        }
        logger.discord(`Hikari adicionada a um novo servidor: ${guild.name} (ID: ${guild.id}) • Membros: ${guild.memberCount}`);
        const defaultMode = config.defaultAutoMod !== false ? (config.automodMode || 'both') : 'off';
        setAutoBlock(guild.id, defaultMode);
        await reportNewGuild(guild);
    },
};