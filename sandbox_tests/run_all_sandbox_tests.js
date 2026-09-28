const { runConcurrencyQueueTests } = require('./test_concurrency_queue');
const { runMultiToolTests } = require('./test_multitool_execution');
const { runMultiLayerTests } = require('./test_multi_layer_mcp');
const { runSecurityExploitTests } = require('./test_security_exploits');
const { testE2EMultiToolFlow } = require('./test_e2e_multitool_flow');

async function main() {
    console.log('====================================================');
    console.log('🚀 HIKARI SANDBOX TEST SUITE: MULTI-MCP & FILA & RCE');
    console.log('====================================================\n');

    const startTime = Date.now();
    let passed = 0;
    let failed = 0;

    try {
        await runConcurrencyQueueTests();
        passed++;
    } catch (err) {
        console.error('❌ Falha na suite de Concorrência/Fila:', err);
        failed++;
    }

    console.log('\n----------------------------------------------------\n');

    try {
        await runMultiToolTests();
        passed++;
    } catch (err) {
        console.error('❌ Falha na suite de Multi-MCP:', err);
        failed++;
    }

    console.log('\n----------------------------------------------------\n');

    try {
        await runMultiLayerTests();
        passed++;
    } catch (err) {
        console.error('❌ Falha na suite de Multi-Camadas MCP:', err);
        failed++;
    }

    console.log('\n----------------------------------------------------\n');

    try {
        await runSecurityExploitTests();
        passed++;
    } catch (err) {
        console.error('❌ Falha na suite de Segurança e Exploits:', err);
        failed++;
    }

    console.log('\n----------------------------------------------------\n');

    try {
        await testE2EMultiToolFlow();
        passed++;
    } catch (err) {
        console.error('❌ Falha no teste E2E Multi-MCP ao vivo:', err);
        failed++;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n====================================================');
    console.log(`📊 RELATÓRIO FINAL: ${passed} passadas, ${failed} falhas em ${duration}s`);
    console.log('====================================================');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

main();
