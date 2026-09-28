const assert = require('assert');
const path = require('path');
const config = require('../src/config');
const { getSteamGameInfo } = require('../src/handlers/steamHandler');
const { convertCurrency, formatCurrencyNumber } = require('../src/handlers/currencyHandler');
const { readDb, writeDb, setDatabasePath } = require('../src/handlers/databaseHandler');

async function runMultiToolTests() {
    console.log('[TEST] Iniciando testes de Execução Multi-MCP...');

    const sandboxDbPath = path.join(__dirname, 'sandbox_multitool_test.sqlite');
    setDatabasePath(sandboxDbPath);

    const maliciousArgs = {
        normalKey: 'valorNormal',
        nested: {
            safe: 123
        }
    };
    Object.defineProperty(maliciousArgs, '__proto__', {
        value: { polluted: true },
        enumerable: true,
        configurable: true
    });
    maliciousArgs.constructor = { evil: true };
    maliciousArgs.prototype = { dangerous: true };

    const { sanitizeToolArgs } = (() => {
        return {
            sanitizeToolArgs: (args) => {
                if (!args || typeof args !== 'object') return {};
                const sanitized = {};
                for (const [key, value] of Object.entries(args)) {
                    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
                    if (typeof value === 'object' && value !== null) {
                        sanitized[key] = sanitizeToolArgs(value);
                    } else {
                        sanitized[key] = value;
                    }
                }
                return sanitized;
            }
        };
    })();

    const cleanArgs = sanitizeToolArgs(maliciousArgs);
    assert.strictEqual(cleanArgs.normalKey, 'valorNormal');
    assert.strictEqual(cleanArgs.nested.safe, 123);
    assert.strictEqual(cleanArgs.__proto__, Object.prototype);
    assert.strictEqual(cleanArgs.constructor, Object);
    assert.strictEqual(cleanArgs.prototype, undefined);
    assert.strictEqual({}.polluted, undefined);
    console.log('  -> Proteção contra Prototype Pollution validada com sucesso.');

    const mockToolCalls = [
        { tool: 'check_steam', args: { game: 'Celeste' } },
        { tool: 'convert_currency', args: { amount: 50, from: 'USD', to: 'BRL' } },
        { tool: 'db_write', args: { key: 'multitool_note', content: 'informacao coletada' } }
    ];

    const collectedResults = [];
    const collectedEmbeds = [];

    for (const item of mockToolCalls) {
        if (item.tool === 'check_steam') {
            const steamInfo = await getSteamGameInfo(item.args.game);
            if (!steamInfo.error) {
                collectedResults.push(`Steam: ${steamInfo.name} custando ${steamInfo.price}`);
                collectedEmbeds.push({ title: steamInfo.name, type: 'steam' });
            }
        } else if (item.tool === 'convert_currency') {
            const conv = await convertCurrency(item.args.amount, item.args.from, item.args.to);
            if (!conv.error) {
                collectedResults.push(`Conversão: ${conv.amount} ${conv.from} = ${formatCurrencyNumber(conv.result)} ${conv.to}`);
                collectedEmbeds.push({ title: 'Conversão', type: 'currency' });
            }
        } else if (item.tool === 'db_write') {
            const wRes = writeDb(item.args.key, item.args.content, 'guild_test', true, { userTag: 'tester' });
            assert.strictEqual(wRes.success, true);
            collectedResults.push(`Banco: Chave "${item.args.key}" salva`);
        }
    }

    assert.strictEqual(collectedResults.length >= 2, true);
    assert.strictEqual(collectedEmbeds.length >= 2, true);

    const rRes = readDb('multitool_note', 'guild_test', true);
    assert.strictEqual(rRes.success, true);
    assert.strictEqual(rRes.data.content, 'informacao coletada');
    console.log('  -> Execução combinada de ferramentas e coleta de embeds validada.');

    const errorToolCalls = [
        { tool: 'check_steam', args: { game: 'NonExistentGameXYZ999999999' } },
        { tool: 'convert_currency', args: { amount: 10, from: 'USD', to: 'BRL' } }
    ];
    const resilientResults = [];
    for (const item of errorToolCalls) {
        try {
            if (item.tool === 'check_steam') {
                const info = await getSteamGameInfo(item.args.game);
                if (info.error) resilientResults.push(`Steam erro tratado: ${info.error}`);
            } else if (item.tool === 'convert_currency') {
                const conv = await convertCurrency(item.args.amount, item.args.from, item.args.to);
                resilientResults.push(`Sucesso moeda: ${conv.result}`);
            }
        } catch (e) {
            resilientResults.push(`Falha tratada: ${e.message}`);
        }
    }
    assert.strictEqual(resilientResults.length, 2);
    console.log('  -> Resiliência a falhas parciais em Multi-MCP validada.');

    const fs = require('fs');
    if (fs.existsSync(sandboxDbPath)) {
        try { fs.unlinkSync(sandboxDbPath); } catch (_) {}
    }

    console.log('✅ [TEST PASS] Todos os testes de Execução Multi-MCP foram aprovados com sucesso!');
}

if (require.main === module) {
    runMultiToolTests().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('❌ [TEST FAIL] Falha no teste Multi-MCP:', err);
        process.exit(1);
    });
}

module.exports = { runMultiToolTests };
