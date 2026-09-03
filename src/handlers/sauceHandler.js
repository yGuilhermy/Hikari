const axios = require('axios');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { generateResponse } = require('./llmHandler');

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

async function getAnimeSource(imageUrl) {
    try {
        let imageBuffer = null;
        let contentType = 'image/jpeg';

        try {
            const fetchRes = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 12000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                },
                maxContentLength: 25 * 1024 * 1024
            });

            const headerType = fetchRes.headers['content-type'] || '';
            if (headerType.includes('text/html')) {
                const customErr = new Error('O link enviado aponta para uma página web, e não diretamente para um arquivo de imagem (.png, .jpg, .webp). Envie o link direto da imagem ou faça upload dela no Discord.');
                customErr.isUserFacing = true;
                throw customErr;
            }

            contentType = headerType.split(';')[0].trim() || 'image/jpeg';
            imageBuffer = fetchRes.data;
        } catch (downloadErr) {
            if (downloadErr.isUserFacing) throw downloadErr;
            console.warn('[Sauce] Falha ao pré-carregar buffer da imagem, tentando busca por URL direta:', downloadErr.message);
        }

        let response;
        if (imageBuffer && Buffer.isBuffer(imageBuffer) && imageBuffer.length > 0) {
            response = await axios.post('https://api.trace.moe/search?anilistInfo', imageBuffer, {
                headers: { 'Content-Type': contentType },
                timeout: 20000,
                maxBodyLength: 25 * 1024 * 1024
            });
        } else {
            response = await axios.get(`https://api.trace.moe/search?anilistInfo&url=${encodeURIComponent(imageUrl)}`, {
                timeout: 20000
            });
        }

        if (!response.data || !response.data.result || response.data.result.length === 0) {
            return [];
        }

        return response.data.result.slice(0, 5).map(match => ({
            filename: match.filename,
            episode: match.episode,
            similarity: match.similarity,
            videoUrl: match.video,
            image: match.image,
            anilist: match.anilist,
            from: match.from,
            to: match.to,
            at: match.at
        }));
    } catch (error) {
        if (error.isUserFacing) throw error;
        const apiError = error.response?.data?.error || error.message;
        console.error('[Sauce] Erro na API trace.moe:', apiError);
        let userMessage = 'Tive um erro ao consultar o serviço de identificação de animes.';
        const status = error.response?.status;

        if (status === 400 || status === 404 || (typeof apiError === 'string' && apiError.includes('Failed to fetch image'))) {
            if (typeof apiError === 'string' && apiError.includes('Failed to fetch image')) {
                userMessage = 'Não consegui acessar a imagem através desse link. O servidor de imagens recusou o acesso ou o link expirou. Envie a imagem diretamente como anexo no Discord.';
            } else if (typeof apiError === 'string' && apiError.includes('Failed to process image')) {
                userMessage = 'A imagem enviada não pôde ser processada (formato inválido, animado ou corrompido). Envie uma imagem válida (.png, .jpg, .webp).';
            } else {
                userMessage = `A imagem não pôde ser analisada: ${apiError}`;
            }
        } else if (status === 429) {
            userMessage = 'O limite de consultas no trace.moe foi atingido temporariamente. Tente novamente em alguns minutos.';
        } else if (status >= 500) {
            userMessage = 'O serviço trace.moe está instável no momento. Tente novamente mais tarde.';
        } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            userMessage = 'Tempo limite esgotado ao tentar analisar a imagem. Tente novamente.';
        }

        const customErr = new Error(userMessage);
        customErr.isUserFacing = true;
        throw customErr;
    }
}

