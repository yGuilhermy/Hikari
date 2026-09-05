const {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    getVoiceConnection,
    StreamType
} = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const { getSession, updateSession, nextTrack } = require('./radioDatabase');
const { downloadTrackToDisk } = require('./radioProviders');
const { buildRadioEmbed } = require('./radioEmbed');
const { createYouTubeProgressiveStream } = require('./youtubeBufferStream');
const { prefetchNextTrack, getPrewarmedStream, cleanupPrewarmedStream } = require('./radioPrefetcher');

const players = new Map();
const activeStreams = new Map();
const transitioningGuilds = new Set();
const embedUpdateLocksMap = new Map();
const embedPendingUpdates = new Map();

function getPlayer(guildId) {
    return players.get(guildId) || null;
}

function getOrCreatePlayer(guildId, conn, textChannel, client) {
    let player = players.get(guildId);
    if (!player) {
        player = createAudioPlayer();
        players.set(guildId, player);

        player.on(AudioPlayerStatus.Idle, () => {
            if (transitioningGuilds.has(guildId)) return;
            handleTrackEnd(guildId, textChannel, client);
        });

        player.on('error', (err) => {
            if (transitioningGuilds.has(guildId)) return;
            if (err.message?.includes('Premature close')) return;
            console.error(`[RadioPlayer] Erro no player de ${guildId}:`, err.message);
            handleTrackEnd(guildId, textChannel, client);
        });
    }

    if (conn && conn.state?.status !== 'destroyed') {
        try {
            conn.subscribe(player);
        } catch (_) {}
    }

    return player;
}

async function playChime(guildId) {
    try {
        const conn = getVoiceConnection(guildId);
        if (!conn) return;
        const player = getOrCreatePlayer(guildId, conn);
        const silenceFrame = Buffer.from([0xf8, 0xff, 0xfe]);
        const { Readable } = require('stream');
        const s = new Readable({ read() { this.push(silenceFrame); this.push(null); } });
        const resource = createAudioResource(s, { inputType: StreamType.Opus });
        player.play(resource);
    } catch (_) {}
}

async function playTrack(guildId, track, textChannel, client) {
    const conn = getVoiceConnection(guildId);
    if (!conn) return;

    transitioningGuilds.add(guildId);

    const existingStream = activeStreams.get(guildId);
    if (existingStream) {
        try { existingStream.destroy(); } catch (_) {}
        activeStreams.delete(guildId);
    }

    const player = getOrCreatePlayer(guildId, conn, textChannel, client);
    try { player.stop(true); } catch (_) {}

    updateSession(guildId, { status: 'BUFFERING', currentTrack: track });
    await updateEmbed(guildId, textChannel, client);

    try {
        let played = false;

        if (track.localPath && fs.existsSync(track.localPath)) {
            const resource = createAudioResource(track.localPath, { inlineVolume: false });
            player.play(resource);
            updateSession(guildId, { status: 'PLAYING', currentTrack: track });
            await updateEmbed(guildId, textChannel, client);
            played = true;
        } else if (track.source === 'youtube') {
            let progressiveStream = getPrewarmedStream(guildId, track.link);
            if (progressiveStream && !progressiveStream.destroyedStream) {
                try {
                    activeStreams.set(guildId, progressiveStream);
                    await progressiveStream.waitUntilReady(8000);
                    const resource = createAudioResource(progressiveStream, { inputType: StreamType.Raw });
                    player.play(resource);
                    updateSession(guildId, { status: 'PLAYING', currentTrack: track });
                    await updateEmbed(guildId, textChannel, client);
                    played = true;
                } catch (_) {
                    if (progressiveStream) {
                        try { progressiveStream.destroy(); } catch (_) {}
                    }
                    activeStreams.delete(guildId);
                }
            }

            if (!played) {
                let filePath = track.localPath;
                if (!filePath || !fs.existsSync(filePath)) {
                    filePath = await downloadTrackToDisk(track);
                }
                updateSession(guildId, { status: 'PLAYING', currentTrack: { ...track, localPath: filePath } });
                const resource = createAudioResource(filePath, { inlineVolume: false });
                player.play(resource);
                await updateEmbed(guildId, textChannel, client);
                played = true;
            }
        } else {
            let filePath = track.localPath;
            if (!filePath || !fs.existsSync(filePath)) {
                filePath = await downloadTrackToDisk(track);
            }

            updateSession(guildId, { status: 'PLAYING', currentTrack: { ...track, localPath: filePath } });

            const resource = createAudioResource(filePath, { inlineVolume: false });
            player.play(resource);

            await updateEmbed(guildId, textChannel, client);
            played = true;
        }

        prefetchNextTrack(guildId).catch(() => {});

    } catch (err) {
        console.error(`[RadioPlayer] Falha ao tocar faixa "${track.title}":`, err.message);
        await playChime(guildId);
        if (textChannel) {
            try {
                const { buildNotFoundEmbed } = require('./radioEmbed');
                await textChannel.send({ embeds: [buildNotFoundEmbed(track.title)] });
            } catch (_) {}
        }
        transitioningGuilds.delete(guildId);
        setTimeout(() => handleTrackEnd(guildId, textChannel, client), 1000);
        return;
    } finally {
        setTimeout(() => {
            transitioningGuilds.delete(guildId);
        }, 500);
    }
}

