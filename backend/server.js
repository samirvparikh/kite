const crypto = require('crypto');
const qs = require('qs');
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const cors = require('cors');
const {
    loadNiftyNfoOptionIndex,
    pickExpiry,
    strikesWindow,
} = require('./niftyOptionsIndex');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
    res.json({
        ok: true,
        service: 'inningstar-backend',
        hint: 'Open GET /api for API list. Restart server after pulling changes.',
    });
});

app.get('/api', (req, res) => {
    res.json({
        ok: true,
        endpoints: [
            'GET /login',
            'GET /callback',
            'GET /api/kite/user/profile',
            'GET /api/kite/user/margins',
            'GET /api/kite/portfolio/holdings',
            'GET /api/kite/portfolio/positions',
            'GET /api/market/nifty50-scanner?date=YYYY-MM-DD&type=sector|top-gainers|top-losers|5min-breakout (first 5m H/L both sides broken)',
            'GET /api/kite/quote?i=NSE:INFY&i=...',
            'GET /api/scan/nifty50-920-breakout?date=YYYY-MM-DD',
            'GET /api/scan/nifty50-930-breakout?date=YYYY-MM-DD',
            'GET /api/scan/nifty-option-bias?wings=5&expiry=YYYY-MM-DD (optional)',
        ],
        auth: 'Send header: Authorization: Bearer <access_token> (except /login, /callback)',
    });
});

const API_KEY = process.env.API_KEY?.trim();

