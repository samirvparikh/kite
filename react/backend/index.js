const express = require("express");
const session = require("express-session");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const ENV_PATH = path.join(__dirname, ".env");
function loadBackendEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.warn(`[kite] Missing .env — create ${ENV_PATH} (see .env.example).`);
    return;
  }
  try {
    const parsed = dotenv.parse(fs.readFileSync(ENV_PATH));
    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] = value;
    }
    const n = Object.keys(parsed).length;
    if (n === 0) {
      console.warn(
        `[kite] ${ENV_PATH} has no KEY=value lines. Save as UTF-8 (not UTF-16).`
      );
    } else {
      console.log(`[kite] Loaded ${n} variable(s) from .env`);
    }
  } catch (err) {
    console.error(`[kite] Could not read .env (${ENV_PATH}):`, err.message);
  }
}
loadBackendEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const API_KEY = String(process.env.API_KEY || "").trim();
const API_SECRET = String(process.env.API_SECRET || "").trim();

app.use(express.json());
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-session-secret",
    resave: false,
    saveUninitialized: false,
  })
);

const nifty50Symbols = [
  "ADANIENT","ADANIPORTS","APOLLOHOSP","ASIANPAINT","AXISBANK","BAJAJ-AUTO","BAJFINANCE","BAJAJFINSV",
  "BEL","BHARTIARTL","CIPLA","COALINDIA","DRREDDY","EICHERMOT","ETERNAL","GRASIM","HCLTECH","HDFCBANK",
  "HDFCLIFE","HEROMOTOCO","HINDALCO","HINDUNILVR","ICICIBANK","INDUSINDBK","INFY","ITC","JIOFIN","JSWSTEEL",
  "KOTAKBANK","LT","M&M","MARUTI","NESTLEIND","NTPC","ONGC","POWERGRID","RELIANCE","SBILIFE","SHRIRAMFIN",
  "SBIN","SUNPHARMA","TATACONSUM","TATAMOTORS","TATASTEEL","TCS","TECHM","TITAN","TRENT","ULTRACEMCO","WIPRO",
];

function getBlockMetrics(candles, fromTime, toTime) {
  let open = null;
  let close = null;
  let high = null;
  let low = null;
  for (const candle of candles) {
    const stamp = candle[0] || "";
    const t = stamp.slice(11, 19);
    if (t >= fromTime && t <= toTime) {
      if (open === null) open = Number(candle[1] || 0);
      close = Number(candle[4] || 0);
      const ch = Number(candle[2] || 0);
      const cl = Number(candle[3] || 0);
      high = high === null ? ch : Math.max(high, ch);
      low = low === null ? cl : Math.min(low, cl);
    }
  }
  if (open === null || close === null || high === null || low === null) return null;
  return { open, close, high, low };
}

async function kiteRequest(req, endpoint, method = "GET", data = undefined) {
  if (!req.session.accessToken) throw new Error("Not authenticated");
  const resp = await axios({
    url: `https://api.kite.trade/${endpoint}`,
    method,
    data,
    headers: {
      "X-Kite-Version": "3",
      Authorization: `token ${API_KEY}:${req.session.accessToken}`,
    },
  });
  return resp.data;
}

