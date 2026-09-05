const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SESSION_FILE = path.join(DATA_DIR, 'radio_sessions.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'radio_guild_settings.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const sessions = new Map();
let guildSettingsMap = new Map();

function _loadGuildSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            guildSettingsMap = new Map(Object.entries(data));
        }
    } catch (_) {}
}

function _saveGuildSettings() {
    try {
        const obj = {};
        guildSettingsMap.forEach((v, k) => { obj[k] = v; });
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(obj, null, 2));
    } catch (_) {}
}

_loadGuildSettings();

function getGuildSavedSettings(guildId) {
    return guildSettingsMap.get(guildId) || null;
}

function saveGuildSavedSettings(guildId, patch) {
    const current = guildSettingsMap.get(guildId) || {};
    const updated = { ...current, ...patch };
    guildSettingsMap.set(guildId, updated);
    _saveGuildSettings();
}

function _save() {}

function _generateShuffleOrder(session) {
    if (!session || !Array.isArray(session.playlist) || session.playlist.length === 0) {
        session.shuffleOrder = [];
        session.shufflePos = 0;
        return;
    }
    const total = session.playlist.length;
    const current = (session.currentIndex >= 0 && session.currentIndex < total) ? session.currentIndex : 0;
    const remaining = [];
    for (let i = 0; i < total; i++) {
        if (i !== current) remaining.push(i);
    }
    for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    session.shuffleOrder = [current, ...remaining];
    session.shufflePos = 0;
}

function _syncLegacyFields(session) {
    if (!session) return;
    if (!Array.isArray(session.playlist)) session.playlist = [];
    if (typeof session.currentIndex !== 'number') session.currentIndex = -1;
    if (!Array.isArray(session.shuffleOrder)) session.shuffleOrder = [];
    if (typeof session.shufflePos !== 'number') session.shufflePos = 0;
    if (!session.voiceMode || session.voiceListening === false) {
        session.voiceMode = session.voiceListening === false ? 'OFF' : 'IA';
    }
    session.voiceListening = (session.voiceMode !== 'OFF');
    if (!session.streamMode) session.streamMode = 'HYBRID';

    if (session.status === 'STOPPED') {
        session.currentTrack = null;
    } else {
        session.currentTrack = (session.currentIndex >= 0 && session.currentIndex < session.playlist.length) 
            ? session.playlist[session.currentIndex] 
            : null;
    }
    session.history = session.playlist.slice(0, Math.max(0, session.currentIndex));
    session.queue = session.playlist.slice(Math.max(0, session.currentIndex + 1));
}

function createSession(guildId, voiceChannelId, textChannelId) {
    const saved = getGuildSavedSettings(guildId) || {};
    const session = {
        guildId,
        voiceChannelId,
        textChannelId,
        embedMessageId: null,
        status: 'STOPPED',
        loopMode: 'OFF',
        shuffle: false,
        shuffleOrder: [],
        shufflePos: 0,
        voiceMode: saved.voiceMode || 'DIRECT',
        voiceListening: saved.voiceMode ? (saved.voiceMode !== 'OFF') : true,
        streamMode: saved.streamMode || 'HYBRID',
        currentIndex: -1,
        playlist: [],
        listeners: []
    };
    _syncLegacyFields(session);
    sessions.set(guildId, session);
    _save();
    return session;
}

function getSession(guildId) {
    const s = sessions.get(guildId);
    if (s) _syncLegacyFields(s);
    return s || null;
}

function updateSession(guildId, patch) {
    const s = sessions.get(guildId);
    if (!s) return null;
    Object.assign(s, patch);
    _syncLegacyFields(s);
    if (patch.voiceMode !== undefined || patch.streamMode !== undefined) {
        saveGuildSavedSettings(guildId, {
            ...(patch.voiceMode !== undefined && { voiceMode: patch.voiceMode }),
            ...(patch.streamMode !== undefined && { streamMode: patch.streamMode })
        });
    }
    _save();
    return s;
}

function destroySession(guildId) {
    sessions.delete(guildId);
    _save();
}

function hasActiveSession(guildId) {
    return sessions.has(guildId);
}