async function kiteGet(req, res, endpoint) {
    const auth = req.headers.authorization;
    const accessToken =
        auth && auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    if (!accessToken) {
        return res.status(401).json({ error: 'Missing access token' });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }
    try {
        const response = await axios.get(`https://api.kite.trade/${endpoint}`, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }
}

app.get('/api/kite/user/profile', (req, res) =>
    kiteGet(req, res, 'user/profile')
);
app.get('/api/kite/user/margins', (req, res) =>
    kiteGet(req, res, 'user/margins')
);
app.get('/api/kite/portfolio/holdings', (req, res) =>
    kiteGet(req, res, 'portfolio/holdings')
);
app.get('/api/kite/portfolio/positions', (req, res) =>
    kiteGet(req, res, 'portfolio/positions')
);

function getBearerToken(req) {
    const auth = req.headers.authorization;
    return auth && auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

function istDateString(d = new Date()) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function istMinutesSinceMidnight(d = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(
        parts.find((p) => p.type === 'minute')?.value ?? '0',
        10
    );
    return hour * 60 + minute;
}

/** Pads YYYY-M-D to YYYY-MM-DD so string compare with istDateString() is correct. */
function normalizeCalendarYmd(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
    if (!m) return null;
    const y = m[1];
    const mo = String(Number(m[2])).padStart(2, '0');
    const d = String(Number(m[3])).padStart(2, '0');
    return `${y}-${mo}-${d}`;
}

function formatIstHmsFromStamp(stamp) {
    const d = new Date(stamp);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const h = (parts.find((p) => p.type === 'hour')?.value ?? '00').padStart(
        2,
        '0'
    );
    const mi = (parts.find((p) => p.type === 'minute')?.value ?? '00').padStart(
        2,
        '0'
    );
    const s = (parts.find((p) => p.type === 'second')?.value ?? '00').padStart(
        2,
        '0'
    );
    return `${h}:${mi}:${s}`;
}

/** Minutes from midnight in Asia/Kolkata (for matching 5m bar open times). */
function istMinuteOfDayFromStamp(stamp) {
    const d = new Date(stamp);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const mi = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return h * 60 + mi;
}

function parseOpenMinuteIst(timeStr) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(timeStr).trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Try several Kite from/to shapes — past sessions often work reliably with
 * date-only (full day 5m) or a full-session window.
 */
async function fetchKite5MinuteCandlesForDay(
    accessToken,
    instrumentToken,
    ymd
) {
    const headers = {
        'X-Kite-Version': '3',
        Authorization: `token ${API_KEY}:${accessToken}`,
    };
    const attempts = [
        `instruments/historical/${instrumentToken}/5minute?from=${encodeURIComponent(ymd)}&to=${encodeURIComponent(ymd)}`,
        `instruments/historical/${instrumentToken}/5minute?from=${encodeURIComponent(`${ymd} 09:15:00`)}&to=${encodeURIComponent(`${ymd} 15:30:00`)}`,
        `instruments/historical/${instrumentToken}/5minute?from=${encodeURIComponent(`${ymd} 09:00:00`)}&to=${encodeURIComponent(`${ymd} 16:00:00`)}`,
    ];
    let lastErr;
    for (const path of attempts) {
        try {
            const histRes = await axios.get(`https://api.kite.trade/${path}`, {
                headers,
            });
            const candles = histRes.data?.data?.candles ?? [];
            if (candles.length) {
                candles.sort(
                    (a, b) =>
                        new Date(a[0]).getTime() - new Date(b[0]).getTime()
                );
                return candles;
            }
        } catch (e) {
            lastErr = e;
        }
    }
    if (lastErr) throw lastErr;
    return [];
}

function getCandleValue(candles, time, index) {
    for (const candle of candles) {
        const stamp = candle[0] ?? '';
        if (String(stamp).includes(time)) {
            return parseFloat(candle[index] ?? 0);
        }
    }
    return null;
}

function ohlcFromCandleRow(c) {
    const o = parseFloat(c[1]);
    const h = parseFloat(c[2]);
    const l = parseFloat(c[3]);
    const cl = parseFloat(c[4]);
    if (![o, h, l, cl].every((n) => Number.isFinite(n))) return null;
    return { open: o, high: h, low: l, close: cl };
}

/**
 * 5-minute bar that opens at `time` IST (e.g. 09:15:00). Matches substring in
 * stamp, full IST H:M:S, or minute-of-day (9:15 → 555, 9:30 → 570).
 */
function get5MinuteBarAt(candles, time) {
    if (!Array.isArray(candles)) return null;
    const want = /^\d{1,2}:\d{2}$/.test(time) ? `${time}:00` : time;
    const wantOpenMin = parseOpenMinuteIst(want);
    for (const c of candles) {
        const stamp = String(c[0] ?? '');
        if (stamp.includes(want) || stamp.includes(time)) {
            return ohlcFromCandleRow(c);
        }
    }
    for (const c of candles) {
        const ist = formatIstHmsFromStamp(c[0]);
        if (ist === want) {
            return ohlcFromCandleRow(c);
        }
    }
    if (wantOpenMin != null) {
        for (const c of candles) {
            const mod = istMinuteOfDayFromStamp(c[0]);
            if (mod === wantOpenMin) {
                return ohlcFromCandleRow(c);
            }
        }
    }
    return null;
}

/** Index of the 5m candle that opens at 09:15 IST (first regular session bar). */
function indexOfOpening915Bar(candles) {
    if (!Array.isArray(candles)) return -1;
    const wantMin = 9 * 60 + 15;
    for (let i = 0; i < candles.length; i++) {
        const mod = istMinuteOfDayFromStamp(candles[i][0]);
        if (mod === wantMin) return i;
    }
    return -1;
}

/**
 * After the first 5m bar, session range (subsequent bars ± today's LTP) must
 * have traded strictly above `firstHigh` and strictly below `firstLow`.
 */
function sessionBrokeBothSidesOfFirst5m(
    candles,
    firstBarIndex,
    firstHigh,
    firstLow,
    mergeLtp
) {
    let maxH = -Infinity;
    let minL = Infinity;
    for (let i = firstBarIndex + 1; i < candles.length; i++) {
        const o = ohlcFromCandleRow(candles[i]);
        if (!o) continue;
        maxH = Math.max(maxH, o.high);
        minL = Math.min(minL, o.low);
    }
    if (mergeLtp != null && Number.isFinite(mergeLtp)) {
        maxH = Math.max(maxH, mergeLtp);
        minL = Math.min(minL, mergeLtp);
    }
    if (!Number.isFinite(maxH) || !Number.isFinite(minL)) return false;
    return maxH > firstHigh && minL < firstLow;
}

const NIFTY50_SYMBOLS = [
    'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK',
    'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV', 'BEL', 'BHARTIARTL',
    'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL',
    'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HEROMOTOCO',
    'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDUSINDBK', 'INFY',
    'ITC', 'JIOFIN', 'JSWSTEEL', 'KOTAKBANK', 'LT',
    'M&M', 'MARUTI', 'NESTLEIND', 'NTPC', 'ONGC',
    'POWERGRID', 'RELIANCE', 'SBILIFE', 'SHRIRAMFIN', 'SBIN',
    'SUNPHARMA', 'TATACONSUM', 'TATAMOTORS', 'TATASTEEL', 'TCS',
    'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO',
];

/** Broad sector bucket per NIFTY50 symbol (for sector view aggregation) */
const NIFTY50_SECTOR = {
    ADANIENT: 'Metals',
    ADANIPORTS: 'Infra',
    APOLLOHOSP: 'Pharma',
    ASIANPAINT: 'FMCG',
    AXISBANK: 'Banking',
    'BAJAJ-AUTO': 'Auto',
    BAJFINANCE: 'Finance',
    BAJAJFINSV: 'Finance',
    BEL: 'IT',
    BHARTIARTL: 'Telecom',
    CIPLA: 'Pharma',
    COALINDIA: 'Energy',
    DRREDDY: 'Pharma',
    EICHERMOT: 'Auto',
    ETERNAL: 'Finance',
    GRASIM: 'Cement',
    HCLTECH: 'IT',
    HDFCBANK: 'Banking',
    HDFCLIFE: 'Finance',
    HEROMOTOCO: 'Auto',
    HINDALCO: 'Metals',
    HINDUNILVR: 'FMCG',
    ICICIBANK: 'Banking',
    INDUSINDBK: 'Banking',
    INFY: 'IT',
    ITC: 'FMCG',
    JIOFIN: 'Finance',
    JSWSTEEL: 'Metals',
    KOTAKBANK: 'Banking',
    LT: 'Infra',
    'M&M': 'Auto',
    MARUTI: 'Auto',
    NESTLEIND: 'FMCG',
    NTPC: 'Energy',
    ONGC: 'Energy',
    POWERGRID: 'Energy',
    RELIANCE: 'Energy',
    SBILIFE: 'Finance',
    SHRIRAMFIN: 'Finance',
    SBIN: 'Banking',
    SUNPHARMA: 'Pharma',
    TATACONSUM: 'FMCG',
    TATAMOTORS: 'Auto',
    TATASTEEL: 'Metals',
    TCS: 'IT',
    TECHM: 'IT',
    TITAN: 'FMCG',
    TRENT: 'Retail',
    ULTRACEMCO: 'Cement',
    WIPRO: 'IT',
};

function prevWeekdayIso(isoDateStr) {
    const [y, m, d] = isoDateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) {
        dt.setUTCDate(dt.getUTCDate() - 1);
    }
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function candleDateKey(stamp) {
    const s = String(stamp);
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function findDayCandle(candles, ymd) {
    if (!Array.isArray(candles)) return null;
    return (
        candles.find((c) => candleDateKey(c[0]) === ymd) ?? null
    );
}

function ymdToDmy(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''));
    if (!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
}

function normalizeCaText(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return '-';
    const u = s.toUpperCase();
    if (u.includes('DIVIDEND')) return 'DIV';
    if (u.includes('BONUS')) return 'BONUS';
    if (u.includes('SPLIT')) return 'SPLIT';
    if (u.includes('RIGHT')) return 'RIGHTS';
    return s.length > 20 ? `${s.slice(0, 20)}…` : s;
}

async function fetchNseCorporateActionsBySymbol(selectedDate, symbols) {
    const out = new Map();
    if (!Array.isArray(symbols) || symbols.length === 0) return out;
    const dmy = ymdToDmy(selectedDate);
    if (!dmy) return out;

    try {
        const home = await axios.get('https://www.nseindia.com', {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        const rawCookies = home.headers?.['set-cookie'];
        const cookieHeader = Array.isArray(rawCookies)
            ? rawCookies.map((c) => c.split(';')[0]).join('; ')
            : '';

        const apiUrl = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&from_date=${encodeURIComponent(
            dmy
        )}&to_date=${encodeURIComponent(dmy)}`;
        const caRes = await axios.get(apiUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'application/json, text/plain, */*',
                Referer: 'https://www.nseindia.com/companies-listing/corporate-filings-actions',
                Cookie: cookieHeader,
            },
        });

        const rows = Array.isArray(caRes.data) ? caRes.data : caRes.data?.data;
        if (!Array.isArray(rows)) return out;

        const symbolSet = new Set(symbols);
        for (const r of rows) {
            const sym = String(r?.symbol ?? r?.sm_name ?? '').trim().toUpperCase();
            if (!sym || !symbolSet.has(sym)) continue;
            const purpose =
                r?.purpose ??
                r?.subject ??
                r?.desc ??
                r?.series ??
                '';
            out.set(sym, normalizeCaText(purpose));
        }
        return out;
    } catch {
        return out;
    }
}

function timePartFromCandleStamp(stamp) {
    const s = String(stamp ?? '');
    const tPos = s.indexOf('T');
    if (tPos >= 0 && s.length >= tPos + 9) return s.slice(tPos + 1, tPos + 9);
    if (s.length >= 19 && s[10] === ' ') return s.slice(11, 19);
    if (s.length >= 8) return s.slice(-8);
    return '';
}

function barsBetweenTimeInclusive(candles, fromTime, toTime) {
    if (!Array.isArray(candles)) return [];
    return candles.filter((c) => {
        const t = timePartFromCandleStamp(c?.[0]);
        return t >= fromTime && t <= toTime;
    });
}

function calcSessionOhlcvFrom5m(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return null;
    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    let volume = 0;
    const open = parseFloat(candles[0]?.[1] ?? NaN);
    for (const c of candles) {
        const h = parseFloat(c?.[2] ?? NaN);
        const l = parseFloat(c?.[3] ?? NaN);
        const v = parseFloat(c?.[5] ?? NaN);
        if (Number.isFinite(h) && h > high) high = h;
        if (Number.isFinite(l) && l < low) low = l;
        if (Number.isFinite(v)) volume += v;
    }
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low)) {
        return null;
    }
    return { open, high, low, volume: Math.round(volume) };
}

async function fetchPrevCloseForDay(accessToken, instrumentToken, selectedDate) {
    const prev = prevWeekdayIso(selectedDate);
    const path = `instruments/historical/${instrumentToken}/day?from=${encodeURIComponent(prev)}&to=${encodeURIComponent(selectedDate)}`;
    const histRes = await axios.get(`https://api.kite.trade/${path}`, {
        headers: {
            'X-Kite-Version': '3',
            Authorization: `token ${API_KEY}:${accessToken}`,
        },
    });
    const candles = histRes.data?.data?.candles ?? [];
    const cPrev = findDayCandle(candles, prev);
    if (!cPrev) return null;
    const closePrev = parseFloat(cPrev[4] ?? NaN);
    return Number.isFinite(closePrev) ? closePrev : null;
}

function pctChangeFromQuotes(q) {
    const last = parseFloat(q.last_price ?? 0);
    const ch = parseFloat(q.change ?? q.net_change ?? 0);
    const prevClose = last - ch;
    const changePct =
        prevClose !== 0 && Number.isFinite(prevClose)
            ? (ch / prevClose) * 100
            : 0;
    return {
        last_price: last,
        change_rs: ch,
        change_pct: Number.isFinite(changePct) ? changePct : 0,
    };
}

async function fetchQuoteMap(accessToken) {
    const instruments = NIFTY50_SYMBOLS.map((s) => `NSE:${s}`);
    const q = instruments.map((i) => `i=${encodeURIComponent(i)}`).join('&');
    const quoteRes = await axios.get(`https://api.kite.trade/quote?${q}`, {
        headers: {
            'X-Kite-Version': '3',
            Authorization: `token ${API_KEY}:${accessToken}`,
        },
    });
    return quoteRes.data?.data ?? {};
}

async function fetchHistoricalDayPair(accessToken, instrumentToken, sel, prev) {
    const path = `instruments/historical/${instrumentToken}/day?from=${encodeURIComponent(prev)}&to=${encodeURIComponent(sel)}`;
    const histRes = await axios.get(`https://api.kite.trade/${path}`, {
        headers: {
            'X-Kite-Version': '3',
            Authorization: `token ${API_KEY}:${accessToken}`,
        },
    });
    const candles = histRes.data?.data?.candles ?? [];
    const cPrev = findDayCandle(candles, prev);
    const cSel = findDayCandle(candles, sel);
    if (!cPrev || !cSel) return null;
    const closePrev = parseFloat(cPrev[4] ?? 0);
    const closeSel = parseFloat(cSel[4] ?? 0);
    if (!Number.isFinite(closePrev) || closePrev === 0) return null;
    const changeRs = closeSel - closePrev;
    const changePct = (changeRs / closePrev) * 100;
    return {
        last_price: closeSel,
        change_rs: changeRs,
        change_pct: Number.isFinite(changePct) ? changePct : 0,
    };
}

async function buildNifty50MarketRows(accessToken, selectedDate) {
    const todayIST = istDateString();
    const quoteMap = await fetchQuoteMap(accessToken);
    const rows = [];

    if (selectedDate === todayIST) {
        for (const symbol of NIFTY50_SYMBOLS) {
            const key = `NSE:${symbol}`;
            const q = quoteMap[key];
            if (!q) continue;
            const m = pctChangeFromQuotes(q);
            rows.push({
                symbol,
                exchange: 'NSE',
                last_price: m.last_price,
                change_pct: m.change_pct,
                change_rs: m.change_rs,
                sector: NIFTY50_SECTOR[symbol] ?? 'Others',
            });
        }
        return { source: 'quote', rows, quoteMap };
    }

    const prev = prevWeekdayIso(selectedDate);
    const concurrency = 8;
    const chunks = [];
    for (let i = 0; i < NIFTY50_SYMBOLS.length; i += concurrency) {
        chunks.push(NIFTY50_SYMBOLS.slice(i, i + concurrency));
    }

    for (const batch of chunks) {
        await Promise.all(
            batch.map(async (symbol) => {
                const key = `NSE:${symbol}`;
                const token = quoteMap[key]?.instrument_token;
                if (token == null || token === '') return;
                try {
                    const m = await fetchHistoricalDayPair(
                        accessToken,
                        token,
                        selectedDate,
                        prev
                    );
                    if (!m) return;
                    rows.push({
                        symbol,
                        exchange: 'NSE',
                        last_price: m.last_price,
                        change_pct: m.change_pct,
                        change_rs: m.change_rs,
                        sector: NIFTY50_SECTOR[symbol] ?? 'Others',
                    });
                } catch (e) {
                    console.error(symbol, e.message);
                }
            })
        );
    }

    return { source: 'historical', rows, quoteMap };
}

function aggregateSectorRows(marketRows) {
    const by = new Map();
    for (const r of marketRows) {
        const sector = NIFTY50_SECTOR[r.symbol] ?? 'Others';
        if (!by.has(sector)) {
            by.set(sector, { sum: 0, n: 0 });
        }
        const g = by.get(sector);
        g.sum += r.change_pct;
        g.n += 1;
    }
    const out = [];
    for (const [name, { sum, n }] of by.entries()) {
        out.push({
            name,
            stocks: n,
            change_pct: n > 0 ? sum / n : 0,
        });
    }
    out.sort((a, b) => b.change_pct - a.change_pct);
    return out;
}

/**
 * date=YYYY-MM-DD, type=sector|top-gainers|top-losers|5min-breakout
 * Mounted at /api/market so full path is /api/market/nifty50-scanner
 */
const marketRouter = express.Router();
marketRouter.get('/nifty50-scanner', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({ error: 'Missing access token' });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }

    const todayIST = istDateString();
    const rawQueryDate =
        typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const selectedDate =
        normalizeCalendarYmd(rawQueryDate) || todayIST;
    const type = String(req.query.type ?? 'top-gainers');

    try {
        const { source, rows: marketRows, quoteMap } =
            await buildNifty50MarketRows(accessToken, selectedDate);

        if (type === 'sector') {
            const sectorRows = aggregateSectorRows(marketRows);
            return res.json({
                date: selectedDate,
                source,
                sectorRows,
                stockRows: marketRows,
            });
        }

        let stockRows = [...marketRows];
        if (type === 'top-gainers') {
            stockRows.sort((a, b) => b.change_pct - a.change_pct);
        } else if (type === 'top-losers') {
            stockRows.sort((a, b) => a.change_pct - b.change_pct);
        } else if (type === '5min-breakout') {
            const isTodayBreakout = selectedDate === todayIST;
            const bySymbol = new Map(marketRows.map((r) => [r.symbol, r]));
            const breakoutRows = [];
            const breakdownRows = [];
            const errorRows = [];

            async function run5minBreakoutSymbol(symbol) {
                const key = `NSE:${symbol}`;
                const instrumentToken = quoteMap[key]?.instrument_token;
                if (instrumentToken == null || instrumentToken === '') {
                    errorRows.push({ symbol, reason: 'Instrument token not found' });
                    return;
                }

                let candles;
                try {
                    candles = await fetchKite5MinuteCandlesForDay(
                        accessToken,
                        instrumentToken,
                        selectedDate
                    );
                } catch (e) {
                    errorRows.push({
                        symbol,
                        reason: e.response?.data?.message || e.message || 'History error',
                    });
                    return;
                }
                if (!candles.length) {
                    errorRows.push({ symbol, reason: 'No 5-minute candles' });
                    return;
                }

                const idx915 = indexOfOpening915Bar(candles);
                if (idx915 < 0) {
                    errorRows.push({ symbol, reason: 'Missing 09:15 5-minute bar' });
                    return;
                }
                const bar915 = ohlcFromCandleRow(candles[idx915]);
                if (!bar915) {
                    errorRows.push({ symbol, reason: 'Invalid 09:15 bar OHLC' });
                    return;
                }

                let mergeLtp = null;
                if (isTodayBreakout) {
                    mergeLtp = parseFloat(quoteMap[key]?.last_price ?? '');
                    if (!Number.isFinite(mergeLtp)) mergeLtp = null;
                }

                let maxH = Number.NEGATIVE_INFINITY;
                let minL = Number.POSITIVE_INFINITY;
                let dayOpen = Number.NaN;
                let dayHigh = Number.NEGATIVE_INFINITY;
                let dayLow = Number.POSITIVE_INFINITY;
                let dayVolume = 0;
                for (let i = 0; i < candles.length; i++) {
                    const o = ohlcFromCandleRow(candles[i]);
                    if (!o) continue;
                    if (!Number.isFinite(dayOpen)) dayOpen = o.open;
                    dayHigh = Math.max(dayHigh, o.high);
                    dayLow = Math.min(dayLow, o.low);
                    if (i > idx915) {
                        maxH = Math.max(maxH, o.high);
                        minL = Math.min(minL, o.low);
                    }
                    const v = parseFloat(candles[i]?.[5] ?? NaN);
                    if (Number.isFinite(v)) dayVolume += v;
                }
                if (mergeLtp != null && Number.isFinite(mergeLtp)) {
                    maxH = Math.max(maxH, mergeLtp);
                    minL = Math.min(minL, mergeLtp);
                }

                const market = bySymbol.get(symbol);
                if (!market) return;
                const scanRef = Number.isFinite(mergeLtp) ? mergeLtp : market.last_price;
                const prevClose = market.last_price - market.change_rs;
                const valueLakhs =
                    Number.isFinite(dayVolume) && Number.isFinite(scanRef)
                        ? (dayVolume * scanRef) / 100000
                        : null;
                const base = {
                    symbol,
                    exchange: market.exchange,
                    last_price: market.last_price,
                    change_pct: market.change_pct,
                    change_rs: market.change_rs,
                    sector: market.sector,
                    first_5m_high: bar915.high,
                    first_5m_low: bar915.low,
                    prev_close: Number.isFinite(prevClose) ? prevClose : null,
                    open: Number.isFinite(dayOpen) ? dayOpen : null,
                    high: Number.isFinite(dayHigh) ? dayHigh : null,
                    low: Number.isFinite(dayLow) ? dayLow : null,
                    volume_shares: Number.isFinite(dayVolume) ? Math.round(dayVolume) : null,
                    value_lakhs: valueLakhs,
                    scan_ref: scanRef,
                };

                if (maxH > bar915.high) {
                    breakoutRows.push({
                        ...base,
                        side: 'breakout',
                        diff: scanRef - bar915.high,
                    });
                }
                if (minL < bar915.low) {
                    breakdownRows.push({
                        ...base,
                        side: 'breakdown',
                        diff: scanRef - bar915.low,
                    });
                }
            }

            const conc = 8;
            for (let i = 0; i < NIFTY50_SYMBOLS.length; i += conc) {
                const batch = NIFTY50_SYMBOLS.slice(i, i + conc);
                await Promise.all(batch.map((s) => run5minBreakoutSymbol(s)));
            }

            breakoutRows.sort((a, b) => b.diff - a.diff);
            breakdownRows.sort((a, b) => a.diff - b.diff);
            stockRows = [...breakoutRows, ...breakdownRows];
            return res.json({
                date: selectedDate,
                source,
                sectorRows: [],
                stockRows,
                breakoutRows,
                breakdownRows,
                errorRows,
            });
        }

        return res.json({
            date: selectedDate,
            source,
            sectorRows: [],
            stockRows,
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }
});
app.use('/api/market', marketRouter);

/** Multiple `i=` params like Kite quote API */
app.get('/api/kite/quote', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({ error: 'Missing access token' });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }
    let instruments = req.query.i;
    if (!instruments) {
        return res.status(400).json({ error: 'Missing i parameter' });
    }
    const arr = Array.isArray(instruments) ? instruments : [instruments];
    const query = arr.map((i) => `i=${encodeURIComponent(i)}`).join('&');
    const url = `https://api.kite.trade/quote?${query}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }
});

app.get('/api/kite/instruments/historical/:token/minute', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({ error: 'Missing access token' });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }
    const { token } = req.params;
    const { from, to } = req.query;
    if (!from || !to) {
        return res.status(400).json({ error: 'Missing from or to' });
    }
    const path = `instruments/historical/${token}/minute?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    try {
        const response = await axios.get(`https://api.kite.trade/${path}`, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }
});

app.get('/api/scan/nifty50-920-breakout', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({ error: 'Missing access token' });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }

    const todayIST = istDateString();
    const rawQueryDate =
        typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const selectedDate =
        normalizeCalendarYmd(rawQueryDate) || todayIST;
    const minutes = istMinutesSinceMidnight();
    const isAfterScanTime =
        selectedDate < todayIST ||
        (selectedDate === todayIST && minutes >= 9 * 60 + 21);

    if (!isAfterScanTime) {
        return res.json({
            isAfterScanTime: false,
            selectedDate,
            todayIST,
            scanRows: [],
            errorRows: [],
        });
    }

    const instruments = NIFTY50_SYMBOLS.map((s) => `NSE:${s}`);
    const q = instruments.map((i) => `i=${encodeURIComponent(i)}`).join('&');
    let quoteData = {};
    try {
        const quoteRes = await axios.get(`https://api.kite.trade/quote?${q}`, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        quoteData = quoteRes.data?.data ?? {};
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }

    const from = `${selectedDate} 09:15:00`;
    const to = `${selectedDate} 15:30:00`;
    const scanRows = [];
    const errorRows = [];
    const isToday = selectedDate === todayIST;

    for (const symbol of NIFTY50_SYMBOLS) {
        const instrumentKey = `NSE:${symbol}`;
        const instrumentToken = quoteData[instrumentKey]?.instrument_token;

        if (instrumentToken == null || instrumentToken === '') {
            errorRows.push({
                symbol,
                reason: 'Instrument token not found',
            });
            continue;
        }

        let history;
        try {
            const histPath = `instruments/historical/${instrumentToken}/minute?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const histRes = await axios.get(
                `https://api.kite.trade/${histPath}`,
                {
                    headers: {
                        'X-Kite-Version': '3',
                        Authorization: `token ${API_KEY}:${accessToken}`,
                    },
                }
            );
            history = histRes.data;
        } catch (e) {
            errorRows.push({
                symbol,
                reason: e.response?.data?.message || e.message || 'History error',
            });
            continue;
        }

        const candles = history?.data?.candles ?? [];
        if (!candles.length) {
            errorRows.push({
                symbol,
                reason: 'No minute candles found',
            });
            continue;
        }

        const rangeBars = candles.filter((c) => {
            const t = String(c?.[0] ?? '').slice(11, 19);
            return t >= '09:15:00' && t <= '09:20:00';
        });
        if (!rangeBars.length) {
            errorRows.push({
                symbol,
                reason: 'Missing 09:15-09:20 candles',
            });
            continue;
        }
        const rangeHigh = Math.max(
            ...rangeBars.map((c) => parseFloat(c?.[2] ?? Number.NEGATIVE_INFINITY))
        );
        const rangeLow = Math.min(
            ...rangeBars.map((c) => parseFloat(c?.[3] ?? Number.POSITIVE_INFINITY))
        );
        if (!Number.isFinite(rangeHigh) || !Number.isFinite(rangeLow)) {
            errorRows.push({
                symbol,
                reason: 'Invalid 09:15-09:20 high/low',
            });
            continue;
        }

        let latestPrice = NaN;
        let priceSource = 'last_min_close';
        if (isToday) {
            latestPrice = parseFloat(quoteData[instrumentKey]?.last_price ?? NaN);
            priceSource = 'ltp';
        } else {
            latestPrice = parseFloat(candles[candles.length - 1]?.[4] ?? NaN);
        }
        if (!Number.isFinite(latestPrice)) {
            errorRows.push({
                symbol,
                reason: 'Invalid reference price',
            });
            continue;
        }

        if (latestPrice > rangeHigh || latestPrice < rangeLow) {
            const side = latestPrice > rangeHigh ? 'breakout' : 'breakdown';
            scanRows.push({
                symbol,
                high_920_range: rangeHigh,
                low_920_range: rangeLow,
                scan_ref: latestPrice,
                side,
                diff:
                    side === 'breakout'
                        ? latestPrice - rangeHigh
                        : latestPrice - rangeLow,
                price_source: priceSource,
            });
        }
    }

    scanRows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    return res.json({
        isAfterScanTime: true,
        selectedDate,
        todayIST,
        scanRows,
        errorRows,
        totalSymbols: NIFTY50_SYMBOLS.length,
    });
});

