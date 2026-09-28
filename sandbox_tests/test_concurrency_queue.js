const assert = require('assert');
const path = require('path');
const config = require('../src/config');
const {
    getGuildMaxConcurrency,
    setGuildMaxConcurrency,
    clearProcessingQueue,
    guildQueues,
    guildActiveWorkers
} = require('../src/handlers/llmHandler');

async function runConcurrencyQueueTests() {
    console.log('[TEST] Iniciando testes de Concorrência e Fila por Servidor...');

    assert.strictEqual(getGuildMaxConcurrency('DM'), 1);
    assert.strictEqual(getGuildMaxConcurrency(null), 1);
    assert.strictEqual(getGuildMaxConcurrency(''), 1);

    const testGuildA = 'test_guild_mock_11111111111111111';
    const testGuildB = 'test_guild_mock_22222222222222222';
    const ownerId = config.ownerId || '606213796593565715';
    const attackerId = '999999999999999999';

    const defaultLimit = getGuildMaxConcurrency(testGuildA);
    assert.strictEqual(defaultLimit, 5);

    const unauthResult = setGuildMaxConcurrency(testGuildA, 10, attackerId);
    assert.strictEqual(unauthResult.success, false);
    assert.strictEqual(unauthResult.error, 'unauthorized');
    assert.strictEqual(getGuildMaxConcurrency(testGuildA), 5);

    const dmResult = setGuildMaxConcurrency('DM', 5, ownerId);
    assert.strictEqual(dmResult.success, false);
    assert.strictEqual(dmResult.error, 'invalid_target');
    assert.strictEqual(getGuildMaxConcurrency('DM'), 1);

    const invalidValResult = setGuildMaxConcurrency(testGuildA, -3, ownerId);
    assert.strictEqual(invalidValResult.success, false);
    assert.strictEqual(invalidValResult.error, 'invalid_value');

    const updateResult = setGuildMaxConcurrency(testGuildA, 3, ownerId);
    assert.strictEqual(updateResult.success, true);
    assert.strictEqual(getGuildMaxConcurrency(testGuildA), 3);

    const unlimitedResult = setGuildMaxConcurrency(testGuildB, 0, ownerId);
    assert.strictEqual(unlimitedResult.success, true);
    assert.strictEqual(getGuildMaxConcurrency(testGuildB), 0);

    clearProcessingQueue();
    assert.strictEqual(guildQueues.size, 0);
    assert.strictEqual(guildActiveWorkers.size, 0);

    guildQueues.set(testGuildA, [{ id: 1 }, { id: 2 }]);
    guildQueues.set(testGuildB, [{ id: 3 }]);
    assert.strictEqual(guildQueues.get(testGuildA).length, 2);
    assert.strictEqual(guildQueues.get(testGuildB).length, 1);

    const clearedCount = clearProcessingQueue();
    assert.strictEqual(clearedCount, 3);
    assert.strictEqual(guildQueues.size, 0);

    setGuildMaxConcurrency(testGuildA, 5, ownerId);

    console.log('✅ [TEST PASS] Todos os testes de Concorrência e Fila por Servidor foram aprovados com sucesso!');
}

if (require.main === module) {
    runConcurrencyQueueTests().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('❌ [TEST FAIL] Falha no teste de concorrência:', err);
        process.exit(1);
    });
}

module.exports = { runConcurrencyQueueTests };
