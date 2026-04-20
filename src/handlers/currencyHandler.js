const axios = require('axios');

async function convertCurrency(amount, from, to) {
    if (!amount || isNaN(amount)) amount = 1;
    from = String(from).toUpperCase().trim();
    to = String(to).toUpperCase().trim();
    
    const nameMap = {
        'DOLAR': 'USD', 'DÓLAR': 'USD', 'US': 'USD', 'DOLAR AMERICANO': 'USD',
        'REAIS': 'BRL', 'REAL': 'BRL', 'BR': 'BRL',
        'EURO': 'EUR', 'EUROS': 'EUR', 
        'BITCOIN': 'BTC', 'ETHEREUM': 'ETH',
        'LIBRA': 'GBP', 'PESO': 'ARS', 'PESOS': 'ARS', 'IENE': 'JPY'
    };
    
    if (nameMap[from]) from = nameMap[from];
    if (nameMap[to]) to = nameMap[to];

    try {
        console.log(`[CURRENCY] Convertendo ${amount} de ${from} para ${to}`);
        const response = await axios.get(`https://economia.awesomeapi.com.br/json/last/${from}-${to}`, { timeout: 5000 });
        
        const pairKey = Object.keys(response.data)[0];
        if (!pairKey) return { error: `Câmbio de ${from} para ${to} não encontrado.` };
        
        const rateData = response.data[pairKey];
        const bid = parseFloat(rateData.bid);
        const converted = amount * bid;
        
        return {
            success: true,
            from: from,
            to: to,
            amount: amount,
            rate: bid,
            result: converted,
            name: rateData.name,
            lastUpdate: rateData.create_date 
        };
        
    } catch (error) {
        try {
             const fallbackRes = await axios.get(`https://economia.awesomeapi.com.br/json/last/${to}-${from}`, { timeout: 5000 });
             const pairKey = Object.keys(fallbackRes.data)[0];
             const rateData = fallbackRes.data[pairKey];
             const bid = 1 / parseFloat(rateData.bid);
             const converted = amount * bid;
             
             return {
                success: true,
                from: from,
                to: to,
                amount: amount,
                rate: bid,
                result: converted,
                name: `${from}/${to} (Inverso de ${rateData.name})`,
                lastUpdate: rateData.create_date
            };
        } catch(fallbackError) {
             console.error('[CURRENCY] Erro na API principal/fallback:', error.message);
             return { error: `Não consegui a cotação oficial para ${from} -> ${to}. Confira se os códigos da moeda existem (Ex: USD, EUR, BTC, BRL).` };
        }
    }
}

module.exports = {
    convertCurrency
};