app.get("/api/auth/login", (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({
      error:
        "API_KEY is not set. Add API_KEY (and API_SECRET) to backend/.env — copy from .env.example.",
    });
  }
  const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(API_KEY)}`;
  res.json({ loginUrl });
});

app.get("/api/auth/callback", async (req, res) => {
  try {
    if (!API_KEY || !API_SECRET) {
      return res.status(503).json({
        error: "API_KEY and API_SECRET must be set in backend/.env for the OAuth callback.",
      });
    }
    const requestToken = req.query.request_token;
    if (!requestToken) {
      return res.status(400).json({ error: "request_token missing" });
    }
    const checksum = crypto
      .createHash("sha256")
      .update(`${API_KEY}${requestToken}${API_SECRET}`)
      .digest("hex");

    const tokenResp = await axios.post(
      "https://api.kite.trade/session/token",
      new URLSearchParams({
        api_key: API_KEY,
        request_token: requestToken,
        checksum: checksum.toString(),
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    req.session.accessToken = tokenResp.data?.data?.access_token;
    if (!req.session.accessToken) {
      return res.status(400).json({ error: "Unable to create access token", raw: tokenResp.data });
    }
    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    res.status(500).json({ error: "Callback failed", details: error.response?.data || error.message });
  }
});

app.get("/api/auth/status", (req, res) => {
  res.json({ authenticated: Boolean(req.session.accessToken) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const [profile, margins, holdings] = await Promise.all([
      kiteRequest(req, "user/profile"),
      kiteRequest(req, "user/margins"),
      kiteRequest(req, "portfolio/holdings"),
    ]);
    res.json({ profile: profile.data || {}, margins: margins.data || {}, holdings: holdings.data || [] });
  } catch (error) {
    res.status(401).json({ error: "Failed to load dashboard", details: error.response?.data || error.message });
  }
});

app.get("/api/scanner", async (req, res) => {
  const type = req.query.type || "sector";
  if (type === "sector") {
    return res.json({
      title: "Sector View",
      rows: [
        { name: "Banking", stocks: 5, change: 1.45 },
        { name: "IT", stocks: 7, change: -0.84 },
        { name: "Auto", stocks: 4, change: 0.62 },
        { name: "Pharma", stocks: 3, change: 0.23 },
      ],
    });
  }
  try {
    const holdingsResp = await kiteRequest(req, "portfolio/holdings");
    const rows = (holdingsResp.data || []).map((item) => ({
      symbol: item.tradingsymbol,
      exchange: item.exchange,
      last_price: Number(item.last_price || 0),
      change_pct: Number(item.day_change_percentage || 0),
      pnl: Number(item.pnl || 0),
    }));
    if (type === "top-gainers") rows.sort((a, b) => b.change_pct - a.change_pct);
    if (type === "top-losers") rows.sort((a, b) => a.change_pct - b.change_pct);
    if (type === "5min-breakout") rows.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
    res.json({ title: type, rows });
  } catch (error) {
    res.status(401).json({ error: "Failed to load scanner", details: error.response?.data || error.message });
  }
});

app.get("/api/nifty-scan", async (req, res) => {
  try {
    const selectedDate = req.query.date || new Date().toISOString().slice(0, 10);
    const firstTf = Number(req.query.tf || 5);
    const firstFrom = "09:15:00";
    const firstTo = `09:${String(15 + firstTf).padStart(2, "0")}:00`;
    const secondFrom = `09:${String(16 + firstTf).padStart(2, "0")}:00`;
    const secondTo = `09:${String(16 + firstTf + firstTf).padStart(2, "0")}:00`;

    const quoteResp = await kiteRequest(
      req,
      `quote?i=${nifty50Symbols.map((s) => encodeURIComponent(`NSE:${s}`)).join("&i=")}`
    );
    const quoteData = quoteResp.data || {};

    const gainerRows = [];
    const loserRows = [];
    const errorRows = [];
    const from = encodeURIComponent(`${selectedDate} ${firstFrom}`);
    const to = encodeURIComponent(`${selectedDate} ${secondTo}`);

    for (const symbol of nifty50Symbols) {
      const key = `NSE:${symbol}`;
      const token = quoteData[key]?.instrument_token;
      if (!token) {
        errorRows.push({ symbol, reason: "Instrument token not found" });
        continue;
      }
      const history = await kiteRequest(req, `instruments/historical/${token}/minute?from=${from}&to=${to}`);
      const candles = history.data?.candles || [];
      const first = getBlockMetrics(candles, firstFrom, firstTo);
      const second = getBlockMetrics(candles, secondFrom, secondTo);
      if (!first || !second) {
        errorRows.push({ symbol, reason: "Missing candle data" });
        continue;
      }
      if (first.open < first.close && first.close < second.open && second.open < second.close) {
        gainerRows.push({ symbol, first, second, gap: second.close - first.open });
      }
      if (first.open > first.close && first.close > second.open && second.open > second.close) {
        loserRows.push({ symbol, first, second, gap: first.open - second.close });
      }
    }

    gainerRows.sort((a, b) => b.gap - a.gap);
    loserRows.sort((a, b) => b.gap - a.gap);
    res.json({ gainerRows, loserRows, errorRows, selectedDate, firstTf });
  } catch (error) {
    res.status(401).json({ error: "Failed to run nifty scan", details: error.response?.data || error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  if (!API_KEY || !API_SECRET) {
    console.warn(
      "[kite] API_KEY and/or API_SECRET missing — set them in backend/.env (see .env.example)."
    );
  }
});
