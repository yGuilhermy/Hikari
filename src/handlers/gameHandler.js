const { ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SOURCES = [
    { name: 'FitGirl', url: path.join(__dirname, '../data/fitgirl.json'), emoji: '💃' },
    { name: 'DODI', url: path.join(__dirname, '../data/dodi.json'), emoji: '🦆' }
];

const aliases = {
    'gta v': 'grand theft auto v',
    'gta 5': 'grand theft auto v',
    'rdr2': 'red dead redemption 2',
    'rdr 2': 'red dead redemption 2',
    'cod': 'call of duty',
    'elder ring': 'elden ring',
    'elderring': 'elden ring',
    'eldenring': 'elden ring'
};

function normalizeString(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[:\-\/\(\)\[\]\?!.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

function fuzzyWordMatch(searchWord, titleWord) {
    if (titleWord.includes(searchWord)) return true;
    if (searchWord.length < 3) return searchWord === titleWord;
    const maxDist = searchWord.length <= 6 ? 1 : 2;
    return levenshtein(searchWord, titleWord) <= maxDist;
}

function fuzzyTitleMatch(searchWords, normTitle) {
    const titleWords = normTitle.split(' ').filter(w => w.length > 0);
    return searchWords.every(sw => titleWords.some(tw => fuzzyWordMatch(sw, tw)));
}

function cleanMagnet(magnetLink) {
    try {
        const urlParams = new URLSearchParams(magnetLink.replace('magnet:?', ''));
        const hash = urlParams.get('xt');
        if (hash) return { magnet: `magnet:?xt=${hash}`, hash: hash.replace('urn:btih:', '') };
        return { magnet: magnetLink, hash: null };
    } catch (e) {
        return { magnet: magnetLink, hash: null };
    }
}

async function fetchTorrentFile(hash) {
    if (!hash) return null;
    try {
        const url = `https://itorrents.org/torrent/${hash}.torrent`;
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 3000 });
        return response.data;
    } catch (error) {
        return null;
    }
}

const localDataCache = new Map();

async function getSourceData(source) {
    if (source.url.startsWith('http')) {
        const response = await axios.get(source.url);
        return response.data;
    }
    const filePath = path.isAbsolute(source.url) ? source.url : path.join(process.cwd(), source.url);
    if (localDataCache.has(filePath)) {
        return localDataCache.get(filePath);
    }
    const rawData = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(rawData);
    localDataCache.set(filePath, parsed);
    return parsed;
}

async function searchGames(gameName, provider = 'any') {
    let fitgirlMatches = [];
    let dodiMatches = [];
    
    let query = normalizeString(gameName);
    for (const [key, value] of Object.entries(aliases)) {
        const regex = new RegExp('\\b' + key + '\\b', 'g');
        query = query.replace(regex, value);
    }
    
    const searchWords = query.split(' ').filter(w => w.length > 0);
    if (searchWords.length === 0) return [];

    const activeSources = SOURCES.filter(s => {
        if (!provider || provider === 'any') return true;
        return s.name.toLowerCase() === provider.toLowerCase();
    });

    const buildResult = (game, source, fuzzy = false) => {
        const originalMagnet = game.uris && game.uris.find(u => u.startsWith('magnet:?'));
        if (!originalMagnet) return null;
        const cleanData = cleanMagnet(originalMagnet);
        return {
            provider: source.name,
            emoji: source.emoji,
            title: game.title.trim(),
            fileSize: (game.fileSize || '').replace(/\s+/g, ' ').trim(),
            uploadDate: game.uploadDate,
            magnet: cleanData.magnet,
            hash: cleanData.hash,
            isFuzzy: fuzzy
        };
    };

    await Promise.all(activeSources.map(async (source) => {
        try {
            const data = await getSourceData(source);
            if (!data || !Array.isArray(data.downloads)) {
                console.error(`[gameHandler] Dados inválidos ou ausentes para fonte ${source.name}`);
                return;
            }
            const games = data.downloads;

            let found = games
                .filter(game => {
                    const normTitle = normalizeString(game.title);
                    return searchWords.every(word => normTitle.includes(word));
                })
                .map(game => buildResult(game, source, false))
                .filter(Boolean);

            if (found.length === 0) {
                found = games
                    .filter(game => fuzzyTitleMatch(searchWords, normalizeString(game.title)))
                    .map(game => buildResult(game, source, true))
                    .filter(Boolean);
                if (found.length > 0) {
                    console.log(`[gameHandler] Fuzzy fallback ativado para "${gameName}" em ${source.name}: ${found.length} resultado(s)`);
                }
            }

            if (source.name === 'FitGirl') fitgirlMatches = found;
            if (source.name === 'DODI') dodiMatches = found;
        } catch (err) {
            console.error(`[gameHandler] Erro ao buscar em ${source.name}:`, err.message, err.stack);
        }
    }));

    const finalResults = [];
    const maxLength = Math.max(fitgirlMatches.length, dodiMatches.length);
    for (let i = 0; i < maxLength; i++) {
        if (i < fitgirlMatches.length) finalResults.push(fitgirlMatches[i]);
        if (i < dodiMatches.length) finalResults.push(dodiMatches[i]);
        if (finalResults.length >= 25) break;
    }
    return finalResults.slice(0, 25);
}

async function getTorrentOrMagnet(game) {
    const torrentData = await fetchTorrentFile(game.hash);
    if (torrentData) {
        return {
            type: 'file',
            buffer: Buffer.from(torrentData),
            fileName: `${game.title.substring(0, 20).replace(/[^a-z0-9]/gi, '_')}.torrent`,
            message: `✅ **Arquivo .torrent carregado com sucesso!**\n\n📖 **Guia Rápido de Instalação:**\n1️⃣ Baixe o arquivo \`.torrent\` anexado acima.\n2️⃣ Dê dois cliques para abri-lo no seu cliente torrent (recomendamos o **qBittorrent**).\n3️⃣ Escolha o local de destino e clique em **OK** para começar a baixar.`,
            color: '#10B981'
        };
    } else {
        return {
            type: 'magnet',
            buffer: Buffer.from(game.magnet, 'utf-8'),
            fileName: 'link_magnetico.txt',
            message: `⚠️ **Arquivo .torrent não encontrado (Cache Miss)**\nO arquivo foi enviado em formato de texto \`.txt\` com o link direto.\n\n📖 **Guia Rápido de Magnet Link:**\n1️⃣ Copie o código contido no campo abaixo ou abra o arquivo \`.txt\` anexo.\n2️⃣ No seu cliente torrent (ex: **qBittorrent**), clique no botão de adicionar link (ícone de link/corrente).\n3️⃣ Cole o código copiado e confirme para iniciar o download.`,
            color: '#F59E0B'
        };
    }
}

function createPaginationComponents(page, totalPages, itemsInPage = [], startIndex = 0) {
    const safeItems = Array.isArray(itemsInPage) ? itemsInPage : [];
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_game')
        .setPlaceholder('📂 Escolha o arquivo para baixar...')
        .addOptions(
            safeItems.length > 0 ? safeItems.map((game, index) => {
                const safeTitle = (game.title || '').length > 90 ? (game.title || '').substring(0, 90) + '...' : (game.title || 'Arquivo');
                return {
                    label: `${startIndex + index + 1}. ${safeTitle}`,
                    description: `${game.provider || 'Fonte'} - ${game.fileSize || 'N/A'}`,
                    value: (startIndex + index).toString(),
                    emoji: game.emoji || '🎮'
                };
            }) : [{ label: '1. Nenhum jogo', value: '0' }]
        );
    const rowMenu = new ActionRowBuilder().addComponents(selectMenu);

    const prevButton = new ButtonBuilder()
        .setCustomId('game_prev')
        .setLabel('⬅️ Anterior')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);

    const nextButton = new ButtonBuilder()
        .setCustomId('game_next')
        .setLabel('➡️ Próximo')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1);

    const rowButtons = new ActionRowBuilder().addComponents(prevButton, nextButton);
    
    const components = [rowMenu];
    if (totalPages > 1) {
        components.push(rowButtons);
    }
    return components;
}