/**
 * NIFTY 50 · 5-min candles: high of 09:15 bar, low of 09:30 bar vs LTP (today) or
 * last 5-min close (past dates).
 */
app.get('/api/scan/nifty50-930-breakout', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({ error: 'Missing access token' });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }

    const todayIST = istDateString();
    const rawQueryDate =
        typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const selectedDate =
        normalizeCalendarYmd(rawQueryDate) || todayIST;
    const minutes = istMinutesSinceMidnight();
    const isPastSession = selectedDate < todayIST;
    const isFutureSession = selectedDate > todayIST;
    const isAfterScanTime =
        isPastSession ||
        (selectedDate === todayIST && minutes >= 9 * 60 + 35);

    if (isFutureSession) {
        return res.json({
            isAfterScanTime: false,
            isFutureDate: true,
            selectedDate,
            todayIST,
            breakoutRows: [],
            breakdownRows: [],
            errorRows: [],
            totalSymbols: NIFTY50_SYMBOLS.length,
        });
    }

    if (!isAfterScanTime) {
        return res.json({
            isAfterScanTime: false,
            isFutureDate: false,
            selectedDate,
            todayIST,
            breakoutRows: [],
            breakdownRows: [],
            errorRows: [],
            totalSymbols: NIFTY50_SYMBOLS.length,
        });
    }

    const instruments = NIFTY50_SYMBOLS.map((s) => `NSE:${s}`);
    const q = instruments.map((i) => `i=${encodeURIComponent(i)}`).join('&');
    let quoteData = {};
    try {
        const quoteRes = await axios.get(`https://api.kite.trade/quote?${q}`, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        quoteData = quoteRes.data?.data ?? {};
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }

    const breakoutRows = [];
    const breakdownRows = [];
    const errorRows = [];
    const concurrency = 8;
    const isToday = selectedDate === todayIST;
    const caBySymbol = await fetchNseCorporateActionsBySymbol(
        selectedDate,
        NIFTY50_SYMBOLS
    );

    async function runSymbol(symbol) {
        const instrumentKey = `NSE:${symbol}`;
        const instrumentToken = quoteData[instrumentKey]?.instrument_token;

        if (instrumentToken == null || instrumentToken === '') {
            errorRows.push({
                symbol,
                reason: 'Instrument token not found',
            });
            return;
        }

        let candles;
        try {
            candles = await fetchKite5MinuteCandlesForDay(
                accessToken,
                instrumentToken,
                selectedDate
            );
        } catch (e) {
            errorRows.push({
                symbol,
                reason: e.response?.data?.message || e.message || 'History error',
            });
            return;
        }
        if (!candles.length) {
            errorRows.push({
                symbol,
                reason: 'No 5-minute candles',
            });
            return;
        }

        const rangeBars = barsBetweenTimeInclusive(candles, '09:15:00', '09:30:00');
        if (rangeBars.length === 0) {
            errorRows.push({
                symbol,
                reason: 'Missing 09:15-09:30 5-min bars',
            });
            return;
        }
        const rangeHigh = Math.max(
            ...rangeBars.map((c) => parseFloat(c?.[2] ?? Number.NEGATIVE_INFINITY))
        );
        const rangeLow = Math.min(
            ...rangeBars.map((c) => parseFloat(c?.[3] ?? Number.POSITIVE_INFINITY))
        );
        if (!Number.isFinite(rangeHigh) || !Number.isFinite(rangeLow)) {
            errorRows.push({
                symbol,
                reason: 'Invalid 09:15-09:30 high/low',
            });
            return;
        }

        const sessionOhlcv = calcSessionOhlcvFrom5m(candles);
        if (!sessionOhlcv) {
            errorRows.push({
                symbol,
                reason: 'Invalid session OHLC/volume',
            });
            return;
        }

        let latest_price;
        let priceSource;
        if (isToday) {
            const qrow = quoteData[instrumentKey];
            latest_price = parseFloat(qrow?.last_price ?? NaN);
            priceSource = 'ltp';
            if (!Number.isFinite(latest_price)) {
                errorRows.push({
                    symbol,
                    reason: 'No LTP in quote',
                });
                return;
            }
        } else {
            const lastC = candles[candles.length - 1];
            latest_price = parseFloat(lastC[4] ?? NaN);
            priceSource = 'last_5min_close';
            if (!Number.isFinite(latest_price)) {
                errorRows.push({
                    symbol,
                    reason: 'Invalid last candle close',
                });
                return;
            }
        }

        let prevClose = null;
        if (isToday) {
            const qrow = quoteData[instrumentKey] ?? {};
            const qClose = parseFloat(qrow?.ohlc?.close ?? NaN);
            if (Number.isFinite(qClose)) prevClose = qClose;
        } else {
            try {
                prevClose = await fetchPrevCloseForDay(
                    accessToken,
                    instrumentToken,
                    selectedDate
                );
            } catch {
                prevClose = null;
            }
        }

        const changePct =
            Number.isFinite(prevClose) && prevClose !== 0
                ? ((latest_price - prevClose) / prevClose) * 100
                : null;
        const valueLakhs =
            Number.isFinite(sessionOhlcv.volume) && Number.isFinite(latest_price)
                ? (sessionOhlcv.volume * latest_price) / 100000
                : null;

        const base = {
            symbol,
            high_915: rangeHigh,
            low_930: rangeLow,
            latest_price,
            price_source: priceSource,
            prev_close: prevClose,
            open: sessionOhlcv.open,
            high: sessionOhlcv.high,
            low: sessionOhlcv.low,
            volume_shares: sessionOhlcv.volume,
            value_lakhs: valueLakhs,
            ca: caBySymbol.get(symbol) ?? '-',
            scan_ref: latest_price,
            change_pct: changePct,
        };

        if (latest_price > rangeHigh) {
            breakoutRows.push({
                ...base,
                vs_high_915: latest_price - rangeHigh,
            });
        }
        if (latest_price < rangeLow) {
            breakdownRows.push({
                ...base,
                vs_low_930: latest_price - rangeLow,
            });
        }
    }

    for (let i = 0; i < NIFTY50_SYMBOLS.length; i += concurrency) {
        const batch = NIFTY50_SYMBOLS.slice(i, i + concurrency);
        await Promise.all(batch.map((symbol) => runSymbol(symbol)));
    }

    breakoutRows.sort((a, b) => b.vs_high_915 - a.vs_high_915);
    breakdownRows.sort((a, b) => a.vs_low_930 - b.vs_low_930);

    return res.json({
        isAfterScanTime: true,
        isPastSession,
        selectedDate,
        todayIST,
        breakoutRows,
        breakdownRows,
        errorRows,
        totalSymbols: NIFTY50_SYMBOLS.length,
    });
});

