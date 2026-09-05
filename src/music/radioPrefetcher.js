const fs = require('fs');
const path = require('path');
const { getSession, peekNextTrack } = require('./radioDatabase');
const { downloadTrackToDisk } = require('./radioProviders');
const { TEMP_RADIO_DIR } = require('./radioCleaner');

const activePrefetchQueues = new Set();
const prewarmedStreams = new Map();
const TEMP_DIR = TEMP_RADIO_DIR;

function cleanupOrphanedAudioFiles() {
    try {
        if (fs.existsSync(TEMP_DIR)) {
            const files = fs.readdirSync(TEMP_DIR);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(TEMP_DIR, file));
                } catch (_) {}
            }
        }
    } catch (_) {}
}

cleanupOrphanedAudioFiles();

function cleanupPrewarmedStream(guildId) {
    const entry = prewarmedStreams.get(guildId);
    if (entry) {
        try {
            if (entry.stream) entry.stream.destroy();
        } catch (_) {}
        prewarmedStreams.delete(guildId);
    }
}

function getPrewarmedStream(guildId, link) {
    const entry = prewarmedStreams.get(guildId);
    if (entry && entry.link === link && entry.stream && !entry.stream.destroyedStream) {
        prewarmedStreams.delete(guildId);
        return entry.stream;
    }
    if (entry) {
        cleanupPrewarmedStream(guildId);
    }
    return null;
}

async function downloadWithTimeout(track, timeoutMs = 35000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timeout no download da faixa'));
        }, timeoutMs);

        downloadTrackToDisk(track)
            .then((filePath) => {
                clearTimeout(timer);
                resolve(filePath);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

async function prefetchPlaylistTracks(guildId) {
    if (activePrefetchQueues.has(guildId)) return;
    activePrefetchQueues.add(guildId);

    try {
        const session = getSession(guildId);
        if (!session || !Array.isArray(session.playlist) || session.playlist.length === 0) {
            cleanupPrewarmedStream(guildId);
            return;
        }

        const track = peekNextTrack(guildId);
        if (!track) {
            cleanupPrewarmedStream(guildId);
            return;
        }

        cleanupPrewarmedStream(guildId);

        if (track.localPath && fs.existsSync(track.localPath)) return;
        if (track._prefetching) return;

        track._prefetching = true;
        try {
            const filePath = await downloadWithTimeout(track, 35000);
            track._prefetching = false;
            if (filePath && fs.existsSync(filePath)) {
                track.localPath = filePath;
            }
        } catch (_) {
            track._prefetching = false;
        }
    } catch (_) {
    } finally {
        activePrefetchQueues.delete(guildId);
    }
}

async function prefetchNextTrack(guildId) {
    prefetchPlaylistTracks(guildId).catch(() => {});
}

function cleanupSessionAudioFiles(session) {
    if (!session || !Array.isArray(session.playlist)) return;
    for (const track of session.playlist) {
        if (track && track.localPath) {
            try {
                if (fs.existsSync(track.localPath)) {
                    fs.unlinkSync(track.localPath);
                }
            } catch (_) {}
            track.localPath = null;
        }
    }
}

module.exports = {
    prefetchNextTrack,
    prefetchPlaylistTracks,
    cleanupSessionAudioFiles,
    cleanupOrphanedAudioFiles,
    getPrewarmedStream,
    cleanupPrewarmedStream
};
