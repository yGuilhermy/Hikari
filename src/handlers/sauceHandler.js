const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const { generateResponse } = require('./llmHandler');
async function getAnimeSource(imageUrl) {
    try {
        const response = await axios.get(`https://api.trace.moe/search?anilistInfo&url=${encodeURIComponent(imageUrl)}`, {
            timeout: 15000
        });
        if (!response.data || !response.data.result || response.data.result.length === 0) {
            return [];
        }
        return response.data.result.slice(0, 3).map(match => ({
            filename: match.filename,
            episode: match.episode,
            similarity: match.similarity,
            videoUrl: match.video,
            image: match.image,
            anilist: match.anilist
        }));
    } catch (error) {
        const apiError = error.response?.data?.error || error.message;
        console.error('[Sauce] Erro na API trace.moe:', apiError);
        let userMessage = 'Tive um erro ao consultar o trace.moe.';
        if (error.response?.status === 400) {
            if (typeof apiError === 'string' && apiError.includes('Failed to fetch image')) {
                userMessage = 'Não consegui acessar a imagem através desse link. Certifique-se de que o link aponta diretamente para uma imagem (.png, .jpg, .webp) e não para uma página web, ou anexe a imagem diretamente no Discord.';
            } else if (typeof apiError === 'string' && apiError.includes('Failed to process image')) {
                userMessage = 'A imagem enviada não pôde ser processada (formato inválido ou corrompido). Envie uma imagem válida (.png, .jpg, .webp).';
            } else {
                userMessage = `A API recusou a imagem fornecida: ${apiError}`;
            }
        } else if (error.response?.status === 429) {
            userMessage = 'O limite de consultas no trace.moe foi atingido temporariamente. Tente novamente em alguns minutos.';
        } else if (error.response?.status >= 500) {
            userMessage = 'O serviço trace.moe está instável no momento. Tente novamente mais tarde.';
        } else if (error.code === 'ECONNABORTED') {
            userMessage = 'Tempo limite esgotado ao tentar consultar o trace.moe. Tente novamente.';
        }
        const customErr = new Error(userMessage);
        customErr.isUserFacing = true;
        throw customErr;
    }
}
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}
async function fetchAnilistMetadata(anilistId) {
    const query = `
    query ($id: Int) {
        Media (id: $id, type: ANIME) {
            description(asHtml: false)
            genres
            averageScore
            studios(isMain: true) {
                nodes {
                    name
                }
            }
        }
    }
    `;
    try {
        const response = await axios.post('https://graphql.anilist.co', {
            query: query,
            variables: { id: anilistId }
        });
        return response.data.data.Media;
    } catch (error) {
        console.error('Erro ao buscar metadata do Anilist:', error.message);
        return null;
    }
}
async function handleSauceCommand(interaction) {
    await interaction.deferReply();
    const attachment = interaction.options.getAttachment('imagem');
    const urlString = interaction.options.getString('url');
    if (attachment && attachment.contentType && !attachment.contentType.startsWith('image/')) {
        return interaction.editReply('O arquivo enviado precisa ser uma imagem válida (PNG, JPG, WebP).');
    }
    const imageUrl = attachment?.url || urlString?.trim();
    console.log(`[LOG] Slash: /sauce | Usuário: ${interaction.user.tag} (${interaction.user.id}) | Local: {${interaction.guild?.name || 'DM'} - ${interaction.guildId || 'N/A'}} | Imagem/URL: ${imageUrl}`);
    if (!imageUrl) {
        return interaction.editReply('Você precisa me mandar uma imagem ou um link para eu descobrir o anime!');
    }
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        return interaction.editReply('Por favor, forneça um link válido começando com http:// ou https://, ou anexe uma imagem.');
    }
    try {
        const results = await getAnimeSource(imageUrl);
        if (!results || results.length === 0) {
            return interaction.editReply('Não encontrei nada parecido com essa imagem.');
        }
        const topMatch = results[0];
        const isLowConfidence = topMatch.similarity < 0.85;
        if (isLowConfidence) {
            const candidates = results.map(r => r.anilist.title.romaji || r.anilist.title.english || r.anilist.title.native || "Desconhecido");
            const uniqueCandidates = [...new Set(candidates)];
            const prompt = `
[CONTEXTO]
O usuário mandou um screenshot de anime, mas a busca retornou baixa precisão (< 85%).
Possíveis candidatos: ${uniqueCandidates.join(', ')}.
[SUA MISSÃO]
Aja como a Hikari (Otaku/Gamer).
- Diga que está difícil de ver ("tá meio pixelado", "não tenho certeza").
- Cite que pode ser um dos animes da lista retornado pela API.
- Escolha um deles (aleatoriamente ou o que você "preferir") e faça um comentário pessoal/engraçado sobre ele ("torça para ser X porque Y").
- Não dê notas, apenas comente a dúvida.
- Resposta curta e direta.
`;
            let llmResponse = `Hmm, não tenho certeza. Pode ser **${uniqueCandidates[0]}** ou algum outro da lista...`;
            try { llmResponse = await generateResponse(prompt, interaction.channelId, { allowSearch: false, disableTools: true, skipLocal: true }); } catch (ignored) { }
            let msg = `${llmResponse}\n\n**Resultados Imprecisos (Possíveis Matches):**\n`;
            results.forEach(r => {
                const name = r.anilist.title.romaji || r.anilist.title.english;
                msg += `- **${name}** (~${(r.similarity * 100).toFixed(1)}%)\n`;
            });
            return interaction.editReply({ content: msg });
        }
        const animeData = topMatch;
        const animeName = animeData.anilist.title.romaji || animeData.anilist.title.english || animeData.anilist.title.native;
        const episode = animeData.episode ? `Episódio ${animeData.episode}` : 'Filme/OVA';
        const isHentai = animeData.anilist.isAdult;
        const extraInfo = await fetchAnilistMetadata(animeData.anilist.id);
        const studio = extraInfo?.studios?.nodes?.[0]?.name || "Desconhecido";
        const genres = extraInfo?.genres?.join(', ') || "N/A";
        const score = extraInfo?.averageScore ? `${extraInfo.averageScore}/100` : "Sem nota";
        let description = extraInfo?.description ? extraInfo.description.replace(/<[^>]*>?/gm, '') : "Sem descrição";
        if (description.length > 300) description = description.substring(0, 300) + '...';
        const embed = new EmbedBuilder()
            .setColor(isHentai ? 0xE11D48 : 0x3B82F6)
            .setTitle(`🎬 ${animeName}`)
            .setDescription(description)
            .setImage(animeData.image)
            .addFields(
                { name: '📺 Episódio', value: `${episode}`, inline: true },
                { name: '🏢 Estúdio', value: `${studio}`, inline: true },
                { name: '⭐ Nota', value: `${score}`, inline: true },
                { name: '🎭 Gêneros', value: `${genres}`, inline: false },
                { name: '🔞 Classificação', value: isHentai ? 'NSFW (+18)' : 'Seguro', inline: true },
                { name: '🎯 Precisão', value: `${(animeData.similarity * 100).toFixed(1)}%`, inline: true }
            )
            .setFooter({ text: 'Sauce encontrado via trace.moe • Hikari • by yGuilhermy' })
            .setTimestamp();
        if (animeData.videoUrl) {
            embed.setDescription(`${description}\n\n🎥 **[Ver Cena Original](${animeData.videoUrl})**`);
        }
        await interaction.editReply({
            content: '> 🔎 **Encontrei!** Analisando detalhes...',
            embeds: [embed]
        });
        const prompt = `
[CONTEXTO]
O usuário enviou um screenshot e é do anime: "${animeName}".
Episódio: ${episode}.
Gêneros: ${genres}.
Estúdio: ${studio}.
Nota Anilist: ${score}.
Sinopse: ${description}.
Classificação +18: ${isHentai ? 'SIM' : 'NÃO'}.
[SUA MISSÃO]
Aja como a Hikari (Analista de Animes).
Faça um comentário TÉCNICO e DIRETO sobre a obra.
- Evite gírias excessivas ou "papo fofo". Vá direto ao ponto.
- Avalie se vale a pena assistir baseando-se no estúdio e nota.
- Dê uma opinião curta e honesta.
- Finalize com uma "Nota Pessoal" (0/10).
MÁXIMO 2 LINHAS + A NOTA.
`;
        try {
            console.log('[SAUCE] Iniciando geração de comentário background...');
            const llmTask = generateResponse(prompt, interaction.channelId, { allowSearch: false, disableTools: true, skipLocal: true });
            const timeoutTask = new Promise((resolve) => setTimeout(() => resolve(null), 60000));
            const comment = await Promise.race([llmTask, timeoutTask]);
            if (comment && typeof comment === 'string') {
                const currentDesc = embed.data.description || "";
                embed.setDescription(`${currentDesc}\n\n**🗣️ Comentário da Hikari:**\n${comment}`);
                await interaction.editReply({
                    content: null,
                    embeds: [embed]
                });
            } else {
                await interaction.editReply({
                    content: null,
                    embeds: [embed]
                });
            }
        } catch (err) {
            console.error("Erro no Sauce Background:", err.message);
            await interaction.editReply({ content: null, embeds: [embed] });
        }
    } catch (error) {
        console.error('[Sauce] Erro no handleSauceCommand:', error.isUserFacing ? error.message : (error.message || error));
        const replyText = error.isUserFacing ? error.message : 'Tive um erro interno ao processar sua imagem.';
        await interaction.editReply(replyText);
    }
}
module.exports = { handleSauceCommand };