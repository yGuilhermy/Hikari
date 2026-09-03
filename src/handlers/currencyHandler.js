const fs = require('fs');
const path = require('path');
const axios = require('axios');

const cachePath = path.join(__dirname, '../data/currency_cache.json');
const CACHE_TTL = 15 * 60 * 1000;

let memoryCache = null;
let inFlightCachePromise = null;

const nameMap = {
    '$': 'USD',
    'US$': 'USD',
    'U$': 'USD',
    'USD$': 'USD',
    'DOLAR': 'USD',
    'DOLARES': 'USD',
    'DOLAR AMERICANO': 'USD',
    'DOLARES AMERICANOS': 'USD',
    'BUCKS': 'USD',
    'GREENBACK': 'USD',

    'R$': 'BRL',
    'RS': 'BRL',
    'REAL': 'BRL',
    'REAIS': 'BRL',
    'BR': 'BRL',
    'BRL': 'BRL',
    'BRASIL': 'BRL',
    'BRAZIL': 'BRL',
    'CONTO': 'BRL',

    '€': 'EUR',
    'EURO': 'EUR',
    'EUROS': 'EUR',

    '£': 'GBP',
    'LIBRA': 'GBP',
    'LIBRAS': 'GBP',
    'LIBRA ESTERLINA': 'GBP',
    'LIBRAS ESTERLINAS': 'GBP',

    '¥': 'JPY',
    'IENE': 'JPY',
    'IENES': 'JPY',
    'YEN': 'JPY',
    'YENS': 'JPY',

    '₿': 'BTC',
    'BTC': 'BTC',
    'BITCOIN': 'BTC',
    'BITCOINS': 'BTC',

    'ETH': 'ETH',
    'ETHEREUM': 'ETH',
    'ETHER': 'ETH',

    'SOL': 'SOL',
    'SOLANA': 'SOL',

    'USDT': 'USDT',
    'TETHER': 'USDT',

    'DOGE': 'DOGE',
    'DOGECOIN': 'DOGE',

    'LTC': 'LTC',
    'LITECOIN': 'LTC',

    'XRP': 'XRP',
    'RIPPLE': 'XRP',

    'CAD': 'CAD',
    'DOLAR CANADENSE': 'CAD',
    'DOLARES CANADENSES': 'CAD',

    'AUD': 'AUD',
    'DOLAR AUSTRALIANO': 'AUD',
    'DOLARES AUSTRALIANOS': 'AUD',

    'CHF': 'CHF',
    'FRANCO': 'CHF',
    'FRANCO SUICO': 'CHF',
    'FRANCOS SUICOS': 'CHF',

    'CNY': 'CNY',
    'YUAN': 'CNY',
    'YUAN CHINES': 'CNY',
    'YUANS': 'CNY',
    'RENMINBI': 'CNY',

    'ARS': 'ARS',
    'PESO': 'ARS',
    'PESOS': 'ARS',
    'PESO ARGENTINO': 'ARS',
    'PESOS ARGENTINOS': 'ARS',

    'CLP': 'CLP',
    'PESO CHILENO': 'CLP',
    'PESOS CHILENOS': 'CLP',

    'COP': 'COP',
    'PESO COLOMBIANO': 'COP',
    'PESOS COLOMBIANOS': 'COP',

    'MXN': 'MXN',
    'PESO MEXICANO': 'MXN',
    'PESOS MEXICANOS': 'MXN',

    'UYU': 'UYU',
    'PESO URUGUAIO': 'UYU',
    'PESOS URUGUAIOS': 'UYU',

    'RUB': 'RUB',
    'RUBLO': 'RUB',
    'RUBLOS': 'RUB',
    'RUBLO RUSSO': 'RUB',

    'INR': 'INR',
    'RUPIA': 'INR',
    'RUPIAS': 'INR',
    'RUPIA INDIANA': 'INR',

    'KRW': 'KRW',
    'WON': 'KRW',
    'WONS': 'KRW',
    'WON SUL COREANO': 'KRW',

    'TRY': 'TRY',
    'LIRA': 'TRY',
    'LIRAS': 'TRY',
    'LIRA TURCA': 'TRY',

    'NZD': 'NZD',
    'DOLAR NEOZELANDES': 'NZD',

    'SGD': 'SGD',
    'DOLAR DE SINGAPURA': 'SGD',

    'AED': 'AED',
    'DIRHAM': 'AED',

    'SAR': 'SAR',
    'RIYAL': 'SAR',
    'RIYAL SAUDITA': 'SAR',

    'ILS': 'ILS',
    'SHEKEL': 'ILS',
    'NOVO SHEKEL': 'ILS'
};

