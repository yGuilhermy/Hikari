const assert = require('assert');
const { generateResponse, executeAgentLoop } = require('../src/handlers/llmHandler');
const { getSteamGameInfo } = require('../src/handlers/steamHandler');
const { convertCurrency, formatCurrencyNumber } = require('../src/handlers/currencyHandler');

async function testLiveMultiLayerChaining() {
    console.log('[LIVE E2E] Iniciando teste ao vivo de encadeamento multi-camadas com IA real...');

    const prompt = 'qual o preco de hollow knight na steam e converta esse valor para euros';
    console.log(`Prompt: "${prompt}"`);

    const initialTools = [{ tool: 'check_steam', args: { game: 'Hollow Knight' } }];
    let replyPayload = null;

    const mockUnifiedReply = async (content, files = [], components = [], embeds = []) => {
        replyPayload = { content, files, components, embeds };
        return { id: 'mock_msg_1', edit: async (p) => { replyPayload = p; } };
    };

    const mockInteraction = {
        id: 'mock_interaction_1',
        channel: { id: 'test_chan', name: 'sandbox' },
        guildId: 'test_guild',
        reply: async (p) => mockUnifiedReply(p.content, p.files, p.components, p.embeds),
        editReply: async (p) => mockUnifiedReply(p.content, p.files, p.components, p.embeds)
    };

    await executeAgentLoop(
        initialTools,
        'consultar steam e depois converter',
        prompt,
        'test_channel_live_e2e',
        'tester_id',
        'Tester#0001',
        mockInteraction,
        'mention',
        mockUnifiedReply,
        null,
        '',
        '1.2s',
        { skipLocal: true, guildId: 'test_guild' },
        'test_guild',
        'TestGuild',
        'sandbox'
    );

    assert.strictEqual(Boolean(replyPayload), true);
    assert.strictEqual(Boolean(replyPayload.content), true);
    console.log('\n[LIVE E2E RESULTADO TEXTUAL]:\n' + replyPayload.content);
    console.log(`\n[LIVE E2E TOTAL EMBEDS]: ${replyPayload.embeds ? replyPayload.embeds.length : 0}`);

    if (replyPayload.embeds) {
        for (let i = 0; i < replyPayload.embeds.length; i++) {
            const emb = replyPayload.embeds[i];
            console.log(`Embed ${i + 1}: ${emb.data ? emb.data.title : emb.title}`);
        }
    }

    assert.strictEqual(replyPayload.embeds && replyPayload.embeds.length >= 1, true);
    assert.strictEqual(replyPayload.content.includes('46,99') || replyPayload.content.includes('46.99') || replyPayload.content.includes('Hollow Knight'), true);
    assert.strictEqual(replyPayload.content.toLowerCase().includes('euro') || replyPayload.content.includes('€'), true);
    console.log('✅ [LIVE E2E PASS] Encadeamento multi-camadas ao vivo aprovado com acúmulo de embeds e síntese de valor real!');
}

if (require.main === module) {
    testLiveMultiLayerChaining().catch(err => {
        console.error('❌ [LIVE E2E FAIL]:', err);
        process.exit(1);
    });
}

module.exports = { testLiveMultiLayerChaining };
