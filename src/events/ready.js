const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
            let shouldRegister = true;
            const cachePath = path.join(__dirname, '../data/slash_commands_cache.json');
            const currentHash = crypto.createHash('sha256').update(JSON.stringify(commands)).digest('hex');
            if (fs.existsSync(cachePath)) {
                try {
                    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                    if (cached && cached.hash === currentHash && cached.appId === client.user.id) {
                        shouldRegister = false;
                        logger.system(`Comandos slash já sincronizados (${commands.length} comandos). Registro ignorado para evitar chamadas de rede redundantes.`);
                    }
                } catch (_) {}
            }

            if (shouldRegister) {
                logger.system(`Iniciando registro global de ${commands.length} comandos slash (/)...`);
                await rest.put(
                    Routes.applicationCommands(client.user.id),
                    { body: commands },
                );
                try {
                    fs.writeFileSync(cachePath, JSON.stringify({
                        hash: currentHash,
                        appId: client.user.id,
                        count: commands.length,
                        updatedAt: new Date().toISOString()
                    }, null, 2), 'utf8');
                } catch (_) {}
                logger.system('Todos os comandos slash (/) foram sincronizados com sucesso.');
            }
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