function addTrackToQueue(guildId, track) {
    const s = sessions.get(guildId);
    if (!s) return null;
    if (!Array.isArray(s.playlist)) s.playlist = [];
    s.playlist.push(track);
    const newIdx = s.playlist.length - 1;
    if (s.shuffle && Array.isArray(s.shuffleOrder)) {
        const unplayedRange = Math.max(0, s.shuffleOrder.length - s.shufflePos - 1);
        const insertOffset = Math.floor(Math.random() * (unplayedRange + 1));
        s.shuffleOrder.splice(s.shufflePos + 1 + insertOffset, 0, newIdx);
    }
    _syncLegacyFields(s);
    _save();
    return s.playlist.length;
}

function skipToTrack(guildId, position) {
    const s = sessions.get(guildId);
    if (!s || !Array.isArray(s.playlist)) return null;
    const targetIdx = position - 1;
    if (targetIdx < 0 || targetIdx >= s.playlist.length) return null;
    s.currentIndex = targetIdx;
    s.status = 'PLAYING';
    if (s.shuffle) {
        _generateShuffleOrder(s);
    }
    _syncLegacyFields(s);
    _save();
    return s;
}

function peekNextTrack(guildId) {
    const s = sessions.get(guildId);
    if (!s || !Array.isArray(s.playlist) || s.playlist.length === 0) return null;

    if (s.loopMode === 'TRACK' && s.currentIndex >= 0 && s.currentIndex < s.playlist.length) {
        return s.playlist[s.currentIndex];
    }

    if (s.shuffle && s.playlist.length > 1) {
        if (!Array.isArray(s.shuffleOrder) || s.shuffleOrder.length !== s.playlist.length) {
            _generateShuffleOrder(s);
        }
        const nextPos = s.shufflePos + 1;
        if (nextPos < s.shuffleOrder.length) {
            const idx = s.shuffleOrder[nextPos];
            return s.playlist[idx] || null;
        } else if (s.loopMode === 'QUEUE') {
            const idx = s.shuffleOrder[0];
            return s.playlist[idx] || null;
        } else {
            return null;
        }
    }

    const nextIdx = s.currentIndex + 1;
    if (nextIdx < s.playlist.length) {
        return s.playlist[nextIdx];
    } else if (s.loopMode === 'QUEUE') {
        return s.playlist[0] || null;
    }
    return null;
}

function nextTrack(guildId) {
    const s = sessions.get(guildId);
    if (!s || !Array.isArray(s.playlist) || s.playlist.length === 0) return null;

    if (s.loopMode === 'TRACK' && s.currentIndex >= 0 && s.currentIndex < s.playlist.length) {
        s.status = 'PLAYING';
        _syncLegacyFields(s);
        _save();
        return s.playlist[s.currentIndex];
    }

    if (s.shuffle && s.playlist.length > 1) {
        if (!Array.isArray(s.shuffleOrder) || s.shuffleOrder.length !== s.playlist.length) {
            _generateShuffleOrder(s);
        }
        const nextPos = s.shufflePos + 1;
        if (nextPos < s.shuffleOrder.length) {
            s.shufflePos = nextPos;
            s.currentIndex = s.shuffleOrder[s.shufflePos];
            s.status = 'PLAYING';
        } else if (s.loopMode === 'QUEUE') {
            _generateShuffleOrder(s);
            s.shufflePos = 0;
            s.currentIndex = s.shuffleOrder[0];
            s.status = 'PLAYING';
        } else {
            s.status = 'STOPPED';
            _syncLegacyFields(s);
            _save();
            return null;
        }
    } else {
        const nextIdx = s.currentIndex + 1;
        if (nextIdx < s.playlist.length) {
            s.currentIndex = nextIdx;
            s.status = 'PLAYING';
        } else if (s.loopMode === 'QUEUE') {
            s.currentIndex = 0;
            s.status = 'PLAYING';
        } else {
            s.status = 'STOPPED';
            _syncLegacyFields(s);
            _save();
            return null;
        }
    }

    _syncLegacyFields(s);
    _save();
    return s.currentTrack;
}

function prevTrack(guildId) {
    const s = sessions.get(guildId);
    if (!s || !Array.isArray(s.playlist) || s.playlist.length === 0) return null;

    if (s.shuffle && s.playlist.length > 1) {
        if (Array.isArray(s.shuffleOrder) && s.shufflePos > 0) {
            s.shufflePos--;
            s.currentIndex = s.shuffleOrder[s.shufflePos];
            s.status = 'PLAYING';
        } else {
            s.status = 'PLAYING';
        }
    } else {
        if (s.currentIndex > 0) {
            s.currentIndex--;
            s.status = 'PLAYING';
        } else {
            s.currentIndex = 0;
            s.status = 'PLAYING';
        }
    }

    _syncLegacyFields(s);
    _save();
    return s.currentTrack;
}