function normalizeCurrency(raw) {
    if (!raw) return 'BRL';
    let s = String(raw).trim().toUpperCase();
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[^A-Z0-9$€£¥₿]/g, ' ').replace(/\s+/g, ' ').trim();
    return nameMap[s] || s;
}

function parseAmount(val) {
    if (typeof val === 'number') return !isNaN(val) && val > 0 ? val : 1;
    if (!val) return 1;
    let s = String(val).trim();
    s = s.replace(/^[^\d.,]+/, '').replace(/[^\d.,]+$/, '');
    if (s.includes(',') && s.includes('.')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const num = parseFloat(s);
    return !isNaN(num) && num > 0 ? num : 1;
}

function formatCurrencyNumber(val) {
    const num = Number(val);
    if (isNaN(num)) return '0,00';
    if (num === 0) return '0,00';
    const abs = Math.abs(num);
    if (abs < 0.00001) {
        return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    }
    if (abs < 0.001) {
        return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    }
    if (abs < 1) {
        return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrencyQuery(text) {
    if (!text || typeof text !== 'string') return { amount: 1, from: 'USD', to: 'BRL' };
    let clean = text.toLowerCase()
        .replace(/cota[çc][aã]o\s*(do|da|de)?/gi, '')
        .replace(/quanto\s*(t[aá]|est[aá]|vale|custa)\s*(o|a|um)?/gi, '')
        .trim();
    let amount = 1;
    const numMatch = clean.match(/^([\d.,]+)\s*/);
    if (numMatch) {
        amount = parseAmount(numMatch[1]);
        clean = clean.substring(numMatch[0].length).trim();
    }
    const splitMatch = clean.split(/\s+(?:para|em|pra|to|->)\s+/i);
    let from = 'USD';
    let to = 'BRL';
    if (splitMatch.length >= 2) {
        from = splitMatch[0].trim();
        to = splitMatch[1].trim();
    } else {
        from = clean.trim() || 'USD';
        to = 'BRL';
    }
    return { amount: parseAmount(amount), from: normalizeCurrency(from), to: normalizeCurrency(to) };
}

function saveCacheToDisk(cache) {
    try {
        if (!fs.existsSync(path.dirname(cachePath))) {
            fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        }
        const tempPath = `${cachePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(cache, null, 2), 'utf8');
        fs.renameSync(tempPath, cachePath);
    } catch (_) {
        try {
            fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
        } catch (__) {}
    }
}

function loadDiskCache() {
    if (fs.existsSync(cachePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (data && typeof data === 'object' && data.rates) {
                return {
                    timestamp: data.timestamp || 0,
                    date: data.date || new Date().toISOString(),
                    rates: data.rates || { BRL: 1.0 },
                    details: data.details || {},
                    dynamicRates: data.dynamicRates || {}
                };
            }
        } catch (_) {}
    }
    return null;
}

async function getCache() {
    if (memoryCache && (Date.now() - memoryCache.timestamp < CACHE_TTL)) {
        return memoryCache;
    }

    if (!memoryCache) {
        const fromDisk = loadDiskCache();
        if (fromDisk && (Date.now() - fromDisk.timestamp < CACHE_TTL)) {
            memoryCache = fromDisk;
            return memoryCache;
        }
        if (fromDisk) memoryCache = fromDisk;
    }

    if (inFlightCachePromise) {
        return inFlightCachePromise;
    }

    inFlightCachePromise = (async () => {
        try {
            const batchPairs = 'USD-BRL,EUR-BRL,GBP-BRL,JPY-BRL,CAD-BRL,AUD-BRL,CHF-BRL,CNY-BRL,ARS-BRL,CLP-BRL,COP-BRL,UYU-BRL,MXN-BRL,RUB-BRL,INR-BRL,BTC-BRL,ETH-BRL,SOL-BRL,DOGE-BRL,LTC-BRL,XRP-BRL';
            const response = await axios.get(`https://economia.awesomeapi.com.br/json/last/${batchPairs}`, { timeout: 8000 });
            const data = response.data;
            const rates = { BRL: 1.0 };
            const details = {};

            for (const key of Object.keys(data)) {
                const item = data[key];
                const coin = item.code;
                const bid = parseFloat(item.bid);
                if (coin && !isNaN(bid)) {
                    rates[coin] = bid;
                    details[coin] = {
                        name: item.name,
                        bid: bid,
                        high: parseFloat(item.high) || null,
                        low: parseFloat(item.low) || null,
                        pctChange: item.pctChange ? parseFloat(item.pctChange).toFixed(2) : null,
                        create_date: item.create_date
                    };
                }
            }

            memoryCache = {
                timestamp: Date.now(),
                date: new Date().toISOString(),
                rates: rates,
                details: details,
                dynamicRates: memoryCache?.dynamicRates || {}
            };

            saveCacheToDisk(memoryCache);
            return memoryCache;
        } catch (error) {
            if (memoryCache && memoryCache.rates && Object.keys(memoryCache.rates).length > 1) {
                return memoryCache;
            }

            try {
                const fbRes = await axios.get('https://open.er-api.com/v6/latest/BRL', { timeout: 6000 });
                if (fbRes.data && fbRes.data.rates) {
                    const erRates = fbRes.data.rates;
                    const rates = { BRL: 1.0 };
                    for (const c of Object.keys(erRates)) {
                        const rateAgainstBRL = 1 / erRates[c];
                        if (!isNaN(rateAgainstBRL) && rateAgainstBRL > 0) {
                            rates[c] = rateAgainstBRL;
                        }
                    }
                    memoryCache = {
                        timestamp: Date.now(),
                        date: new Date().toISOString(),
                        rates: rates,
                        details: {},
                        dynamicRates: memoryCache?.dynamicRates || {}
                    };
                    saveCacheToDisk(memoryCache);
                    return memoryCache;
                }
            } catch (_) {}

            if (memoryCache && memoryCache.rates) {
                return memoryCache;
            }

            throw error;
        } finally {
            inFlightCachePromise = null;
        }
    })();

    return inFlightCachePromise;
}

async function convertCurrency(rawAmount, rawFrom, rawTo) {
    const amount = parseAmount(rawAmount);
    let from = normalizeCurrency(rawFrom || 'USD');
    let to = normalizeCurrency(rawTo || 'BRL');

    if (from === to) {
        return {
            success: true,
            from: from,
            to: to,
            amount: amount,
            rate: 1.0,
            result: amount,
            name: `${from}/${to}`,
            lastUpdate: 'Tempo Real'
        };
    }

    let cache;
    try {
        cache = await getCache();
    } catch (_) {
        cache = memoryCache || loadDiskCache() || { rates: { BRL: 1.0 }, dynamicRates: {} };
    }

    if (cache?.rates && cache.rates[from] !== undefined && cache.rates[to] !== undefined) {
        const rateFromBRL = cache.rates[from];
        const rateToBRL = cache.rates[to];
        const rate = rateFromBRL / rateToBRL;
        const converted = amount * rate;
        const detail = cache.details ? (cache.details[from] || cache.details[to]) : null;

        return {
            success: true,
            from: from,
            to: to,
            amount: amount,
            rate: rate,
            result: converted,
            name: `${from}/${to}`,
            lastUpdate: detail?.create_date || cache.date || 'Tempo Real',
            pctChange: detail?.pctChange || null,
            high: detail?.high || null,
            low: detail?.low || null
        };
    }

    const directKey = `${from}-${to}`;
    const inverseKey = `${to}-${from}`;

    if (cache?.dynamicRates && cache.dynamicRates[directKey]) {
        const rateData = cache.dynamicRates[directKey];
        if (Date.now() - (rateData.timestamp || 0) < CACHE_TTL) {
            return {
                success: true,
                from: from,
                to: to,
                amount: amount,
                rate: rateData.rate,
                result: amount * rateData.rate,
                name: rateData.name || `${from}/${to}`,
                lastUpdate: rateData.lastUpdate,
                pctChange: rateData.pctChange || null,
                high: rateData.high || null,
                low: rateData.low || null
            };
        }
    }

    if (cache?.dynamicRates && cache.dynamicRates[inverseKey]) {
        const rateData = cache.dynamicRates[inverseKey];
        if (Date.now() - (rateData.timestamp || 0) < CACHE_TTL) {
            const invRate = 1 / rateData.rate;
            return {
                success: true,
                from: from,
                to: to,
                amount: amount,
                rate: invRate,
                result: amount * invRate,
                name: `${from}/${to} (Inverso de ${rateData.name})`,
                lastUpdate: rateData.lastUpdate
            };
        }
    }

    try {
        const response = await axios.get(`https://economia.awesomeapi.com.br/json/last/${from}-${to}`, { timeout: 6000 });
        const pairKey = Object.keys(response.data)[0];
        if (pairKey && response.data[pairKey]) {
            const rateData = response.data[pairKey];
            const bid = parseFloat(rateData.bid);
            if (!isNaN(bid)) {
                if (!cache.dynamicRates) cache.dynamicRates = {};
                cache.dynamicRates[directKey] = {
                    rate: bid,
                    name: rateData.name,
                    lastUpdate: rateData.create_date,
                    pctChange: rateData.pctChange ? parseFloat(rateData.pctChange).toFixed(2) : null,
                    high: parseFloat(rateData.high) || null,
                    low: parseFloat(rateData.low) || null,
                    timestamp: Date.now()
                };
                saveCacheToDisk(cache);

                return {
                    success: true,
                    from: from,
                    to: to,
                    amount: amount,
                    rate: bid,
                    result: amount * bid,
                    name: rateData.name,
                    lastUpdate: rateData.create_date,
                    pctChange: rateData.pctChange ? parseFloat(rateData.pctChange).toFixed(2) : null,
                    high: parseFloat(rateData.high) || null,
                    low: parseFloat(rateData.low) || null
                };
            }
        }
    } catch (_) {}

    try {
        const fallbackRes = await axios.get(`https://economia.awesomeapi.com.br/json/last/${to}-${from}`, { timeout: 6000 });
        const pairKey = Object.keys(fallbackRes.data)[0];
        if (pairKey && fallbackRes.data[pairKey]) {
            const rateData = fallbackRes.data[pairKey];
            const bid = parseFloat(rateData.bid);
            if (!isNaN(bid) && bid > 0) {
                const invRate = 1 / bid;
                if (!cache.dynamicRates) cache.dynamicRates = {};
                cache.dynamicRates[directKey] = {
                    rate: invRate,
                    name: `${from}/${to} (Inverso de ${rateData.name})`,
                    lastUpdate: rateData.create_date,
                    timestamp: Date.now()
                };
                saveCacheToDisk(cache);

                return {
                    success: true,
                    from: from,
                    to: to,
                    amount: amount,
                    rate: invRate,
                    result: amount * invRate,
                    name: `${from}/${to} (Inverso de ${rateData.name})`,
                    lastUpdate: rateData.create_date
                };
            }
        }
    } catch (_) {}

    try {
        const fbRes = await axios.get(`https://open.er-api.com/v6/latest/${from}`, { timeout: 6000 });
        if (fbRes.data && fbRes.data.rates && fbRes.data.rates[to]) {
            const rate = parseFloat(fbRes.data.rates[to]);
            if (!isNaN(rate) && rate > 0) {
                if (!cache.dynamicRates) cache.dynamicRates = {};
                cache.dynamicRates[directKey] = {
                    rate: rate,
                    name: `${from}/${to}`,
                    lastUpdate: fbRes.data.time_last_update_utc || 'Tempo Real',
                    timestamp: Date.now()
                };
                saveCacheToDisk(cache);

                return {
                    success: true,
                    from: from,
                    to: to,
                    amount: amount,
                    rate: rate,
                    result: amount * rate,
                    name: `${from}/${to}`,
                    lastUpdate: fbRes.data.time_last_update_utc || 'Tempo Real'
                };
            }
        }
    } catch (_) {}

    return { error: `Não consegui a cotação para ${from} -> ${to}. Confira se os códigos da moeda estão corretos (ex: USD, EUR, BTC, BRL).` };
}

module.exports = {
    convertCurrency,
    normalizeCurrency,
    parseAmount,
    formatCurrencyNumber,
    parseCurrencyQuery,
    getCache
};
