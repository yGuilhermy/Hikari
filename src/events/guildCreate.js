const { reportNewGuild } = require('../handlers/tosHandler');
module.exports = {
    name: 'guildCreate',
    once: false,
    async execute(guild) {
        console.log(`[EVENT] Hikari foi adicionada ao servidor: ${guild.name} (${guild.id})`);
        await reportNewGuild(guild);
    },
};