function setLoopMode(guildId) {
    const s = sessions.get(guildId);
    if (!s) return null;
    const modes = ['OFF', 'TRACK', 'QUEUE'];
    const idx = modes.indexOf(s.loopMode);
    s.loopMode = modes[(idx + 1) % modes.length];
    _save();
    return s.loopMode;
}

function toggleShuffle(guildId) {
    const s = sessions.get(guildId);
    if (!s) return null;
    s.shuffle = !s.shuffle;
    if (s.shuffle) {
        _generateShuffleOrder(s);
    } else {
        s.shuffleOrder = [];
        s.shufflePos = 0;
    }
    _save();
    return s.shuffle;
}

function toggleVoiceListening(guildId) {
    const s = sessions.get(guildId);
    if (!s) return null;
    s.voiceListening = !s.voiceListening;
    s.voiceMode = s.voiceListening ? 'IA' : 'OFF';
    saveGuildSavedSettings(guildId, { voiceMode: s.voiceMode });
    _save();
    return s.voiceListening;
}

function cycleVoiceMode(guildId) {
    const s = sessions.get(guildId);
    if (!s) return null;
    const modes = ['OFF', 'IA', 'DIRECT'];
    const currentMode = s.voiceMode || (s.voiceListening ? 'IA' : 'OFF');
    const currentIdx = modes.indexOf(currentMode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    s.voiceMode = nextMode;
    s.voiceListening = (nextMode !== 'OFF');
    saveGuildSavedSettings(guildId, { voiceMode: s.voiceMode });
    _save();
    return s.voiceMode;
}

function getAllSessions() {
    return Array.from(sessions.values());
}

function stopRadio(guildId) {
    const s = sessions.get(guildId);
    if (!s) return null;
    s.status = 'STOPPED';
    s.playlist = [];
    s.currentIndex = -1;
    s.currentTrack = null;
    s.shuffleOrder = [];
    s.shufflePos = 0;
    _syncLegacyFields(s);
    _save();
    return s;
}

function removeTrackFromPlaylist(guildId, position) {
    const s = sessions.get(guildId);
    if (!s || !Array.isArray(s.playlist) || s.playlist.length === 0) return null;
    const idx = position - 1;
    if (idx < 0 || idx >= s.playlist.length) return null;

    const removedTrack = s.playlist.splice(idx, 1)[0];
    const isCurrent = (idx === s.currentIndex);

    if (s.shuffle && Array.isArray(s.shuffleOrder)) {
        const orderIdx = s.shuffleOrder.indexOf(idx);
        if (orderIdx !== -1) {
            s.shuffleOrder.splice(orderIdx, 1);
            if (orderIdx < s.shufflePos) {
                s.shufflePos = Math.max(0, s.shufflePos - 1);
            }
        }
        s.shuffleOrder = s.shuffleOrder.map(i => i > idx ? i - 1 : i);
    }

    if (s.playlist.length === 0) {
        s.currentIndex = -1;
        s.currentTrack = null;
        s.status = 'STOPPED';
        s.shuffleOrder = [];
        s.shufflePos = 0;
    } else if (idx < s.currentIndex) {
        s.currentIndex -= 1;
    } else if (idx === s.currentIndex) {
        if (s.currentIndex >= s.playlist.length) {
            s.currentIndex = s.playlist.length - 1;
        }
    }
    _syncLegacyFields(s);
    _save();

    return {
        removedTrack,
        isCurrent,
        remainingCount: s.playlist.length,
        newCurrentTrack: s.currentTrack
    };
}

function toggleStreamMode(guildId) {
    const s = sessions.get(guildId);
    if (!s) return null;
    s.streamMode = s.streamMode === 'FAST' ? 'HYBRID' : 'FAST';
    saveGuildSavedSettings(guildId, { streamMode: s.streamMode });
    _save();
    return s.streamMode;
}

module.exports = {
    createSession,
    getSession,
    updateSession,
    destroySession,
    hasActiveSession,
    addTrackToQueue,
    skipToTrack,
    peekNextTrack,
    nextTrack,
    prevTrack,
    setLoopMode,
    toggleShuffle,
    toggleVoiceListening,
    cycleVoiceMode,
    toggleStreamMode,
    getAllSessions,
    stopRadio,
    removeTrackFromPlaylist
};
