const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');
const config = require('../config');
const {
    setChannelPersona,
    setChannelChatter,
    getChannelSettings,
    getServerSettings,
    setServerEveryoneMention,
    setServerUpdateChannel,
    getDisabledTools,
    getAllMcpTools,
    setServerToolEnabled,
    resetServerTools,
    isChannelDisabled,
    setChannelDisabled,
    setMultipleChannelsDisabled,
    clearAllDisabledChannels,
    blockAllGuildChannels,
    getDisabledChannels
} = require('./llmHandler');
const { sendMcpToolsManager } = require('./mcpToolPanelHandler');

const textChannelTypes = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice
];

const userChannelSelections = new Map();

function cleanUserSelections() {
    const now = Date.now();
    for (const [userId, data] of userChannelSelections.entries()) {
        if (now - data.timestamp > 600000) {
            userChannelSelections.delete(userId);
        }
    }
}

function getGuildTextChannels(guild) {
    if (!guild || !guild.channels || !guild.channels.cache) return [];
    const validChannels = Array.from(guild.channels.cache.values())
        .filter(c => !c.isThread?.() && (textChannelTypes.includes(c.type) || (typeof c.isTextBased === 'function' && c.isTextBased())));

    return validChannels.sort((a, b) => {
        const catA = a.parent;
        const catB = b.parent;

        const catPosA = catA ? (catA.rawPosition ?? catA.position ?? 0) : -1;
        const catPosB = catB ? (catB.rawPosition ?? catB.position ?? 0) : -1;

        if (catPosA !== catPosB) {
            return catPosA - catPosB;
        }

        if (catA && catB && catA.id !== catB.id) {
            return catA.id.localeCompare(catB.id);
        }

        const isVoiceA = a.type === ChannelType.GuildVoice || a.type === ChannelType.GuildStageVoice;
        const isVoiceB = b.type === ChannelType.GuildVoice || b.type === ChannelType.GuildStageVoice;

        if (isVoiceA !== isVoiceB) {
            return isVoiceA ? 1 : -1;
        }

        const posA = a.rawPosition ?? a.position ?? 0;
        const posB = b.rawPosition ?? b.position ?? 0;
        return posA - posB;
    });
}

function addChannelListFields(embed, channels, formatFn) {
    if (!channels || channels.length === 0) {
        embed.addFields({ name: '📋 Canais', value: '*Nenhum canal nesta página.*', inline: false });
        return;
    }
    const fullText = channels.map(formatFn).join('\n');
    if (fullText.length <= 1024) {
        embed.addFields({ name: `📋 Canais da Página (${channels.length})`, value: fullText || '*Vazio*', inline: false });
    } else {
        const mid = Math.ceil(channels.length / 2);
        const text1 = channels.slice(0, mid).map(formatFn).join('\n').substring(0, 1020);
        const text2 = channels.slice(mid).map(formatFn).join('\n').substring(0, 1020);
        embed.addFields(
            { name: `📋 Canais (1 - ${mid})`, value: text1 || '*Vazio*', inline: false },
            { name: `📋 Canais (${mid + 1} - ${channels.length})`, value: text2 || '*Vazio*', inline: false }
        );
    }
}

