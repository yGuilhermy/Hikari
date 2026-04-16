const { ActivityType } = require('discord.js');
function updateBotActivity(clientInstance, queueLength) {
    if (!clientInstance || !clientInstance.user) return;
    if (queueLength > 0) {
        clientInstance.user.setActivity(`a fila de ${queueLength} pessoas`, { type: ActivityType.Watching });
        clientInstance.user.setStatus('dnd');
    } else {
        clientInstance.user.setActivity('"Hikari" (光) em japonês significa "luz" | Stable v3.0 Beta', { type: ActivityType.Watching });
        clientInstance.user.setStatus('dnd');
    }
}
function startActivityUpdater(client) {
    updateBotActivity(client, 0);
}
module.exports = { updateBotActivity, startActivityUpdater };