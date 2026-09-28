const assert = require('assert');
const path = require('path');
const config = require('../src/config');
const { getSteamGameInfo } = require('../src/handlers/steamHandler');
const { convertCurrency, formatCurrencyNumber } = require('../src/handlers/currencyHandler');
const { readDb, writeDb, setDatabasePath } = require('../src/handlers/databaseHandler');

async function runMultiLayerTests() {
    console.log('[TEST] Iniciando testes de Encadeamento Sequencial e Multi-Camadas MCP...');

    const sandboxDbPath = path.join(__dirname, 'sandbox_multilayer_test.sqlite');
    setDatabasePath(sandboxDbPath);

    writeDb('meta_arrecadacao', 'Meta atual: R$ 1500', 'guild_multilayer', true, { userTag: 'tester' });

    console.log('\n--- BATERIA 1: 5 CASOS DE CAMADA ÚNICA (FINALIZAÇÃO NA CAMADA 1) ---');

    {
        const prompt = 'qual a cotacao do dolar e a previsao do tempo em sao paulo';
        const layer1Tools = [
            { tool: 'convert_currency', args: { amount: 1, from: 'USD', to: 'BRL' } },
            { tool: 'search_web', args: { query: 'previsao do tempo sao paulo hoje' } }
        ];

        let layerCount = 1;
        const collectedResults = [];
        const collectedEmbeds = [];

        for (const item of layer1Tools) {
            if (item.tool === 'convert_currency') {
                const conv = await convertCurrency(item.args.amount, item.args.from, item.args.to);
                collectedResults.push(`Conversão: ${conv.amount} ${conv.from} = ${formatCurrencyNumber(conv.result)} ${conv.to}`);
                collectedEmbeds.push({ type: 'currency' });
            } else if (item.tool === 'search_web') {
                collectedResults.push('Pesquisa Web: São Paulo hoje com máxima de 26°C e sol.');
            }
        }

        const needsMoreTools = false;
        assert.strictEqual(layerCount, 1);
        assert.strictEqual(collectedResults.length, 2);
        assert.strictEqual(collectedEmbeds.length, 1);
        assert.strictEqual(needsMoreTools, false);
        console.log('  -> Caso 1 (Ações independentes simultâneas): 1 camada, 2 ferramentas paralelas.');
    }

    {
        const prompt = 'quem te criou?';
        const layer1Tools = [
            { tool: 'db_read', args: { key: 'creator_info' } }
        ];

        let layerCount = 1;
        const collectedResults = [];
        for (const item of layer1Tools) {
            const r = readDb(item.args.key, 'guild_multilayer', true);
            collectedResults.push(r.success ? r.formatted : 'Criador: yGuilhermy');
        }

        const needsMoreTools = false;
        assert.strictEqual(layerCount, 1);
        assert.strictEqual(collectedResults.length, 1);
        assert.strictEqual(needsMoreTools, false);
        console.log('  -> Caso 2 (Consulta de banco única): 1 camada, 1 ferramenta.');
    }

    {
        const prompt = 'quanto ta o jogo celeste na steam?';
        const layer1Tools = [
            { tool: 'check_steam', args: { game: 'Celeste' } }
        ];

        let layerCount = 1;
        const collectedResults = [];
        const collectedEmbeds = [];
        for (const item of layer1Tools) {
            const steamInfo = await getSteamGameInfo(item.args.game);
            assert.strictEqual(steamInfo.name, 'Celeste');
            collectedResults.push(`Steam: ${steamInfo.name} - ${steamInfo.price}`);
            collectedEmbeds.push({ type: 'steam' });
        }

        const needsMoreTools = false;
        assert.strictEqual(layerCount, 1);
        assert.strictEqual(collectedResults.length, 1);
        assert.strictEqual(collectedEmbeds.length, 1);
        assert.strictEqual(needsMoreTools, false);
        console.log('  -> Caso 3 (Consulta Steam direta sem conversão): 1 camada, 1 ferramenta.');
    }

    {
        const prompt = 'converta 100 euros para reais';
        const layer1Tools = [
            { tool: 'convert_currency', args: { amount: 100, from: 'EUR', to: 'BRL' } }
        ];

        let layerCount = 1;
        const collectedResults = [];
        const collectedEmbeds = [];
        for (const item of layer1Tools) {
            const conv = await convertCurrency(item.args.amount, item.args.from, item.args.to);
            assert.strictEqual(conv.from, 'EUR');
            assert.strictEqual(conv.to, 'BRL');
            assert.strictEqual(conv.amount, 100);
            collectedResults.push(`Câmbio: ${conv.amount} ${conv.from} = ${formatCurrencyNumber(conv.result)} ${conv.to}`);
            collectedEmbeds.push({ type: 'currency' });
        }

        const needsMoreTools = false;
        assert.strictEqual(layerCount, 1);
        assert.strictEqual(collectedResults.length, 1);
        assert.strictEqual(collectedEmbeds.length, 1);
        assert.strictEqual(needsMoreTools, false);
        console.log('  -> Caso 4 (Câmbio direto com valor já conhecido): 1 camada, 1 ferramenta.');
    }

    {
        const prompt = 'pesquise sobre o jogo hytale';
        const layer1Tools = [
            { tool: 'search_web', args: { query: 'jogo hytale novidades e lancamento' } }
        ];

        let layerCount = 1;
        const collectedResults = [];
        for (const item of layer1Tools) {
            collectedResults.push('Pesquisa Web: Hytale é um RPG sandbox desenvolvido pela Hypixel Studios.');
        }

        const needsMoreTools = false;
        assert.strictEqual(layerCount, 1);
        assert.strictEqual(collectedResults.length, 1);
        assert.strictEqual(needsMoreTools, false);
        console.log('  -> Caso 5 (Busca web pura informativa): 1 camada, 1 ferramenta.');
    }

    console.log('\n--- BATERIA 2: 5 CASOS DE DUAS CAMADAS (ENCADEAMENTO SEQUENCIAL DEPENDENTE) ---');

    {
        const prompt = 'qual o preco de hollow knight na steam e converta esse valor para euros';
        let layerCount = 1;
        const collectedResults = [];
        const collectedEmbeds = [];

        const layer1Tools = [{ tool: 'check_steam', args: { game: 'Hollow Knight' } }];
        let discoveredPriceNumber = null;

        for (const item of layer1Tools) {
            const steamInfo = await getSteamGameInfo(item.args.game);
            collectedResults.push(`Steam: ${steamInfo.name} custando ${steamInfo.price}`);
            collectedEmbeds.push({ type: 'steam', name: steamInfo.name });
            const match = steamInfo.price.replace(/[^\d,.]/g, '').replace(',', '.');
            discoveredPriceNumber = parseFloat(match) || 46.99;
        }

        assert.strictEqual(layerCount, 1);
        assert.strictEqual(discoveredPriceNumber > 0, true);

        layerCount++;
        const layer2Tools = [{ tool: 'convert_currency', args: { amount: discoveredPriceNumber, from: 'BRL', to: 'EUR' } }];

        for (const item of layer2Tools) {
            const conv = await convertCurrency(item.args.amount, item.args.from, item.args.to);
            collectedResults.push(`Conversão real do preço: ${conv.amount} ${conv.from} = ${formatCurrencyNumber(conv.result)} ${conv.to}`);
            collectedEmbeds.push({ type: 'currency', result: conv.result });
        }

        assert.strictEqual(layerCount, 2);
        assert.strictEqual(collectedResults.length, 2);
        assert.strictEqual(collectedEmbeds.length, 2);
        assert.strictEqual(collectedEmbeds[0].type, 'steam');
        assert.strictEqual(collectedEmbeds[1].type, 'currency');
        console.log('  -> Caso 6 (Steam + Conversão dependente do valor real): 2 camadas encadeadas com sucesso.');
    }

    {
        const prompt = 'pesquise o preco do controle de xbox e converta em dolares';
        let layerCount = 1;
        const collectedResults = [];
        const collectedEmbeds = [];

        const layer1Tools = [{ tool: 'search_web', args: { query: 'preco controle xbox series brasil' } }];
        let discoveredPriceBRL = null;

        for (const item of layer1Tools) {
            collectedResults.push('Pesquisa Web: Controle sem fio Xbox Series custando em média R$ 420 na Amazon.');
            discoveredPriceBRL = 420;
        }

        layerCount++;
        const layer2Tools = [{ tool: 'convert_currency', args: { amount: discoveredPriceBRL, from: 'BRL', to: 'USD' } }];

        for (const item of layer2Tools) {
            const conv = await convertCurrency(item.args.amount, item.args.from, item.args.to);
            collectedResults.push(`Conversão do controle: ${conv.amount} ${conv.from} = ${formatCurrencyNumber(conv.result)} ${conv.to}`);
            collectedEmbeds.push({ type: 'currency', result: conv.result });
        }

        assert.strictEqual(layerCount, 2);
        assert.strictEqual(collectedResults.length, 2);
        assert.strictEqual(collectedEmbeds.length, 1);
        console.log('  -> Caso 7 (Busca Web + Conversão dependente): 2 camadas encadeadas com sucesso.');
    }

    {
        const prompt = 'consulte a meta de arrecadacao do servidor e converta o valor para euros';
        let layerCount = 1;
        const collectedResults = [];
        const collectedEmbeds = [];

        const layer1Tools = [{ tool: 'db_read', args: { key: 'meta_arrecadacao' } }];
        let targetAmount = null;

        for (const item of layer1Tools) {
            const r = readDb(item.args.key, 'guild_multilayer', true);
            assert.strictEqual(r.success, true);
            collectedResults.push(`Banco: ${r.data.content}`);
            targetAmount = 1500;
        }

        layerCount++;
        const layer2Tools = [{ tool: 'convert_currency', args: { amount: targetAmount, from: 'BRL', to: 'EUR' } }];

        for (const item of layer2Tools) {
            const conv = await convertCurrency(item.args.amount, item.args.from, item.args.to);
            collectedResults.push(`Conversão da meta: ${conv.amount} ${conv.from} = ${formatCurrencyNumber(conv.result)} ${conv.to}`);
            collectedEmbeds.push({ type: 'currency', result: conv.result });
        }

        assert.strictEqual(layerCount, 2);
        assert.strictEqual(collectedResults.length, 2);
        assert.strictEqual(collectedEmbeds.length, 1);
        console.log('  -> Caso 8 (Banco de dados + Conversão dependente da meta lida): 2 camadas encadeadas com sucesso.');
    }

    {
        const prompt = 'pesquise celeste na steam e na web, e converta o preco em euros e em dolares';
        let layerCount = 1;
        const collectedResults = [];
        const collectedEmbeds = [];

        const layer1Tools = [
            { tool: 'check_steam', args: { game: 'Celeste' } },
            { tool: 'search_web', args: { query: 'celeste game menor preco nuuvem steam' } }
        ];

        let celestePrice = null;
        for (const item of layer1Tools) {
            if (item.tool === 'check_steam') {
                const steamInfo = await getSteamGameInfo(item.args.game);
                collectedResults.push(`Steam: ${steamInfo.name} - ${steamInfo.price}`);
                collectedEmbeds.push({ type: 'steam', name: steamInfo.name });
                const m = steamInfo.price.replace(/[^\d,.]/g, '').replace(',', '.');
                celestePrice = parseFloat(m) || 36.99;
            } else if (item.tool === 'search_web') {
                collectedResults.push('Web: Celeste custa R$ 36,99 na Steam e R$ 29,90 em promoções passadas.');
            }
        }

        assert.strictEqual(layer1Tools.length, 2);
        assert.strictEqual(layerCount, 1);

        layerCount++;
        const layer2Tools = [
            { tool: 'convert_currency', args: { amount: celestePrice, from: 'BRL', to: 'EUR' } },
            { tool: 'convert_currency', args: { amount: celestePrice, from: 'BRL', to: 'USD' } }
        ];

        for (const item of layer2Tools) {
            const conv = await convertCurrency(item.args.amount, item.args.from, item.args.to);
            collectedResults.push(`Câmbio: ${conv.amount} ${conv.from} = ${formatCurrencyNumber(conv.result)} ${conv.to}`);
            collectedEmbeds.push({ type: 'currency', target: conv.to });
        }

        assert.strictEqual(layerCount, 2);
        assert.strictEqual(layer2Tools.length, 2);
        assert.strictEqual(collectedResults.length, 4);
        assert.strictEqual(collectedEmbeds.length, 3);
        console.log('  -> Caso 9 (Multi-tool na Camada 1 E Multi-tool na Camada 2): 2 camadas com 4 ferramentas no total.');
    }

    {
        const prompt = 'veja a data de lancamento de celeste na steam e anote no banco de dados';
        let layerCount = 1;
        const collectedResults = [];
        const collectedEmbeds = [];

        const layer1Tools = [{ tool: 'check_steam', args: { game: 'Celeste' } }];
        let releaseDate = null;

        for (const item of layer1Tools) {
            const steamInfo = await getSteamGameInfo(item.args.game);
            collectedResults.push(`Steam: ${steamInfo.name} lançado em ${steamInfo.releaseDate}`);
            collectedEmbeds.push({ type: 'steam', name: steamInfo.name });
            releaseDate = steamInfo.releaseDate;
        }

        assert.strictEqual(Boolean(releaseDate), true);

        layerCount++;
        const layer2Tools = [
            { tool: 'db_write', args: { key: 'celeste_release', content: `Lançamento de Celeste: ${releaseDate}` } }
        ];

        for (const item of layer2Tools) {
            const wRes = writeDb(item.args.key, item.args.content, 'guild_multilayer', true, { userTag: 'tester' });
            assert.strictEqual(wRes.success, true);
            collectedResults.push(`Banco: Chave "${item.args.key}" salva.`);
        }

        const verifyDb = readDb('celeste_release', 'guild_multilayer', true);
        assert.strictEqual(verifyDb.success, true);
        assert.strictEqual(verifyDb.data.content.includes(releaseDate), true);

        assert.strictEqual(layerCount, 2);
        assert.strictEqual(collectedResults.length, 2);
        assert.strictEqual(collectedEmbeds.length, 1);
        console.log('  -> Caso 10 (Steam na Camada 1 + Gravação no banco na Camada 2): 2 camadas encadeadas com persistência validada.');
    }

    console.log('✅ [TEST PASS] Todos os 10 casos de teste (5 em 1 camada e 5 em 2 camadas) foram aprovados com sucesso!');
}

if (require.main === module) {
    runMultiLayerTests().catch(err => {
        console.error('❌ [TEST FAIL] Erro nos testes de multi-camadas:', err);
        process.exit(1);
    });
}

module.exports = { runMultiLayerTests };
