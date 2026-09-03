const { REST, Routes } = require('discord.js');
const { setDiscordClient, setOnQueueUpdate } = require('../handlers/llmHandler');
const { updateBotActivity } = require('../utils/activity');
const { registerCommands, commands } = require('../commands/slashCommands');
const { getBans } = require('../handlers/banHandler');
const config = require('../config');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`Logado como ${client.user.tag}!`);
        
        setDiscordClient(client);
        setOnQueueUpdate((queueLength) => updateBotActivity(client, queueLength));

        const rest = new REST({ version: '10' }).setToken(config.discordToken);
        
        try {
            console.log('Iniciando registro de comandos...');
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );
            console.log('Comandos registrados com sucesso.');
        } catch (error) {
            console.error('Erro ao registrar comandos:', error);
        }

        try {
            const currentBans = getBans();
            if (currentBans && currentBans.guilds) {
                for (const bannedGuildId of Object.keys(currentBans.guilds)) {
                    const g = client.guilds.cache.get(bannedGuildId);
                    if (g) {
                        console.log(`[STARTUP] Saindo do servidor banido: ${g.name} (${g.id})`);
                        await g.leave().catch(() => {});
                    }
                }
            }
        } catch (e) {
            console.error('[STARTUP] Erro ao verificar servidores banidos:', e.message);
        }

        updateBotActivity(client, 0);
    },
};