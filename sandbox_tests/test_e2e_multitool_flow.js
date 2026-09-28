const assert = require('assert');
const path = require('path');
const config = require('../src/config');
const { generateResponse } = require('../src/handlers/llmHandler');
const { getSteamGameInfo } = require('../src/handlers/steamHandler');
const { convertCurrency, formatCurrencyNumber } = require('../src/handlers/currencyHandler');
const { EmbedBuilder } = require('discord.js');

async function testE2EMultiToolFlow() {
    console.log('[E2E TEST] Iniciando teste ponta a ponta de Multi-MCP com Steam + Conversão...');

    const prompt = 'qual o preco de hollow knight na steam e converta 10 usd para brl';
    const rawResponse = await generateResponse(prompt, 'sandbox_e2e_chan', { allowSearch: false, guildId: 'e2e_guild' });

    assert.strictEqual(typeof rawResponse, 'string');
    assert.strictEqual(rawResponse.includes('multi_tools'), true);

    const parsed = JSON.parse(rawResponse);
    assert.strictEqual(Array.isArray(parsed.multi_tools), true);
    assert.strictEqual(parsed.multi_tools.length, 2);

    const toolsRun = parsed.multi_tools.map(t => t.tool);
    assert.strictEqual(toolsRun.includes('check_steam'), true);
    assert.strictEqual(toolsRun.includes('convert_currency'), true);
    console.log('  -> IA chamou perfeitamente as ferramentas:', toolsRun.join(' + '));

    const collectedResults = [];
    const collectedEmbeds = [];

    for (const item of parsed.multi_tools) {
        if (item.tool === 'check_steam') {
            const steamInfo = await getSteamGameInfo(item.args.game);
            assert.strictEqual(!steamInfo.error, true);
            assert.strictEqual(steamInfo.name.toLowerCase().includes('hollow knight'), true);

            const steamEmbed = new EmbedBuilder()
                .setColor(0x7C3AED)
                .setTitle(steamInfo.name)
                .setURL(steamInfo.url)
                .setDescription(steamInfo.description ? steamInfo.description.substring(0, 300) : 'Sinopse')
                .addFields(
                    { name: 'Preço', value: steamInfo.price, inline: true },
                    { name: 'Lançamento', value: steamInfo.releaseDate, inline: true }
                );
            collectedEmbeds.push(steamEmbed);
            collectedResults.push(`[Steam]: ${steamInfo.name} custando ${steamInfo.price}`);
            console.log(`  -> Steam executado com sucesso: ${steamInfo.name} - ${steamInfo.price}`);
        } else if (item.tool === 'convert_currency') {
            const conv = await convertCurrency(item.args.amount, item.args.from, item.args.to);
            assert.strictEqual(!conv.error, true);

            const convEmbed = new EmbedBuilder()
                .setColor(0x10B981)
                .setTitle(`Conversão de Moedas`)
                .setDescription(`${conv.amount} ${conv.from} = ${formatCurrencyNumber(conv.result)} ${conv.to}`);
            collectedEmbeds.push(convEmbed);
            collectedResults.push(`[Câmbio]: ${conv.amount} ${conv.from} = ${formatCurrencyNumber(conv.result)} ${conv.to}`);
            console.log(`  -> Câmbio executado com sucesso: ${conv.amount} ${conv.from} = ${conv.result} ${conv.to}`);
        }
    }

    assert.strictEqual(collectedEmbeds.length, 2);
    assert.strictEqual(collectedResults.length, 2);

    const pass2Prompt = `[RESULTADOS DE MÚLTIPLAS FERRAMENTAS EXECUTADAS]:
${collectedResults.join('\n\n')}

[PERGUNTA DO USUÁRIO]: "${prompt}"

[INSTRUÇÃO CRÍTICA]:
Sintetize uma resposta final unificada, fluida, completa e natural combinando todas as informações na sua personalidade autêntica Hikari.
Responda APENAS com texto puro diretamente ao usuário. NÃO use ferramentas, NÃO gere JSON.`;

    const finalResponse = await generateResponse(pass2Prompt, 'sandbox_e2e_chan', { allowSearch: false, disableTools: true, guildId: 'e2e_guild' });
    console.log('\n[E2E TEST] Resposta Sintetizada Final (Pass 2):');
    console.log(finalResponse);

    assert.strictEqual(typeof finalResponse, 'string');
    assert.strictEqual(finalResponse.length > 20, true);
    assert.strictEqual(!finalResponse.includes('"tool":'), true);
    assert.strictEqual(!finalResponse.includes('"multi_tools"'), true);

    console.log('\n✅ [E2E TEST PASS] Fluxo completo de Multi-MCP com acumulação de embeds e síntese de resposta aprovado!');
}

if (require.main === module) {
    testE2EMultiToolFlow().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('❌ [E2E TEST FAIL] Falha no teste E2E:', err);
        process.exit(1);
    });
}

module.exports = { testE2EMultiToolFlow };