async function handleServerAdminCommand(interaction) {
    const hasPermission = !interaction.guild || (interaction.member && (
        interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
    )) || config.isOwner(interaction.user.id);

    if (!hasPermission) {
        const errEmbed = new EmbedBuilder()
            .setColor(0xE11D48)
            .setTitle('❌ Acesso Negado')
            .setDescription('Você precisa de permissão de **Gerenciar Servidor** ou **Gerenciar Canais** para usar este comando.');
        return interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    const canalAlvo = interaction.options.getChannel('canal_alvo');
    const canalStatus = interaction.options.getString('canal_status');
    const instrucao = interaction.options.getString('instrucao');
    const mood = interaction.options.getString('mood');
    const resetHumor = interaction.options.getBoolean('reset_humor');
    const espontaneoEstado = interaction.options.getString('espontaneo_estado');
    const espontaneoFrequencia = interaction.options.getString('espontaneo_frequencia');
    const espontaneoPorcentagem = interaction.options.getInteger('espontaneo_porcentagem');
    const canalUpdates = interaction.options.getChannel('canal_updates');
    const mencoesAtivo = interaction.options.getBoolean('mencoes_ativo');

    const targetChannelId = canalAlvo ? canalAlvo.id : interaction.channelId;

    const hasOptions = canalStatus !== null || instrucao !== null || mood !== null || resetHumor !== null ||
                       espontaneoEstado !== null || espontaneoFrequencia !== null || espontaneoPorcentagem !== null ||
                       canalUpdates !== null || mencoesAtivo !== null;

    if (hasOptions) {
        const results = [];

        if (canalStatus !== null && interaction.guildId) {
            const isDisable = canalStatus === 'disable';
            setChannelDisabled(interaction.guildId, targetChannelId, isDisable);
            results.push(`🚫 **Status do Canal:** ${isDisable ? '🔴 Totalmente Desativado' : '🟢 Reativado'} em <#${targetChannelId}>.`);
        }

        if (resetHumor) {
            setChannelPersona(targetChannelId, { reset: true });
            results.push(`🔄 **Humor & Personalidade:** Resetados para o padrão em <#${targetChannelId}>.`);
        } else if (instrucao !== null || mood !== null) {
            setChannelPersona(targetChannelId, { instruction: instrucao || undefined, mood: mood || undefined });
            results.push(`🎭 **Humor & Personalidade:** Atualizado em <#${targetChannelId}>. (Mood: \`${mood || 'Não alterado'}\`)`);
        }

        if (espontaneoEstado !== null || espontaneoFrequencia !== null || espontaneoPorcentagem !== null) {
            if (espontaneoPorcentagem !== null && !config.isOwner(interaction.user.id)) {
                return interaction.reply({ content: '❌ Apenas o criador pode definir a porcentagem exata.', ephemeral: true });
            }
            const isActive = espontaneoEstado !== null ? espontaneoEstado === 'on' : undefined;
            setChannelChatter(targetChannelId, {
                active: isActive,
                frequency: espontaneoFrequencia || undefined,
                percentage: espontaneoPorcentagem || undefined
            });
            const statusStr = isActive !== undefined ? (isActive ? '🟢 Ativado' : '🔴 Desativado') : 'Atualizado';
            results.push(`🗣️ **Modo Espontâneo:** ${statusStr} em <#${targetChannelId}> ${espontaneoFrequencia ? `(Frequência: \`${espontaneoFrequencia}\`)` : ''}`);
        }

        if (canalUpdates !== null) {
            if (!canalUpdates.isTextBased()) {
                return interaction.reply({ content: '❌ O canal de updates deve ser um canal de texto.', ephemeral: true });
            }
            setServerUpdateChannel(interaction.guildId, canalUpdates.id);
            results.push(`📢 **Canal de Updates:** Definido para <#${canalUpdates.id}>`);
        }

        if (mencoesAtivo !== null) {
            setServerEveryoneMention(interaction.guildId, mencoesAtivo);
            results.push(`🔔 **Respostas a @everyone/@here:** ${mencoesAtivo ? '✅ Ativado' : '❌ Desativado'}`);
        }

        const embed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle('⚙️ Configuração do Servidor Aplicada')
            .setDescription(results.join('\n\n'))
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return sendServerAdminDashboard(interaction);
}

async function sendServerAdminDashboard(interaction, isUpdate = false) {
    const embed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle('⚙️ Painel de Administração do Servidor')
        .setDescription('Selecione uma das opções abaixo para configurar a **Hikari** neste servidor.')
        .addFields(
            { name: '🚫 Bloquear / Liberar Chats', value: 'Desative a IA completamente em chats específicos (ordenados por categoria) ou em lote.', inline: false },
            { name: '🎭 Personalidade & Humor', value: 'Configure a atitude da IA ou adicione instruções para qualquer canal do servidor.', inline: false },
            { name: '💬 Mensagens Espontâneas', value: 'Ajuste com que frequência a IA entra nas conversas por conta própria em cada canal.', inline: false },
            { name: '📢 Canal de Updates', value: 'Escolha o canal onde o bot enviará avisos de atualizações.', inline: false },
            { name: '🔔 Resposta a @everyone / @here', value: 'Defina se a IA deve responder quando o servidor for mencionado em massa.', inline: false },
            { name: '🔧 Ferramentas MCP', value: 'Inspecione descrições e ative/desative ferramentas de IA para este servidor.', inline: false }
        )
        .setFooter({ text: 'Hikari Administrative Dashboard • by yGuilhermy' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('srvcfg_btn_canal_status').setLabel('Bloquear/Liberar Chats').setStyle(ButtonStyle.Secondary).setEmoji('🚫'),
        new ButtonBuilder().setCustomId('srvcfg_btn_humor').setLabel('Personalidade & Humor').setStyle(ButtonStyle.Primary).setEmoji('🎭'),
        new ButtonBuilder().setCustomId('srvcfg_btn_espontaneo').setLabel('Mensagens Espontâneas').setStyle(ButtonStyle.Secondary).setEmoji('💬'),
        new ButtonBuilder().setCustomId('srvcfg_btn_updates').setLabel('Canal de Updates').setStyle(ButtonStyle.Secondary).setEmoji('📢')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('srvcfg_btn_mencoes').setLabel('Respostas a Mentions').setStyle(ButtonStyle.Secondary).setEmoji('🔔'),
        new ButtonBuilder().setCustomId('srvcfg_btn_mcp').setLabel('Ferramentas MCP').setStyle(ButtonStyle.Secondary).setEmoji('🔧'),
        new ButtonBuilder().setLabel('Apoiar projeto').setURL('https://bio.site/yGuilhermy').setStyle(ButtonStyle.Link).setEmoji('💖')
    );

    if (isUpdate) {
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: false });
}

async function sendChannelBlockManager(interaction, page = 0, isUpdate = false) {
    const rawChannels = getGuildTextChannels(interaction.guild);
    const disabledChannels = getDisabledChannels(interaction.guildId);

    const disabledList = rawChannels.filter(c => disabledChannels.includes(c.id));
    const activeList = rawChannels.filter(c => !disabledChannels.includes(c.id));
    const allChannels = [...disabledList, ...activeList];

    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(allChannels.length / pageSize));
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const pageChannels = allChannels.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    const embed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle('🚫 Gerenciamento de Bloqueio de Chats')
        .setDescription(`Quando um canal estiver **desativado**, a Hikari ignorará totalmente mensagens, gatilhos, falas espontâneas e comandos naquele chat.\n\n• **Total de Canais:** \`${allChannels.length}\` | **Bloqueados:** \`${disabledChannels.length}\`\n• **Página:** \`${currentPage + 1}/${totalPages}\` *(ordenados pela hierarquia do servidor)*`)
        .setFooter({ text: 'Hikari Channel Security • by yGuilhermy' })
        .setTimestamp();

    if (pageChannels.length > 0) {
        addChannelListFields(embed, pageChannels, c => {
            const isDis = disabledChannels.includes(c.id);
            return `${isDis ? '🔴' : '🟢'} <#${c.id}>`;
        });
    } else {
        embed.addFields({ name: '📋 Canais', value: '*Nenhum canal de texto encontrado neste servidor.*', inline: false });
    }

    const components = [];

    if (pageChannels.length > 0) {
        const channelSelect = new StringSelectMenuBuilder()
            .setCustomId(`srvcfg_block_selpage_${currentPage}`)
            .setPlaceholder(`📍 Marcar canais da Pág ${currentPage + 1}/${totalPages}`)
            .setMinValues(1)
            .setMaxValues(pageChannels.length)
            .addOptions(pageChannels.map(c => {
                const isDis = disabledChannels.includes(c.id);
                const parentName = c.parent?.name ? `📁 ${c.parent.name}` : 'Sem categoria';
                const typeIcon = (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) ? '🔊' : '#';
                return {
                    label: `${typeIcon} ${c.name || 'canal'}`.substring(0, 100),
                    value: c.id,
                    description: `${isDis ? '[BLOQUEADO]' : '[ATIVO]'} • ${parentName}`.substring(0, 100),
                    emoji: isDis ? '🔴' : '🟢'
                };
            }));
        components.push(new ActionRowBuilder().addComponents(channelSelect));
    }

    const rowPagination = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`srvcfg_block_page_${currentPage - 1}`).setLabel('⬅️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
        new ButtonBuilder().setCustomId('srvcfg_block_info').setLabel(`Pág ${currentPage + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`srvcfg_block_page_${currentPage + 1}`).setLabel('Próximo ➡️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages - 1),
        new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel').setStyle(ButtonStyle.Primary).setEmoji('🏠')
    );
    components.push(rowPagination);

    const rowGlobals = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('srvcfg_massa_bloquear_todos').setLabel('Bloquear Todos').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('srvcfg_massa_liberar_todos').setLabel('Liberar Todos').setStyle(ButtonStyle.Success).setEmoji('🧹')
    );
    components.push(rowGlobals);

    if (isUpdate) {
        return interaction.update({ embeds: [embed], components });
    }
    return interaction.reply({ embeds: [embed], components, ephemeral: false });
}

async function sendHumorChannelSelector(interaction, page = 0, isUpdate = false) {
    const rawChannels = getGuildTextChannels(interaction.guild);
    const customList = rawChannels.filter(c => {
        const s = getChannelSettings(c.id);
        return Boolean(s.instruction || s.mood);
    });
    const defaultList = rawChannels.filter(c => {
        const s = getChannelSettings(c.id);
        return !s.instruction && !s.mood;
    });
    const allChannels = [...customList, ...defaultList];

    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(allChannels.length / pageSize));
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const pageChannels = allChannels.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    const embed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle('🎭 Personalidade & Humor por Chat')
        .setDescription(`Selecione abaixo o canal onde deseja alterar a personalidade, humor ou instruções da Hikari.\n\n• **Página:** \`${currentPage + 1}/${totalPages}\` (Total de canais: \`${allChannels.length}\`)`)
        .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

    if (pageChannels.length > 0) {
        addChannelListFields(embed, pageChannels, c => {
            const s = getChannelSettings(c.id);
            const hasCustom = Boolean(s.instruction || s.mood);
            return `${hasCustom ? '🎭' : '•'} <#${c.id}>`;
        });
    }

    const components = [];

    if (pageChannels.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`srvcfg_humor_selch_${currentPage}`)
            .setPlaceholder(`📍 Escolha o canal alvo (Pág ${currentPage + 1}/${totalPages})`)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(pageChannels.map(c => {
                const s = getChannelSettings(c.id);
                const hasCustom = Boolean(s.instruction || s.mood);
                const parentName = c.parent?.name ? `📁 ${c.parent.name}` : 'Sem categoria';
                const typeIcon = (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) ? '🔊' : '#';
                return {
                    label: `${typeIcon} ${c.name || 'canal'}`.substring(0, 100),
                    value: c.id,
                    description: (hasCustom ? (s.mood ? `[Humor: ${s.mood}]` : '[Customizado]') : parentName).substring(0, 100),
                    emoji: hasCustom ? '🎭' : '💬'
                };
            }));
        components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    const rowPagination = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`srvcfg_humor_page_${currentPage - 1}`).setLabel('⬅️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
        new ButtonBuilder().setCustomId('srvcfg_humor_info').setLabel(`Pág ${currentPage + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`srvcfg_humor_page_${currentPage + 1}`).setLabel('Próximo ➡️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages - 1),
        new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel').setStyle(ButtonStyle.Primary).setEmoji('🏠')
    );
    components.push(rowPagination);

    if (isUpdate) {
        return interaction.update({ embeds: [embed], components });
    }
    return interaction.reply({ embeds: [embed], components, ephemeral: false });
}

async function sendEspontaneoChannelSelector(interaction, page = 0, isUpdate = false) {
    const rawChannels = getGuildTextChannels(interaction.guild);
    const activeList = rawChannels.filter(c => getChannelSettings(c.id)?.chatter?.active);
    const inactiveList = rawChannels.filter(c => !getChannelSettings(c.id)?.chatter?.active);
    const allChannels = [...activeList, ...inactiveList];

    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(allChannels.length / pageSize));
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const pageChannels = allChannels.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    const embed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle('💬 Mensagens Espontâneas por Chat')
        .setDescription(`Selecione abaixo o canal onde deseja configurar as falas espontâneas da Hikari.\n\n• **Página:** \`${currentPage + 1}/${totalPages}\` (Total de canais: \`${allChannels.length}\`)`)
        .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

    if (pageChannels.length > 0) {
        addChannelListFields(embed, pageChannels, c => {
            const settings = getChannelSettings(c.id);
            const isActive = settings?.chatter?.active;
            return `${isActive ? '🟢' : '⚪'} <#${c.id}>`;
        });
    }

    const components = [];

    if (pageChannels.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`srvcfg_esp_selch_${currentPage}`)
            .setPlaceholder(`📍 Escolha o canal alvo (Pág ${currentPage + 1}/${totalPages})`)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(pageChannels.map(c => {
                const settings = getChannelSettings(c.id);
                const isActive = settings?.chatter?.active;
                const parentName = c.parent?.name ? `📁 ${c.parent.name}` : 'Sem categoria';
                const typeIcon = (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) ? '🔊' : '#';
                return {
                    label: `${typeIcon} ${c.name || 'canal'}`.substring(0, 100),
                    value: c.id,
                    description: `${isActive ? '[ESPONTÂNEO ATIVO]' : '[DESATIVADO]'} • ${parentName}`.substring(0, 100),
                    emoji: isActive ? '🟢' : '⚪'
                };
            }));
        components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    const rowPagination = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`srvcfg_esp_page_${currentPage - 1}`).setLabel('⬅️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
        new ButtonBuilder().setCustomId('srvcfg_esp_info').setLabel(`Pág ${currentPage + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`srvcfg_esp_page_${currentPage + 1}`).setLabel('Próximo ➡️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages - 1),
        new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel').setStyle(ButtonStyle.Primary).setEmoji('🏠')
    );
    components.push(rowPagination);

    if (isUpdate) {
        return interaction.update({ embeds: [embed], components });
    }
    return interaction.reply({ embeds: [embed], components, ephemeral: false });
}

async function sendUpdatesChannelSelector(interaction, page = 0, isUpdate = false) {
    const rawChannels = getGuildTextChannels(interaction.guild);
    const currentUpdateId = getServerSettings(interaction.guildId)?.updateChannelId;
    const currentList = rawChannels.filter(c => c.id === currentUpdateId);
    const otherList = rawChannels.filter(c => c.id !== currentUpdateId);
    const allChannels = [...currentList, ...otherList];

    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(allChannels.length / pageSize));
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const pageChannels = allChannels.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    const embed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle('📢 Configurar Canal de Updates')
        .setDescription(`Selecione abaixo o canal onde a Hikari enviará avisos de atualizações e novidades.\n\n• **Página:** \`${currentPage + 1}/${totalPages}\` (Total de canais: \`${allChannels.length}\`)`)
        .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

    if (pageChannels.length > 0) {
        addChannelListFields(embed, pageChannels, c => `${c.id === currentUpdateId ? '📢' : '•'} <#${c.id}>`);
    }

    const components = [];

    if (pageChannels.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`srvcfg_updates_selch_${currentPage}`)
            .setPlaceholder(`📍 Escolha o canal de updates (Pág ${currentPage + 1}/${totalPages})`)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(pageChannels.map(c => {
                const isCurrent = c.id === currentUpdateId;
                const parentName = c.parent?.name ? `📁 ${c.parent.name}` : 'Sem categoria';
                const typeIcon = (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) ? '🔊' : '#';
                return {
                    label: `${typeIcon} ${c.name || 'canal'}`.substring(0, 100),
                    value: c.id,
                    description: (isCurrent ? '[CANAL ATUAL DE UPDATES]' : parentName).substring(0, 100),
                    emoji: isCurrent ? '📢' : '💬'
                };
            }));
        components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    const rowPagination = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`srvcfg_updates_page_${currentPage - 1}`).setLabel('⬅️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
        new ButtonBuilder().setCustomId('srvcfg_updates_info').setLabel(`Pág ${currentPage + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`srvcfg_updates_page_${currentPage + 1}`).setLabel('Próximo ➡️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages - 1),
        new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel').setStyle(ButtonStyle.Primary).setEmoji('🏠')
    );
    components.push(rowPagination);

    if (isUpdate) {
        return interaction.update({ embeds: [embed], components });
    }
    return interaction.reply({ embeds: [embed], components, ephemeral: false });
}

async function handleServerAdminInteraction(interaction) {
    const hasPermission = !interaction.guild || (interaction.member && (
        interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
    )) || config.isOwner(interaction.user.id);

    if (!hasPermission) {
        const errEmbed = new EmbedBuilder()
            .setColor(0xE11D48)
            .setTitle('❌ Acesso Negado')
            .setDescription('Você precisa de permissão de **Gerenciar Servidor** ou **Gerenciar Canais** para alterar esta configuração.');
        return interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    cleanUserSelections();
    const { customId } = interaction;

    if (customId === 'srvcfg_voltar_dashboard') {
        return sendServerAdminDashboard(interaction, true);
    }

    if (customId === 'srvcfg_btn_mcp') {
        return sendMcpToolsManager(interaction, interaction.guildId, null, false, false);
    }

    if (customId === 'srvcfg_btn_canal_status') {
        return sendChannelBlockManager(interaction, 0, true);
    }

    if (customId.startsWith('srvcfg_block_page_')) {
        const page = parseInt(customId.replace('srvcfg_block_page_', ''), 10) || 0;
        return sendChannelBlockManager(interaction, page, true);
    }

    if (customId.startsWith('srvcfg_block_selpage_')) {
        const page = parseInt(customId.replace('srvcfg_block_selpage_', ''), 10) || 0;
        const selected = interaction.values;
        userChannelSelections.set(interaction.user.id, { channels: selected, page, timestamp: Date.now() });

        const channelListStr = selected.map(id => `• <#${id}>`).join('\n');
        const safeDesc = `Você marcou **${selected.length}** canal(is) da Página ${page + 1}:\n\n${channelListStr}\n\nEscolha o que deseja fazer com estes canais:`.substring(0, 4000);

        const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('📍 Canais Selecionados para Alteração')
            .setDescription(safeDesc)
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_massa_bloquear_sel').setLabel('Bloquear Selecionados').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
            new ButtonBuilder().setCustomId('srvcfg_massa_liberar_sel').setLabel('Liberar Selecionados').setStyle(ButtonStyle.Success).setEmoji('🟢'),
            new ButtonBuilder().setCustomId(`srvcfg_block_page_${page}`).setLabel(`Voltar à Pág ${page + 1}`).setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId === 'srvcfg_massa_bloquear_sel' || customId === 'srvcfg_massa_liberar_sel') {
        const data = userChannelSelections.get(interaction.user.id);
        const returnPage = data?.page || 0;

        if (!data || !data.channels || data.channels.length === 0) {
            const errEmbed = new EmbedBuilder()
                .setColor(0xE11D48)
                .setTitle('⚠️ Seleção Expirada')
                .setDescription('Sua seleção de canais expirou. Por favor, marque os canais novamente no menu.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`srvcfg_block_page_${returnPage}`).setLabel('Voltar aos Canais').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [errEmbed], components: [row] });
        }

        const isBlocking = customId === 'srvcfg_massa_bloquear_sel';
        setMultipleChannelsDisabled(interaction.guildId, data.channels, isBlocking);
        userChannelSelections.delete(interaction.user.id);

        const listStr = data.channels.map(id => `• <#${id}>`).join('\n');
        const safeDesc = `**${data.channels.length}** canal(is) foram ${isBlocking ? '**totalmente desativados** (Hikari não responderá neles)' : '**reativados** (funcionamento normal restabelecido)'}:\n\n${listStr}`.substring(0, 4000);

        const embed = new EmbedBuilder()
            .setColor(isBlocking ? 0xE11D48 : 0x10B981)
            .setTitle(isBlocking ? '🔴 Canais Bloqueados com Sucesso' : '🟢 Canais Liberados com Sucesso')
            .setDescription(safeDesc)
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`srvcfg_block_page_${returnPage}`).setLabel(`Voltar à Pág ${returnPage + 1}`).setStyle(ButtonStyle.Secondary).setEmoji('📋'),
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Primary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId === 'srvcfg_massa_bloquear_todos') {
        const added = blockAllGuildChannels(interaction.guild, interaction.channelId);
        const embed = new EmbedBuilder()
            .setColor(0xE11D48)
            .setTitle('🔒 Todos os Canais Bloqueados')
            .setDescription(`Todos os canais de texto e calls do servidor foram desativados com sucesso.\n\n• Foram adicionados **${added}** canais à lista de bloqueio.\n• O canal atual (<#${interaction.channelId}>) foi mantido desbloqueado para gerenciamento administrativo.`)
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_btn_canal_status').setLabel('Ver Lista').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Primary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId === 'srvcfg_massa_liberar_todos') {
        clearAllDisabledChannels(interaction.guildId);
        const embed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle('🧹 Todos os Canais Liberados')
            .setDescription('Todos os canais do servidor foram liberados com sucesso!\nA Hikari agora responderá normalmente em todos os chats autorizados.')
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_btn_canal_status').setLabel('Ver Lista').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Primary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId === 'srvcfg_btn_humor') {
        return sendHumorChannelSelector(interaction, 0, true);
    }

    if (customId.startsWith('srvcfg_humor_page_')) {
        const page = parseInt(customId.replace('srvcfg_humor_page_', ''), 10) || 0;
        return sendHumorChannelSelector(interaction, page, true);
    }

    if (customId.startsWith('srvcfg_humor_selch_')) {
        const targetId = interaction.values[0];
        const settings = getChannelSettings(targetId);
        const currentMood = settings.mood || 'Padrão';
        const currentInstruction = settings.instruction ? (settings.instruction.substring(0, 300) + (settings.instruction.length > 300 ? '...' : '')) : 'Padrão';

        const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('🎭 Personalidade & Humor do Canal')
            .setDescription(`Configurações atuais para o chat <#${targetId}>:`)
            .addFields(
                { name: 'Humor Atual', value: `\`${currentMood}\``, inline: true },
                { name: 'Instrução Atual', value: `\`\`\`\n${currentInstruction}\n\`\`\``, inline: false }
            )
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`srvcfg_humor_edit_${targetId}`).setLabel('Editar Prompt & Humor').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId(`srvcfg_humor_reset_${targetId}`).setLabel('Resetar para Padrão').setStyle(ButtonStyle.Danger).setEmoji('🔄'),
            new ButtonBuilder().setCustomId('srvcfg_btn_humor').setLabel('Trocar Chat').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    if (customId.startsWith('srvcfg_humor_edit_')) {
        const targetId = customId.replace('srvcfg_humor_edit_', '');
        const targetChannel = interaction.guild?.channels?.cache?.get(targetId);
        const channelName = targetChannel?.name || 'Canal';

        const modal = new ModalBuilder()
            .setCustomId(`srvcfg_modal_humor_${targetId}`)
            .setTitle(`🎭 Humor — #${channelName}`.substring(0, 45));

        const instrucaoInput = new TextInputBuilder()
            .setCustomId('instrucao')
            .setLabel('Instrução de Comportamento (Prompt)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ex: Seja muito irônica, fale com gírias e responda rápido.')
            .setRequired(false);

        const moodInput = new TextInputBuilder()
            .setCustomId('mood')
            .setLabel('Humor / Estado Emocional')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Engraçada, Séria, Debochada')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(instrucaoInput),
            new ActionRowBuilder().addComponents(moodInput)
        );

        return interaction.showModal(modal);
    }

    if (customId.startsWith('srvcfg_humor_reset_')) {
        const targetId = customId.replace('srvcfg_humor_reset_', '');
        setChannelPersona(targetId, { reset: true });

        const embed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle('🔄 Personalidade Restaurada')
            .setDescription(`As configurações de comportamento e humor do chat <#${targetId}> foram redefinidas para o padrão de fábrica.`)
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_btn_humor').setLabel('Configurar Outro Chat').setStyle(ButtonStyle.Secondary).setEmoji('🎭'),
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Primary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId.startsWith('srvcfg_modal_humor_')) {
        const targetId = customId.replace('srvcfg_modal_humor_', '');
        const instrucao = interaction.fields.getTextInputValue('instrucao') || undefined;
        const mood = interaction.fields.getTextInputValue('mood') || undefined;

        setChannelPersona(targetId, { instruction: instrucao, mood: mood });

        const embed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle('🎭 Personalidade Atualizada')
            .setDescription(`Configurações salvas para o chat <#${targetId}>:`)
            .addFields(
                { name: 'Humor', value: `\`${mood || 'Não alterado'}\``, inline: true },
                { name: 'Instrução', value: instrucao ? `\`\`\`\n${instrucao.substring(0, 500)}\`\`\`` : '*Não alterado*', inline: false }
            )
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_btn_humor').setLabel('Configurar Outro Chat').setStyle(ButtonStyle.Secondary).setEmoji('🎭'),
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Primary).setEmoji('🏠')
        );

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
    }

    if (customId === 'srvcfg_btn_espontaneo') {
        return sendEspontaneoChannelSelector(interaction, 0, true);
    }

    if (customId.startsWith('srvcfg_esp_page_')) {
        const page = parseInt(customId.replace('srvcfg_esp_page_', ''), 10) || 0;
        return sendEspontaneoChannelSelector(interaction, page, true);
    }

    if (customId.startsWith('srvcfg_esp_selch_')) {
        const targetId = interaction.values[0];
        const settings = getChannelSettings(targetId);
        const isActive = settings?.chatter?.active || false;
        const currentFreq = settings?.chatter?.frequency || 'low';

        const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('💬 Mensagens Espontâneas do Canal')
            .setDescription(`Configurando para o chat <#${targetId}>:\n\n**Status Atual:** ${isActive ? '🟢 **ATIVADO**' : '🔴 **DESATIVADO**'}\n**Frequência Atual:** \`${currentFreq === 'high' ? 'Alta' : currentFreq === 'medium' ? 'Média' : 'Baixa'}\`\n\nEscolha o estado ou frequência desejada:`)
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

        const rowButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`srvcfg_esp_on_${targetId}`).setLabel('Ativar').setStyle(ButtonStyle.Success).setEmoji('🟢'),
            new ButtonBuilder().setCustomId(`srvcfg_esp_off_${targetId}`).setLabel('Desativar').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
            new ButtonBuilder().setCustomId('srvcfg_btn_espontaneo').setLabel('Trocar Chat').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
        );

        const freqMenu = new StringSelectMenuBuilder()
            .setCustomId(`srvcfg_esp_freq_${targetId}`)
            .setPlaceholder('⏱️ Alterar Frequência de Fala')
            .addOptions([
                { label: '🐢 Baixa (Raro)', value: 'low', description: 'Intromete-se raramente nas conversas' },
                { label: '🐇 Média (Ocasional)', value: 'medium', description: 'Intromete-se de vez em quando' },
                { label: '🐆 Alta (Faladora)', value: 'high', description: 'Intromete-se com alta frequência' }
            ]);

        const rowFreq = new ActionRowBuilder().addComponents(freqMenu);
        const rowNav = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [rowButtons, rowFreq, rowNav] });
    }

    if (customId.startsWith('srvcfg_esp_on_') || customId.startsWith('srvcfg_esp_off_')) {
        const isActivating = customId.startsWith('srvcfg_esp_on_');
        const targetId = customId.replace(isActivating ? 'srvcfg_esp_on_' : 'srvcfg_esp_off_', '');

        setChannelChatter(targetId, { active: isActivating });

        const embed = new EmbedBuilder()
            .setColor(isActivating ? 0x10B981 : 0xE11D48)
            .setTitle('💬 Modo Espontâneo Atualizado')
            .setDescription(`O modo espontâneo está agora ${isActivating ? '🟢 **ATIVADO**' : '🔴 **DESATIVADO**'} no chat <#${targetId}>.`)
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_btn_espontaneo').setLabel('Configurar Outro Chat').setStyle(ButtonStyle.Secondary).setEmoji('💬'),
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Primary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId.startsWith('srvcfg_esp_freq_')) {
        const targetId = customId.replace('srvcfg_esp_freq_', '');
        const freq = interaction.values[0];

        setChannelChatter(targetId, { active: true, frequency: freq });

        const embed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle('⏱️ Frequência Atualizada')
            .setDescription(`Frequência de fala espontânea definida para **${freq === 'high' ? 'Alta' : freq === 'medium' ? 'Média' : 'Baixa'}** no chat <#${targetId}>.`)
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_btn_espontaneo').setLabel('Configurar Outro Chat').setStyle(ButtonStyle.Secondary).setEmoji('💬'),
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Primary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId === 'srvcfg_btn_updates') {
        return sendUpdatesChannelSelector(interaction, 0, true);
    }

    if (customId.startsWith('srvcfg_updates_page_')) {
        const page = parseInt(customId.replace('srvcfg_updates_page_', ''), 10) || 0;
        return sendUpdatesChannelSelector(interaction, page, true);
    }

    if (customId.startsWith('srvcfg_updates_selch_')) {
        const channelId = interaction.values[0];
        setServerUpdateChannel(interaction.guildId, channelId);

        const embed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle('📢 Canal de Updates Definido')
            .setDescription(`O canal <#${channelId}> foi configurado com sucesso para receber avisos e novidades da Hikari.`)
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Primary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId === 'srvcfg_btn_mencoes') {
        const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('🔔 Respostas a Menções Globais')
            .setDescription('Escolha se a Hikari deve responder a marcações de `@everyone` e `@here` neste servidor:');

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_mencoes_on').setLabel('Responder a Mentions').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId('srvcfg_mencoes_off').setLabel('Ignorar Mentions').setStyle(ButtonStyle.Danger).setEmoji('❌')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Voltar ao Painel').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    if (customId === 'srvcfg_mencoes_on' || customId === 'srvcfg_mencoes_off') {
        const ativo = customId === 'srvcfg_mencoes_on';
        setServerEveryoneMention(interaction.guildId, ativo);

        const embed = new EmbedBuilder()
            .setColor(ativo ? 0x10B981 : 0xE11D48)
            .setTitle('🔔 Menções Atualizadas')
            .setDescription(`A Hikari irá ${ativo ? '✅ **responder**' : '❌ **ignorar**'} marcações de @everyone e @here neste servidor.`)
            .setFooter({ text: 'Hikari Server Admin • by yGuilhermy' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('srvcfg_voltar_dashboard').setLabel('Painel Principal').setStyle(ButtonStyle.Primary).setEmoji('🏠')
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }
}

async function handleIaFerramentasCommand(interaction) {
    const hasPermission = !interaction.guild || (interaction.member && (
        interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
    )) || config.isOwner(interaction.user.id);

    if (!hasPermission) {
        const errEmbed = new EmbedBuilder()
            .setColor(0xE11D48)
            .setTitle('❌ Acesso Negado')
            .setDescription('Você precisa de permissão de **Gerenciar Servidor** ou **Gerenciar Canais** para usar este comando.');
        return interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    const acao = interaction.options.getString('acao');
    const toolInput = interaction.options.getString('ferramenta') || '';
    const estado = interaction.options.getString('estado');
    const targetGuildId = interaction.guildId;

    if (!targetGuildId) {
        return interaction.reply({ content: '❌ Este comando só pode ser usado dentro de um servidor.', ephemeral: true });
    }

    if (acao === 'list') {
        const disabled = getDisabledTools(targetGuildId);
        const allTools = getAllMcpTools().filter(t => t.meta && t.meta.disableable && t.function.name !== 'leave_voice_call');

        const activeList = [];
        const disabledList = [];

        for (const t of allTools) {
            const isDis = disabled.includes(t.function.name);
            const label = t.function.name === 'join_voice_call' ? '🎙️ Assistente de Voz (Call)' : t.meta.label;
            if (isDis) {
                disabledList.push(`❌ **${label}** (\`${t.function.name}\`)`);
            } else {
                activeList.push(`✅ **${label}** (\`${t.function.name}\`)`);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('🔧 Status das Ferramentas MCP — Servidor')
            .setDescription(`Configuração de ferramentas para o servidor **${interaction.guild?.name || targetGuildId}**`)
            .addFields(
                { name: '🟢 Ativas', value: activeList.length > 0 ? activeList.join('\n') : '*Nenhuma ferramenta ativa*', inline: false },
                { name: '🔴 Desativadas', value: disabledList.length > 0 ? disabledList.join('\n') : '*Nenhuma ferramenta desativada*', inline: false }
            )
            .setFooter({ text: 'Hikari MCP Manager • by yGuilhermy' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    if (acao === 'toggle') {
        if (!toolInput) {
            return interaction.reply({ content: '❌ Por favor, selecione a ferramenta que deseja alterar.', ephemeral: true });
        }

        const allTools = getAllMcpTools();
        let tool = allTools.find(t => t.function.name === toolInput || t.meta?.label === toolInput);
        if (!tool) tool = allTools.find(t => toolInput.includes(t.function.name) || toolInput.includes(t.meta?.label));

        if (!tool) {
            return interaction.reply({ content: `❌ Ferramenta \`${toolInput}\` não encontrada.`, ephemeral: true });
        }

        const disabled = getDisabledTools(targetGuildId);
        const currentlyDisabled = disabled.includes(tool.function.name);
        const enabled = estado ? estado === 'on' : currentlyDisabled;

        setServerToolEnabled(targetGuildId, tool.function.name, enabled);

        const embed = new EmbedBuilder()
            .setColor(enabled ? 0x10B981 : 0xE11D48)
            .setTitle(`Ferramenta ${enabled ? 'Ativada' : 'Desativada'}`)
            .addFields(
                { name: 'Ferramenta', value: tool.meta?.label || tool.function.name, inline: true },
                { name: 'Status no Servidor', value: enabled ? '🟢 Ativada' : '🔴 Desativada', inline: true }
            )
            .setFooter({ text: 'Hikari MCP Manager • by yGuilhermy' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (acao === 'reset') {
        resetServerTools(targetGuildId);
        const embed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle('🔄 Ferramentas Resetadas')
            .setDescription(`Todas as ferramentas do servidor **${interaction.guild?.name || targetGuildId}** foram restauradas para os valores padrão.`)
            .setFooter({ text: 'Hikari MCP Manager • by yGuilhermy' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

module.exports = {
    handleServerAdminCommand,
    handleServerAdminInteraction,
    handleIaFerramentasCommand
};
