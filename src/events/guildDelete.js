const { removeAcceptedServer } = require('../handlers/tosHandler');
const { logger } = require('../utils/logger');

module.exports = {
    name: 'guildDelete',
    once: false,
    async execute(guild) {
        if (!guild || !guild.id) return;
        logger.discord(`Hikari removida do servidor: ${guild.name} (ID: ${guild.id})`);
        removeAcceptedServer(guild.id);
    },
};