async function handleTrackEnd(guildId, textChannel, client) {
    if (transitioningGuilds.has(guildId)) return;
    transitioningGuilds.add(guildId);

    try {
        const activeStream = activeStreams.get(guildId);
        if (activeStream) {
            try { activeStream.destroy(); } catch (_) {}
            activeStreams.delete(guildId);
        }

        const session = getSession(guildId);
        if (!session || session._leaving || session.status === 'STOPPED') return;

        const next = nextTrack(guildId);
        if (next) {
            await playTrack(guildId, next, textChannel, client);
        } else {
            updateSession(guildId, { status: 'STOPPED', currentTrack: null });
            await updateEmbed(guildId, textChannel, client);
        }
    } finally {
        setTimeout(() => {
            transitioningGuilds.delete(guildId);
        }, 500);
    }
}

async function pausePlayer(guildId) {
    const player = players.get(guildId);
    if (!player) return false;
    player.pause();
    updateSession(guildId, { status: 'PAUSED' });
    return true;
}

async function resumePlayer(guildId) {
    const player = players.get(guildId);
    if (!player) return false;
    player.unpause();
    updateSession(guildId, { status: 'PLAYING' });
    return true;
}

function stopPlayer(guildId) {
    cleanupPrewarmedStream(guildId);
    const activeStream = activeStreams.get(guildId);
    if (activeStream) {
        try { activeStream.destroy(); } catch (_) {}
        activeStreams.delete(guildId);
    }

    const player = players.get(guildId);
    if (player) {
        try { player.stop(true); } catch (_) {}
        players.delete(guildId);
    }
}

async function updateEmbed(guildId, textChannel, client) {
    const session = getSession(guildId);
    if (!session || session._leaving) return;

    if (embedUpdateLocksMap.get(guildId)) {
        embedPendingUpdates.set(guildId, { textChannel, client });
        return;
    }
    embedUpdateLocksMap.set(guildId, true);

    try {
        let targetChannel = textChannel;
        if (!targetChannel && session.textChannelId && client) {
            targetChannel = client.channels?.cache?.get(session.textChannelId) || null;
            if (!targetChannel && client.channels?.fetch) {
                try { targetChannel = await client.channels.fetch(session.textChannelId); } catch (_) {}
            }
        }

        const { embeds, components } = buildRadioEmbed(session);

        if (session.embedMessageId && targetChannel) {
            try {
                const msg = await targetChannel.messages.fetch(session.embedMessageId);
                await msg.edit({ embeds, components });
            } catch (_) {}
        } else if (targetChannel) {
            const msg = await targetChannel.send({ embeds, components });
            updateSession(guildId, { embedMessageId: msg.id });
        }
    } catch (err) {
        console.error('[RadioPlayer] Falha ao atualizar embed:', err.message);
    } finally {
        embedUpdateLocksMap.delete(guildId);
        if (embedPendingUpdates.has(guildId)) {
            const pending = embedPendingUpdates.get(guildId);
            embedPendingUpdates.delete(guildId);
            setTimeout(() => {
                updateEmbed(guildId, pending.textChannel, pending.client);
            }, 600);
        }
    }
}

module.exports = {
    playTrack,
    pausePlayer,
    resumePlayer,
    stopPlayer,
    playChime,
    updateEmbed,
    getPlayer
};
