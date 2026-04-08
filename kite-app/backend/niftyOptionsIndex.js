/**
 * Parses Kite public instruments CSV and builds NIFTY index options (NFO-OPT)
 * grouped by expiry → strike → { ce, pe } tradingsymbols + tokens.
 */

const axios = require('axios');

const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';
const CACHE_TTL_MS = 5 * 60 * 60 * 1000;

let cache = { at: 0, byExpiry: null };

function parseCSVLine(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            inQ = !inQ;
            continue;
        }
        if (c === ',' && !inQ) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += c;
    }
    out.push(cur);
    return out;
}

/**
 * @returns {Map<string, Map<number, { ce?: {token:number,tradingsymbol:string}, pe?: {...} }>>}
 */
async function loadNiftyNfoOptionIndex() {
    if (cache.byExpiry && Date.now() - cache.at < CACHE_TTL_MS) {
        return cache.byExpiry;
    }

    const res = await axios.get(INSTRUMENTS_URL, {
        responseType: 'text',
        timeout: 120000,
        maxContentLength: 50 * 1024 * 1024,
    });

    const byExpiry = new Map();
    const lines = String(res.data).split(/\r?\n/);

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = parseCSVLine(line);
        if (cols.length < 12) continue;

        const instrument_token = cols[0];
        const tradingsymbol = cols[2];
        const name = cols[3];
        const expiry = cols[5];
        const strikeRaw = cols[6];
        const instrument_type = cols[9];
        const segment = cols[10];
        const exchange = cols[11];

        if (exchange !== 'NFO' || segment !== 'NFO-OPT') continue;
        if (name !== 'NIFTY') continue;
        if (instrument_type !== 'CE' && instrument_type !== 'PE') continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) continue;

        const strike = parseFloat(strikeRaw);
        const token = parseInt(instrument_token, 10);
        if (!Number.isFinite(strike) || !Number.isFinite(token)) continue;

        if (!byExpiry.has(expiry)) byExpiry.set(expiry, new Map());
        const sm = byExpiry.get(expiry);
        if (!sm.has(strike)) sm.set(strike, {});
        const cell = sm.get(strike);
        const cellInstr = { token, tradingsymbol };
        if (instrument_type === 'CE') cell.ce = cellInstr;
        else cell.pe = cellInstr;
    }

    cache = { at: Date.now(), byExpiry };
    return byExpiry;
}

function pickExpiry(byExpiry, preferredYmd, todayYmd) {
    const keys = [...byExpiry.keys()].sort();
    if (!keys.length) return null;
    if (preferredYmd && byExpiry.has(preferredYmd)) return preferredYmd;
    const future = keys.filter((k) => k >= todayYmd);
    return future[0] ?? keys[keys.length - 1];
}

function strikesWindow(strikeMap, atm, wings) {
    const step = 50;
    const want = [];
    for (let w = -wings; w <= wings; w++) {
        want.push(atm + w * step);
    }
    const out = [];
    for (const s of want) {
        const cell = strikeMap.get(s);
        if (cell?.ce && cell?.pe) out.push(s);
    }
    return out;
}

module.exports = {
    loadNiftyNfoOptionIndex,
    pickExpiry,
    strikesWindow,
};