async function fetchAnilistMetadata(anilistId) {
    if (!anilistId) return null;
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
        }, { timeout: 6000 });
        return response.data?.data?.Media || null;
    } catch (error) {
        console.warn('[Sauce] Falha ao buscar metadata extra do AniList:', error.message);
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
    if (!imageUrl) {
        return interaction.editReply('Você precisa me mandar uma imagem ou um link para eu descobrir o anime!');
    }

    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        return interaction.editReply('Por favor, forneça um link válido começando com http:// ou https://, ou anexe uma imagem.');
    }

    try {
        const results = await getAnimeSource(imageUrl);
        if (!results || results.length === 0) {
            return interaction.editReply('Não encontrei nada parecido com essa imagem em nenhum anime catalogado.');
        }

        const topMatch = results[0];
        const animeName = topMatch.anilist?.title?.romaji || topMatch.anilist?.title?.english || topMatch.anilist?.title?.native || topMatch.filename || 'Anime Desconhecido';
        const isLowConfidence = topMatch.similarity < 0.85;

        if (isLowConfidence) {
            const candidates = results.map(r => r.anilist?.title?.romaji || r.anilist?.title?.english || r.anilist?.title?.native || r.filename || 'Desconhecido');
            const uniqueCandidates = [...new Set(candidates)];
            const prompt = `
[CONTEXTO]
O usuário enviou um screenshot de anime, mas a busca retornou baixa precisão (${(topMatch.similarity * 100).toFixed(1)}%).
Possíveis candidatos: ${uniqueCandidates.slice(0, 3).join(', ')}.
[SUA MISSÃO]
Aja como a Hikari (Otaku/Gamer).
- Diga que está difícil de cravar com certeza porque a cena pode estar editada ou pixelada.
- Comente sobre o candidato principal de forma descontraída.
- Resposta em no máximo 2 frases.
`;
            let llmResponse = `Hmm, a precisão tá meio baixa (~${(topMatch.similarity * 100).toFixed(1)}%). Pode ser **${uniqueCandidates[0]}**, mas não coloco minha mão no fogo!`;
            try {
                const aiReply = await Promise.race([
                    generateResponse(prompt, interaction.channelId, { allowSearch: false, disableTools: true, skipLocal: true }),
                    new Promise(resolve => setTimeout(() => resolve(null), 8000))
                ]);
                if (aiReply && typeof aiReply === 'string' && !aiReply.includes('⚠️ SYSTEM ERROR')) {
                    let clean = aiReply.replace(/\n-# .*$/gm, '').trim();
                    const jsonMatch = clean.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            const parsed = JSON.parse(jsonMatch[0]);
                            clean = parsed.response || parsed.content || parsed.text || clean;
                        } catch (_) {}
                    }
                    llmResponse = clean;
                }
            } catch (_) {}

            const lowConfEmbed = new EmbedBuilder()
                .setColor(0xF59E0B)
                .setTitle(`⚠️ Correspondência com Baixa Confiança (~${(topMatch.similarity * 100).toFixed(1)}%)`)
                .setDescription(llmResponse)
                .addFields(
                    { name: '🎯 Candidato Mais Provável', value: `**${animeName}** (Episódio ${topMatch.episode || 'N/A'}) • Precisão: ${(topMatch.similarity * 100).toFixed(1)}%`, inline: false }
                );

            if (results.length > 1) {
                const othersList = results.slice(1, 4).map(r => {
                    const name = r.anilist?.title?.romaji || r.anilist?.title?.english || r.filename || 'Desconhecido';
                    return `• **${name}** (~${(r.similarity * 100).toFixed(1)}%)`;
                }).join('\n');
                lowConfEmbed.addFields({ name: '🔍 Outras Possibilidades', value: othersList, inline: false });
            }

            if (topMatch.image && (!topMatch.anilist?.isAdult || interaction.channel?.nsfw)) {
                lowConfEmbed.setImage(topMatch.image);
            }

            lowConfEmbed.setFooter({ text: 'trace.moe • Hikari • Imagem com baixa precisão' }).setTimestamp();

            const actionRow = new ActionRowBuilder();
            if (topMatch.anilist?.id) {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setLabel('AniList')
                        .setStyle(ButtonStyle.Link)
                        .setURL(topMatch.anilist.siteUrl || `https://anilist.co/anime/${topMatch.anilist.id}`)
                        .setEmoji('🔗')
                );
            }
            if (topMatch.videoUrl) {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setLabel('Ver Cena')
                        .setStyle(ButtonStyle.Link)
                        .setURL(topMatch.videoUrl)
                        .setEmoji('🎬')
                );
            }

            return interaction.editReply({
                embeds: [lowConfEmbed],
                components: actionRow.components.length > 0 ? [actionRow] : []
            });
        }

        const animeData = topMatch;
        const episodeStr = animeData.episode ? `Episódio ${animeData.episode}` : 'Filme / Especial / OVA';
        const isHentai = Boolean(animeData.anilist?.isAdult);
        const isNsfwChannel = Boolean(interaction.channel?.nsfw);

        const extraInfo = await fetchAnilistMetadata(animeData.anilist?.id);
        const studio = extraInfo?.studios?.nodes?.[0]?.name || animeData.anilist?.studios?.edges?.find(e => e.isMain)?.node?.name || 'Desconhecido';
        const genres = extraInfo?.genres?.join(', ') || animeData.anilist?.genres?.join(', ') || 'N/A';
        const score = extraInfo?.averageScore ? `${extraInfo.averageScore}/100` : (animeData.anilist?.averageScore ? `${animeData.anilist.averageScore}/100` : 'Sem nota');

        let description = extraInfo?.description ? extraInfo.description.replace(/<[^>]*>?/gm, '') : 'Sem descrição disponível.';
        if (description.length > 300) description = description.substring(0, 300) + '...';

        const timestampStr = animeData.from !== undefined ? formatTime(animeData.from) : null;
        const sceneInterval = (animeData.from !== undefined && animeData.to !== undefined) ? `${formatTime(animeData.from)} - ${formatTime(animeData.to)}` : timestampStr;

        const embed = new EmbedBuilder()
            .setColor(isHentai ? 0xE11D48 : 0x3B82F6)
            .setTitle(`🎬 ${animeName}`)
            .setDescription(description)
            .addFields(
                { name: '📺 Episódio', value: episodeStr, inline: true },
                { name: '⏱️ Momento/Cena', value: sceneInterval || 'N/A', inline: true },
                { name: '🎯 Precisão', value: `${(animeData.similarity * 100).toFixed(1)}%`, inline: true },
                { name: '🏢 Estúdio', value: studio, inline: true },
                { name: '⭐ Nota', value: score, inline: true },
                { name: '🔞 Classificação', value: isHentai ? 'NSFW (+18)' : 'Livre / Seguro', inline: true },
                { name: '🎭 Gêneros', value: genres, inline: false }
            )
            .setFooter({ text: 'Sauce identificado via trace.moe • Hikari • by yGuilhermy' })
            .setTimestamp();

        if (isHentai && !isNsfwChannel) {
            embed.addFields({
                name: '⚠️ Conteúdo Adulto (+18)',
                value: 'A imagem da cena foi ocultada porque este canal não está configurado como NSFW.',
                inline: false
            });
            if (animeData.anilist?.coverImage?.large) {
                embed.setThumbnail(animeData.anilist.coverImage.large);
            }
        } else if (animeData.image) {
            embed.setImage(animeData.image);
            if (animeData.anilist?.coverImage?.large) {
                embed.setThumbnail(animeData.anilist.coverImage.large);
            }
        }

        const actionRow = new ActionRowBuilder();
        if (animeData.anilist?.siteUrl || animeData.anilist?.id) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setLabel('Página AniList')
                    .setStyle(ButtonStyle.Link)
                    .setURL(animeData.anilist.siteUrl || `https://anilist.co/anime/${animeData.anilist.id}`)
                    .setEmoji('🔗')
            );
        }
        if (animeData.anilist?.idMal) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setLabel('MyAnimeList')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://myanimelist.net/anime/${animeData.anilist.idMal}`)
                    .setEmoji('⭐')
            );
        }
        if (animeData.videoUrl) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setLabel('Ver Cena (MP4)')
                    .setStyle(ButtonStyle.Link)
                    .setURL(animeData.videoUrl)
                    .setEmoji('🎬')
            );
        }

        await interaction.editReply({
            content: '> 🔎 **Anime identificado!** Buscando opinião da Hikari...',
            embeds: [embed],
            components: actionRow.components.length > 0 ? [actionRow] : []
        });

        const prompt = `
[CONTEXTO]
O usuário enviou um screenshot e é do anime: "${animeName}".
Episódio: ${episodeStr}.
Momento da cena: ${sceneInterval || 'N/A'}.
Gêneros: ${genres}.
Estúdio: ${studio}.
Nota: ${score}.
Sinopse: ${description}.
Classificação +18: ${isHentai ? 'SIM' : 'NÃO'}.
[SUA MISSÃO]
Aja como a Hikari (Analista Otaku).
Faça um comentário curto, autêntico e direto sobre a obra.
- Diga se vale a pena assistir baseando-se no estúdio/nota.
- Dê uma opinião em no máximo 2 frases.
- Finalize com sua "Nota Pessoal: X/10".
`;

        try {
            const llmTask = generateResponse(prompt, interaction.channelId, { allowSearch: false, disableTools: true, skipLocal: true });
            const timeoutTask = new Promise((resolve) => setTimeout(() => resolve(null), 15000));
            const comment = await Promise.race([llmTask, timeoutTask]);

            if (comment && typeof comment === 'string' && !comment.includes('⚠️ SYSTEM ERROR')) {
                let cleanComment = comment.replace(/\n-# .*$/gm, '').trim();
                const jsonMatch = cleanComment.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        cleanComment = parsed.response || parsed.content || parsed.text || cleanComment;
                    } catch (_) {}
                }
                const currentDesc = embed.data.description || "";
                embed.setDescription(`${currentDesc}\n\n**🗣️ Comentário da Hikari:**\n${cleanComment}`);
            }

            await interaction.editReply({
                content: null,
                embeds: [embed],
                components: actionRow.components.length > 0 ? [actionRow] : []
            });
        } catch (_) {
            await interaction.editReply({
                content: null,
                embeds: [embed],
                components: actionRow.components.length > 0 ? [actionRow] : []
            });
        }
    } catch (error) {
        console.error('[Sauce] Erro no handleSauceCommand:', error.isUserFacing ? error.message : (error.message || error));
        const replyText = error.isUserFacing ? error.message : 'Tive um erro interno ao processar sua imagem. Tente novamente.';
        await interaction.editReply({ content: replyText, embeds: [], components: [] });
    }
}

module.exports = { handleSauceCommand, getAnimeSource };