/**
 * NIFTY index options (nearest / chosen expiry): ATM ± wings, CE & PE quotes,
 * simple directional bias from spot vs 09:15 5m bar or % change → Buy/Sell/Wait hints.
 */
app.get('/api/scan/nifty-option-bias', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({ error: 'Missing access token' });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }

    const headers = {
        'X-Kite-Version': '3',
        Authorization: `token ${API_KEY}:${accessToken}`,
    };

    const todayIST = istDateString();
    const wingsRaw = parseInt(String(req.query.wings ?? '5'), 10);
    const wings = Number.isFinite(wingsRaw)
        ? Math.min(12, Math.max(1, wingsRaw))
        : 5;
    const expiryOverride = normalizeCalendarYmd(
        typeof req.query.expiry === 'string' ? req.query.expiry : ''
    );

    let byExpiry;
    try {
        byExpiry = await loadNiftyNfoOptionIndex();
    } catch (e) {
        console.error(e.response?.data || e.message);
        return res.status(502).json({
            error: 'Failed to load instruments',
            detail: e.message,
        });
    }

    let availableExpiries = [...byExpiry.keys()]
        .filter((k) => k >= todayIST)
        .sort()
        .slice(0, 20);

    const expiry = pickExpiry(byExpiry, expiryOverride || '', todayIST);
    if (!expiry) {
        return res.status(502).json({ error: 'No NIFTY option expiries in index' });
    }
    if (!availableExpiries.includes(expiry)) {
        availableExpiries = [...availableExpiries, expiry].sort().slice(0, 20);
    }

    const strikeMap = byExpiry.get(expiry);
    if (!strikeMap?.size) {
        return res.status(502).json({ error: 'Empty strike map for expiry' });
    }

    const idxKey = 'NSE:NIFTY 50';
    let quoteIdx;
    try {
        const quoteRes = await axios.get(
            `https://api.kite.trade/quote?i=${encodeURIComponent(idxKey)}`,
            { headers }
        );
        quoteIdx = quoteRes.data?.data?.[idxKey];
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 502).json(
            error.response?.data || { error: error.message }
        );
    }

    const niftyLtp = parseFloat(quoteIdx?.last_price ?? NaN);
    const niftyCh = parseFloat(
        quoteIdx?.change ?? quoteIdx?.net_change ?? NaN
    );
    const indexToken = quoteIdx?.instrument_token;

    if (!Number.isFinite(niftyLtp)) {
        return res.status(502).json({ error: 'NIFTY 50 LTP unavailable' });
    }

    const prevClose =
        Number.isFinite(niftyCh) && Number.isFinite(niftyLtp)
            ? niftyLtp - niftyCh
            : niftyLtp;
    const changePct =
        prevClose !== 0 && Number.isFinite(prevClose) && Number.isFinite(niftyCh)
            ? (niftyCh / prevClose) * 100
            : null;

    const atm = Math.round(niftyLtp / 50) * 50;
    const strikes = strikesWindow(strikeMap, atm, wings);

    let bias = 'neutral';
    let biasDetail = '';

    if (indexToken != null && indexToken !== '') {
        try {
            const candles = await fetchKite5MinuteCandlesForDay(
                accessToken,
                indexToken,
                todayIST
            );
            const bar915 = get5MinuteBarAt(candles, '09:15:00');
            if (bar915) {
                if (niftyLtp > bar915.high) {
                    bias = 'bullish';
                    biasDetail = 'Spot above first 5m (09:15) high.';
                } else if (niftyLtp < bar915.low) {
                    bias = 'bearish';
                    biasDetail = 'Spot below first 5m (09:15) low.';
                } else {
                    bias = 'neutral';
                    biasDetail = 'Spot inside first 5m (09:15) range — either side possible.';
                }
            }
        } catch (_) {
            /* fall through to % change */
        }
    }

    if (!biasDetail) {
        if (changePct != null && changePct > 0.05) {
            bias = 'bullish';
            biasDetail = 'Index up vs prev. close (5m context unavailable).';
        } else if (changePct != null && changePct < -0.05) {
            bias = 'bearish';
            biasDetail = 'Index down vs prev. close (5m context unavailable).';
        } else {
            bias = 'neutral';
            biasDetail =
                changePct != null
                    ? 'Flat vs prev. close — watch both call and put sides.'
                    : 'Bias neutral — watch both sides.';
        }
    }

    if (!strikes.length) {
        return res.json({
            expiry,
            availableExpiries,
            todayIST,
            niftyLtp,
            niftyChange: Number.isFinite(niftyCh) ? niftyCh : null,
            changePct,
            atm,
            bias,
            biasDetail,
            calls: [],
            puts: [],
        });
    }

    const instKeys = [];
    for (const s of strikes) {
        const c = strikeMap.get(s);
        instKeys.push(`NFO:${c.ce.tradingsymbol}`);
        instKeys.push(`NFO:${c.pe.tradingsymbol}`);
    }
    const qUrl = `https://api.kite.trade/quote?${instKeys
        .map((k) => `i=${encodeURIComponent(k)}`)
        .join('&')}`;

    let qd = {};
    try {
        const oq = await axios.get(qUrl, { headers });
        qd = oq.data?.data ?? {};
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 502).json(
            error.response?.data || { error: error.message }
        );
    }

    function optRow(side, strike, instr, o) {
        const lp = parseFloat(o?.last_price ?? NaN);
        const oi = parseFloat(o?.oi ?? NaN);
        const vol = parseFloat(o?.volume ?? NaN);
        let indicator = 'Wait';
        let indicatorSide = 'neutral';
        if (side === 'call') {
            if (bias === 'bullish') {
                indicator = 'Buy';
                indicatorSide = 'buy';
            } else if (bias === 'bearish') {
                indicator = 'Sell';
                indicatorSide = 'sell';
            }
        } else {
            if (bias === 'bearish') {
                indicator = 'Buy';
                indicatorSide = 'buy';
            } else if (bias === 'bullish') {
                indicator = 'Sell';
                indicatorSide = 'sell';
            }
        }
        return {
            strike,
            tradingsymbol: instr.tradingsymbol,
            ltp: Number.isFinite(lp) ? lp : null,
            oi: Number.isFinite(oi) ? oi : null,
            volume: Number.isFinite(vol) ? vol : null,
            indicator,
            indicatorSide,
        };
    }

    const calls = [];
    const puts = [];
    for (const s of strikes) {
        const c = strikeMap.get(s);
        const ck = `NFO:${c.ce.tradingsymbol}`;
        const pk = `NFO:${c.pe.tradingsymbol}`;
        calls.push(optRow('call', s, c.ce, qd[ck]));
        puts.push(optRow('put', s, c.pe, qd[pk]));
    }

    return res.json({
        expiry,
        availableExpiries,
        todayIST,
        niftyLtp,
        niftyChange: Number.isFinite(niftyCh) ? niftyCh : null,
        changePct,
        atm,
        bias,
        biasDetail,
        calls,
        puts,
    });
});

// Step 1: Get login URL
app.get('/login', (req, res) => {
    const loginUrl = `https://kite.trade/connect/login?api_key=${process.env.API_KEY}&v=3`;
    res.json({ url: loginUrl });
});


// Step 2: Handle callback (exchange request_token)
app.get('/callback', async (req, res) => {
    const request_token = req.query.request_token;

    const apiKey = process.env.API_KEY.trim();
    const apiSecret = process.env.API_SECRET.trim();

    const checksum = crypto
        .createHash('sha256')
        .update(apiKey + request_token + apiSecret)
        .digest('hex');

    try {
        const response = await axios.post(
            'https://api.kite.trade/session/token',
            qs.stringify({
                api_key: apiKey,
                request_token: request_token,
                checksum: checksum
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const data = response.data;

        res.json({
            access_token: data.data.access_token,
            user: data.data
        });

    } catch (error) {
        console.error(error.response?.data);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});


app.get('/check-env', (req, res) => {
    res.json({
        api_key: process.env.API_KEY,
        api_secret: process.env.API_SECRET,
        length: process.env.API_KEY?.length,
        api_secret_length: process.env.API_SECRET?.length
    });
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Market scanner: GET /api/market/nifty50-scanner');
});