async function executeGameCommand(interaction) {
    const gameName = interaction.options.getString('nome');
    const provider = interaction.options.getString('fonte') || 'any';
    console.log(`[LOG] Slash: /buscar_jogo | Usuário: ${interaction.user.tag} (${interaction.user.id}) | Jogo: "${gameName}" | Fonte: "${provider}"`);
    
    const interactionResponse = await interaction.deferReply({ ephemeral: false });
    try {
        const finalResults = await searchGames(gameName, provider);
        if (finalResults.length === 0) {
            return interaction.editReply({ content: `❌ Nada encontrado para "**${gameName}**".` });
        }
        
        const pageSize = 5;
        const totalPages = Math.ceil(finalResults.length / pageSize);
        let currentPage = 0;
        
        const renderPage = (page) => {
            const startIndex = page * pageSize;
            const endIndex = Math.min(startIndex + pageSize, finalResults.length);
            const pageItems = finalResults.slice(startIndex, endIndex);
            const hasFuzzy = finalResults.some(g => g.isFuzzy);

            let description = '';
            if (hasFuzzy) {
                description += `> ⚠️ **Busca aproximada:** Nenhum resultado exato encontrado para **"${gameName}"**. Exibindo resultados similares.\n\n`;
            }
            description += 'Selecione uma das opções no menu abaixo para receber o arquivo de download.\n\n';
            pageItems.forEach((game, index) => {
                const date = new Date(game.uploadDate).toLocaleDateString('pt-BR');
                const safeTitle = game.title.length > 70 ? game.title.substring(0, 67) + '...' : game.title;
                const displayIndex = startIndex + index + 1;
                description += `**#${displayIndex}** ${game.emoji} **${safeTitle}**\n`;
                description += `\`📦 ${game.fileSize}\`  •  \`📅 ${date}\`  •  \`${game.provider}\`\n\n`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`🔍 Resultados para: "${gameName}" (Página ${page + 1}/${totalPages})`)
                .setDescription(description)
                .setColor(hasFuzzy ? '#F59E0B' : '#8F55FD')
                .setFooter({ text: 'Hikari Torrent • by yGuilhermy' });
            
            const components = createPaginationComponents(page, totalPages, pageItems, startIndex);
            return { embeds: [embed], components };
        };
        
        await interaction.editReply(renderPage(currentPage));
        
        const collector = interactionResponse.createMessageComponentCollector({
            time: 120000
        });
        
        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Faça sua própria busca com /buscar_jogo.', ephemeral: true });
            }
            
            if (i.customId === 'game_prev') {
                currentPage--;
                await i.update(renderPage(currentPage));
            } else if (i.customId === 'game_next') {
                currentPage++;
                await i.update(renderPage(currentPage));
            } else if (i.customId === 'select_game') {
                await i.update({ content: '🔄 **Processando...** Buscando arquivo...', components: [], embeds: [] });
                const selectedIndex = parseInt(i.values[0]);
                const selectedGame = finalResults[selectedIndex];
                console.log(`[LOG] Seleção Game: ${selectedGame.title} | Usuário: ${i.user.tag} (${i.user.id})`);
                const result = await getTorrentOrMagnet(selectedGame);
                const attachment = new AttachmentBuilder(result.buffer, { name: result.fileName });
                const successEmbed = new EmbedBuilder()
                    .setTitle(`🚀 Download Pronto: ${selectedGame.title}`)
                    .setDescription(result.message)
                    .setColor(result.color)
                    .addFields({ name: '🔗 Magnet Link (Backup)', value: `\`\`\`${selectedGame.magnet}\`\`\`` })
                    .setFooter({ text: 'Hikari Torrent Search • by yGuilhermy' });
                await i.editReply({ content: '', embeds: [successEmbed], files: [attachment] });
                collector.stop();
            }
        });
        
        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.deleteReply().catch(() => {});
            }
        });
    } catch (error) {
        console.error('Erro no gameHandler:', error);
        await interaction.editReply('Ocorreu um erro interno ao processar a busca.');
    }
}

module.exports = { executeGameCommand, searchGames, getTorrentOrMagnet, createPaginationComponents, normalizeString };