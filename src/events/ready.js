const { REST, Routes } = require('discord.js');
const { setDiscordClient, setOnQueueUpdate } = require('../handlers/llmHandler');
const { updateBotActivity } = require('../utils/activity');
const { registerCommands, commands } = require('../commands/slashCommands');
const { getBans } = require('../handlers/banHandler');
const { logger } = require('../utils/logger');
const config = require('../config');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        logger.system(`Sessão iniciada como ${client.user.tag} (ID: ${client.user.id})`);
        logger.discord(`Conectado a ${client.guilds.cache.size} servidores e ${client.users.cache.size} usuários em cache.`);
        
        setDiscordClient(client);
        setOnQueueUpdate((queueLength) => updateBotActivity(client, queueLength));

        const rest = new REST({ version: '10' }).setToken(config.discordToken);
        
        try {
            logger.system(`Iniciando registro global de ${commands.length} comandos slash (/)...`);
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );
            logger.system('Todos os comandos slash (/) foram sincronizados com sucesso.');
        } catch (error) {
            logger.error('SYSTEM', 'Falha ao registrar comandos slash no Discord', error);
        }

        try {
            const currentBans = getBans();
            if (currentBans && currentBans.guilds) {
                for (const bannedGuildId of Object.keys(currentBans.guilds)) {
                    const g = client.guilds.cache.get(bannedGuildId);
                    if (g) {
                        logger.security(`Saindo imediatamente do servidor banido: ${g.name} (${g.id})`);
                        await g.leave().catch(() => {});
                    }
                }
            }
        } catch (e) {
            logger.error('SECURITY', 'Erro ao verificar servidores banidos no startup', e);
        }

        const fs = require('fs');
        const path = require('path');
        const communityPath = path.join(__dirname, '../community');
        if (fs.existsSync(communityPath)) {
            try {
                const community = require(communityPath);
                community.init(client);
            } catch (commErr) {
                logger.error('SYSTEM', 'Falha ao inicializar modulo comunitario', commErr);
            }
        }

        const telemetryLogger = require('../utils/telemetryLogger');
        let defaultLogsChannel = process.env.DEFAULT_CHANNEL_ID || process.env.HIKARI_LOGS_CHANNEL_ID;
        if (!defaultLogsChannel && fs.existsSync(communityPath)) {
            try {
                const { CHANNELS } = require('../community/constants');
                defaultLogsChannel = CHANNELS?.HIKARI_LOGS;
            } catch (_) {}
        }
        telemetryLogger.init(client, defaultLogsChannel);
        telemetryLogger.system(`Bot inicializado (${client.guilds.cache.size} servidores)`);

        updateBotActivity(client, 0);
    },
};