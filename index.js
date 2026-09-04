require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const { logger, init } = require('./src/utils/logger');
const { startActivityUpdater } = require('./src/utils/activity');
const { setDiscordClient } = require('./src/handlers/llmHandler');

init(config.logWebhookUrl);

process.on('unhandledRejection', (reason) => {
    logger.error('SYSTEM', 'Rejeição de promessa não tratada', reason);
});

process.on('uncaughtException', (err) => {
    logger.error('SYSTEM', 'Exceção não capturada', err);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
});

setDiscordClient(client);

const eventsPath = path.join(__dirname, 'src/events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

startActivityUpdater(client);

client.login(config.discordToken).catch(err => {
    logger.error('SYSTEM', 'Falha fatal durante login no Discord', err);
});