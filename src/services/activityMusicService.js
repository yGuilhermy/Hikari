const { ActivityType } = require('discord.js');

const PREMID_YTMUSIC_APP_ID = '463151177836658699';

const PLATFORM_PRIORITY = [
    {
        id: 'spotify',
        label: 'Spotify',
        emoji: '🟢',
        match: (a) => a.name === 'Spotify' && a.type === ActivityType.Listening,
        extract: (a) => ({
            title: a.details,
            artist: a.state?.replace(/^by\s+/i, '') || null,
            album: a.assets?.largeText || null,
            coverUrl: a.assets?.largeImage?.startsWith('spotify:')
                ? `https://i.scdn.co/image/${a.assets.largeImage.replace('spotify:', '')}`
                : null,
        }),
    },
    {
        id: 'ytmusic',
        label: 'YouTube Music',
        emoji: '▶️',
        match: (a) =>
            (a.applicationId === PREMID_YTMUSIC_APP_ID ||
                a.name?.toLowerCase() === 'youtube music') &&
            a.details,
        extract: (a) => ({
            title: a.details,
            artist: a.state || null,
            album: a.assets?.largeText || null,
            coverUrl: typeof a.assets?.largeImage === 'string' && a.assets.largeImage.startsWith('http')
                ? a.assets.largeImage
                : null,
        }),
    },
    {
        id: 'other',
        label: 'Outros',
        emoji: '🎵',
        match: (a) => a.type === ActivityType.Listening && a.details,
        extract: (a) => ({
            title: a.details,
            artist: a.state || null,
            album: a.assets?.largeText || null,
            coverUrl: typeof a.assets?.largeImage === 'string' && a.assets.largeImage.startsWith('http')
                ? a.assets.largeImage
                : null,
        }),
    },
];

async function resolveMember(userId, client, preferGuildId = null) {
    if (!userId) return null;
    const rawInput = String(userId).trim();
    const idMatch = rawInput.match(/\d{17,20}/);
    const targetId = idMatch ? idMatch[0] : null;
    const cleanName = rawInput.replace(/^[<@!>]+|[>]+$/g, '').toLowerCase().trim();

    let candidateMember = null;

    if (preferGuildId) {
        const guild = client.guilds.cache.get(preferGuildId);
        if (guild) {
            try {
                if (targetId) {
                    const member = await guild.members.fetch({ user: targetId, force: true, withPresences: true }).catch(() => null);
                    if (member) {
                        if (member.presence && member.presence.status !== 'offline') return member;
                        candidateMember = member;
                    }
                } else if (cleanName) {
                    let member = guild.members.cache.find(m =>
                        m.user?.username?.toLowerCase() === cleanName ||
                        m.displayName?.toLowerCase() === cleanName ||
                        m.user?.globalName?.toLowerCase() === cleanName
                    );
                    if (!member) {
                        const searchResults = await guild.members.search({ query: cleanName, limit: 5 }).catch(() => null);
                        if (searchResults && searchResults.size > 0) {
                            member = searchResults.find(m =>
                                m.user?.username?.toLowerCase() === cleanName ||
                                m.displayName?.toLowerCase() === cleanName
                            ) || searchResults.first();
                        }
                    }
                    if (member) {
                        if (member.presence && member.presence.status !== 'offline') return member;
                        candidateMember = member;
                    }
                }
            } catch (_) {}
        }
    }

    for (const guild of client.guilds.cache.values()) {
        if (preferGuildId && guild.id === preferGuildId) continue;
        try {
            if (targetId) {
                const member = await guild.members.fetch({ user: targetId, force: true, withPresences: true }).catch(() => null);
                if (member) {
                    if (member.presence && member.presence.status !== 'offline') return member;
                    if (!candidateMember) candidateMember = member;
                }
            } else if (cleanName) {
                const member = guild.members.cache.find(m =>
                    m.user?.username?.toLowerCase() === cleanName ||
                    m.displayName?.toLowerCase() === cleanName ||
                    m.user?.globalName?.toLowerCase() === cleanName
                );
                if (member) {
                    if (member.presence && member.presence.status !== 'offline') return member;
                    if (!candidateMember) candidateMember = member;
                }
            }
        } catch (_) {}
    }
    return candidateMember;
}

async function getCurrentMusicFromUser(userId, client, preferGuildId = null) {
    const member = await resolveMember(userId, client, preferGuildId);

    if (!member) {
        const cleanName = String(userId || '').replace(/^[<@!>]+|[>]+$/g, '').trim();
        return {
            success: false,
            reason: 'no_guild',
            message: `Não consegui encontrar o usuário "${cleanName || 'desconhecido'}" em nenhum servidor compartilhado comigo.`,
        };
    }

    const userName = member.user?.displayName || member.user?.globalName || member.user?.username || member.displayName || 'Usuário';

    if (!member.presence || member.presence.status === 'offline') {
        return {
            success: false,
            reason: 'no_presence',
            userName,
            isOffline: true,
            message: `O usuário **${userName}** está offline ou invisível no Discord. O Discord não compartilha músicas de quem está offline ou com status de atividade desativado.`,
            helpInstructions: true,
        };
    }

    const activities = member.presence.activities || [];

    for (const platform of PLATFORM_PRIORITY) {
        const activity = activities.find(a => platform.match(a));
        if (!activity) continue;

        const data = platform.extract(activity);
        if (!data.title) continue;

        const artistName = data.artist || 'Artista desconhecido';
        const platformLabel = platform.label || 'Outros';

        const searchQuery = [data.title, data.artist].filter(Boolean).join(' ');
        return {
            success: true,
            platform: platform.id,
            platformLabel,
            platformEmoji: platform.emoji,
            title: data.title,
            artist: artistName,
            album: data.album || null,
            coverUrl: data.coverUrl || null,
            targetUser: {
                id: member.user?.id || member.id,
                username: member.user?.username || userName,
                displayName: userName,
            },
            searchQuery,
        };
    }

    return {
        success: false,
        reason: 'no_music',
        userName,
        message: `O usuário **${userName}** está online, mas não está ouvindo nenhuma música no momento (Spotify ou YouTube Music).`,
        helpInstructions: true,
    };
}

module.exports = { getCurrentMusicFromUser };
