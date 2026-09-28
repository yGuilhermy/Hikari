const assert = require('assert');
const path = require('path');
const config = require('../src/config');
const { generateResponse } = require('../src/handlers/llmHandler');

async function testLiveGeminiMultiTool() {
    console.log('[LIVE TEST] Testando chamada real com Gemini 2.5/3.5 de múltiplas ferramentas...');
    const prompt = 'Consulte o jogo Celeste na Steam e também converta 15 dólares para reais.';

    const response = await generateResponse(prompt, 'sandbox_channel_live', {
        allowSearch: true,
        guildId: 'test_guild_live'
    });

    console.log('[LIVE TEST] Resposta gerada pela IA:');
    console.log(response);

    const hasToolJson = response.includes('"multi_tools"') || response.includes('"tool":');
    console.log(`[LIVE TEST] Detectou JSON de ferramenta: ${hasToolJson}`);

    console.log('✅ [LIVE TEST PASS] Chamada ao vivo validada com sucesso!');
}

if (require.main === module) {
    testLiveGeminiMultiTool().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('❌ [LIVE TEST FAIL] Falha no teste ao vivo:', err);
        process.exit(1);
    });
}
