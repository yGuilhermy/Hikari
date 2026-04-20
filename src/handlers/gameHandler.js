const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, AttachmentBuilder, EmbedBuilder, ComponentType } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const SOURCES = [
    { name: 'FitGirl', url: path.join(__dirname, '../data/fitgirl.json'), emoji: '💃' },
    { name: 'DODI', url: path.join(__dirname, '../data/dodi.json'), emoji: '🦆' }
];
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
async function searchGames(gameName) {
    let fitgirlMatches = [];
    let dodiMatches = [];
    const normalizedName = gameName.toLowerCase();
    await Promise.all(SOURCES.map(async (source) => {
        try {
            let data;
            if (source.url.startsWith('http')) {
                const response = await axios.get(source.url);
                data = response.data;
            } else {
                const filePath = path.isAbsolute(source.url) ? source.url : path.join(process.cwd(), source.url);
                const rawData = await fs.promises.readFile(filePath, 'utf-8');
                data = JSON.parse(rawData);
            }
            const games = data.downloads;
            const found = games.filter(game =>
                game.title.toLowerCase().includes(normalizedName)
            ).map(game => {
                const originalMagnet = game.uris.find(u => u.startsWith('magnet:?'));
                if (!originalMagnet) return null;
                const cleanData = cleanMagnet(originalMagnet);
                return {
                    provider: source.name,
                    emoji: source.emoji,
                    title: game.title.trim(),
                    fileSize: game.fileSize.replace(/\s+/g, ' ').trim(),
                    uploadDate: game.uploadDate,
                    magnet: cleanData.magnet,
                    hash: cleanData.hash
                };
            }).filter(item => item !== null);
            if (source.name === 'FitGirl') fitgirlMatches = found;
            if (source.name === 'DODI') dodiMatches = found;
        } catch (err) {
            console.error(`Erro ao buscar em ${source.name}:`, err.message);
        }
    }));
    const finalResults = [];
    if (fitgirlMatches.length > 0) finalResults.push(fitgirlMatches.shift());
    if (dodiMatches.length > 0) finalResults.push(dodiMatches.shift());
    const leftovers = [...fitgirlMatches, ...dodiMatches];
    const slotsRemaining = 5 - finalResults.length;
    if (slotsRemaining > 0) finalResults.push(...leftovers.slice(0, slotsRemaining));
    return finalResults;
}
async function getTorrentOrMagnet(game) {
    const torrentData = await fetchTorrentFile(game.hash);
    if (torrentData) {
        return {
            type: 'file',
            buffer: Buffer.from(torrentData),
            fileName: `${game.title.substring(0, 20).replace(/[^a-z0-9]/gi, '_')}.torrent`,
            message: `✅ **Arquivo .torrent encontrado!**\n\n⚠️ **Necessário qBittorrent**\nBasta baixar o arquivo anexo e dar duplo clique para iniciar.`,
            color: '#00FF00'
        };
    } else {
        return {
            type: 'magnet',
            buffer: Buffer.from(game.magnet, 'utf-8'),
            fileName: 'link_magnetico.txt',
            message: `⚠️ **Arquivo .torrent não encontrado (Cache Miss).**\nEnviei um arquivo de texto com o Magnet Link.\n\n⚠️ **Necessário qBittorrent**\nCopie o conteúdo do arquivo e cole no seu gerenciador de torrents.`,
            color: '#FFA500'
        };
    }
}
async function executeGameCommand(interaction) {
    const gameName = interaction.options.getString('nome');
    console.log(`[LOG] Slash: /game | Usuário: ${interaction.user.tag} (${interaction.user.id}) | Local: {${interaction.guild?.name || 'DM'} - ${interaction.guildId || 'N/A'}} | Jogo: "${gameName}"`);
    const interactionResponse = await interaction.deferReply({ ephemeral: false });
    try {
        const finalResults = await searchGames(gameName);
        if (finalResults.length === 0) {
            return interaction.editReply({ content: `❌ Nada encontrado para "**${gameName}**".` });
        }
        const optionsEmbed = new EmbedBuilder()
            .setTitle(`🔎 Resultados para: "${gameName}"`)
            .setDescription('Selecione uma das opções no menu abaixo para receber o arquivo de download.')
            .setColor('#5865F2')
            .setFooter({ text: 'Hikari Torrent Search • by yGuilhermy' });
        finalResults.forEach((game, index) => {
            const date = new Date(game.uploadDate).toLocaleDateString('pt-BR');
            const safeTitle = game.title.length > 80 ? game.title.substring(0, 77) + '...' : game.title;
            optionsEmbed.addFields({
                name: `${index + 1}️⃣ ${game.emoji} ${safeTitle}`,
                value: `📦 **Tamanho:** ${game.fileSize} | 📅 **Data:** ${date}\n\u200b`
            });
        });
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_game')
            .setPlaceholder('📂 Escolha o arquivo para baixar...')
            .addOptions(
                finalResults.map((game, index) => {
                    const safeTitle = game.title.length > 90 ? game.title.substring(0, 90) + '...' : game.title;
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`${index + 1}. ${safeTitle}`)
                        .setDescription(`${game.provider} - ${game.fileSize}`)
                        .setValue(index.toString())
                        .setEmoji(game.emoji);
                })
            );
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.editReply({ embeds: [optionsEmbed], components: [row] });
        const collector = interactionResponse.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60000
        });
        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Faça sua própria busca com /game.', ephemeral: true });
            }
            await i.update({ content: '🔄 **Processando...** Buscando arquivo...', components: [], embeds: [] });
            const selectedIndex = parseInt(i.values[0]);
            const selectedGame = finalResults[selectedIndex];
            console.log(`[LOG] Seleção Game: ${selectedGame.title} | Usuário: ${i.user.tag} (${i.user.id}) | Local: {${i.guild?.name || 'DM'} - ${i.guildId || 'N/A'}}`);
            const result = await getTorrentOrMagnet(selectedGame);
            const attachment = new AttachmentBuilder(result.buffer, { name: result.fileName });
            const successEmbed = new EmbedBuilder()
                .setTitle(`🚀 Download Pronto: ${selectedGame.title}`)
                .setDescription(result.message)
                .setColor(result.color)
                .addFields({ name: 'Backup Magnet', value: `\`\`\`${selectedGame.magnet}\`\`\`` })
                .setFooter({ text: 'Hikari Torrent Search • by yGuilhermy' });
            await i.editReply({ content: '', embeds: [successEmbed], files: [attachment] });
        });
        collector.on('end', collected => {
            if (collected.size === 0) interaction.editReply({ content: '⏱️ Tempo esgotado.', components: [], embeds: [] }).catch(() => { });
        });
    } catch (error) {
        console.error('Erro no gameHandler:', error);
        await interaction.editReply('Ocorreu um erro interno ao processar a busca.');
    }
}
module.exports = { executeGameCommand, searchGames, getTorrentOrMagnet };