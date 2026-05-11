import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import API from "../services/api";
import { parseDashDate, useAppShell } from "../context/AppShellContext";
import CenteredLoader from "../components/CenteredLoader";
import {
  getApiErrorMessage,
  isKiteOrBrokerSessionError,
} from "../utils/apiError";
import "./Scanner.css";

const TITLES: Record<string, string> = {
  "my-today-fno": "My Today F&O",
  "fno-stocks": "List F&O Stock",
  sector: "Sector View",
  "5min-breakout": "5 Min Breakout",
  "top-gainers": "Top Gainers",
  "top-losers": "Top Losers",
};

function istToday(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

type SectorRow = {
  name: string;
  stocks: number;
  change_pct: number;
};

type StockRow = {
  symbol: string;
  exchange: string;
  last_price: number;
  change_pct: number;
  change_rs: number;
  sector?: string;
  first_5m_high?: number;
  first_5m_low?: number;
  prev_close?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume_shares?: number | null;
  value_lakhs?: number | null;
  scan_ref?: number;
  diff?: number;
  side?: "breakout" | "breakdown";
  oi_change_pct?: number;
  oi_start?: number;
  oi_end?: number;
  ref_price_925?: number;
  fut_tradingsymbol?: string;
};

type KiteQuoteEnvelope = {
  data?: Record<string, { last_price?: number | string }>;
};

type BreakSortCol =
  | "symbol"
  | "first_5m_high"
  | "first_5m_low"
  | "prev_close"
  | "open"
  | "high"
  | "low"
  | "volume_shares"
  | "value_lakhs"
  | "scan_ref"
  | "change_pct"
  | "diff"
  | "ltp";
type SortDir = "asc" | "desc";
type BreakSortState = { col: BreakSortCol; dir: SortDir };
type SectorSortCol = "name" | "stocks" | "change_pct";
type SectorSortState = { col: SectorSortCol; dir: SortDir };
type StockSortCol =
  | "symbol"
  | "exchange"
  | "last_price"
  | "change_pct"
  | "change_rs"
  | "oi_change_pct";
type StockSortState = { col: StockSortCol; dir: SortDir };

function normalizeBreakRow(raw: StockRow): StockRow {
  const r = raw as StockRow & {
    high_915?: number;
    low_930?: number;
    latest_price?: number;
    scan_ref?: number;
    diff?: number;
    side?: "breakout" | "breakdown";
  };
  const last = Number.isFinite(r.last_price) ? r.last_price : Number(r.latest_price ?? 0);
  const chRs = Number.isFinite(r.change_rs)
    ? r.change_rs
    : Number.isFinite(last) && Number.isFinite(r.change_pct)
      ? (last * r.change_pct) / 100
      : 0;
  const prevClose =
    r.prev_close != null
      ? r.prev_close
      : Number.isFinite(last) && Number.isFinite(chRs)
        ? last - chRs
        : null;
  return {
    ...r,
    symbol: r.symbol ?? "",
    exchange: r.exchange ?? "NSE",
    last_price: Number.isFinite(last) ? last : 0,
    change_pct: Number.isFinite(r.change_pct) ? r.change_pct : 0,
    change_rs: Number.isFinite(chRs) ? chRs : 0,
    first_5m_high:
      r.first_5m_high ??
      (Number.isFinite(r.high_915) ? Number(r.high_915) : undefined),
    first_5m_low:
      r.first_5m_low ??
      (Number.isFinite(r.low_930) ? Number(r.low_930) : undefined),
    prev_close: prevClose,
    scan_ref:
      r.scan_ref ??
      (Number.isFinite(last) ? last : Number.isFinite(r.latest_price) ? Number(r.latest_price) : undefined),
    diff:
      r.diff ??
      (r.side === "breakdown"
        ? ((r.scan_ref ?? last) - (r.first_5m_low ?? r.low_930 ?? 0))
        : ((r.scan_ref ?? last) - (r.first_5m_high ?? r.high_915 ?? 0))),
  };
}

function normSectorName(v: unknown): string {
  return String(v ?? "").trim();
}

/** Reference price = previous close; R Factor % = (Current − Reference) / Reference × 100 */
function rFactorPct(row: StockRow): number | null {
  const last = row.last_price;
  const ch = row.change_rs;
  if (!Number.isFinite(last) || !Number.isFinite(ch)) return null;
  const ref = last - ch;
  if (!Number.isFinite(ref) || ref === 0) return null;
  return (ch / ref) * 100;
}

function formatAmount(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/** Aligns URL `type` with comparisons (handles spaces / casing). */
function normalizeScannerTypeParam(raw: string | null): string {
  const s = (raw ?? "fno-stocks").trim().toLowerCase();
  return s || "fno-stocks";
}

function apiTypeParam(pageType: string): string {
  const t = pageType.trim().toLowerCase();
  if (t === "fno-stocks") return "fno-stocks";
  if (t === "sector") return "sector";
  if (t === "5min-breakout") return "5min-breakout";
  if (t === "top-losers") return "top-losers";
  if (t === "top-gainers") return "top-gainers";
  if (t === "my-today-fno") return "my-today-fno";
  return "top-gainers";
}

const Scanner: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setScanDate, setKiteApiErrorMessage } = useAppShell();
  const isPublicPage = location.pathname.startsWith("/scanners/");
  const type = normalizeScannerTypeParam(searchParams.get("type"));
  const date = searchParams.get("date") ?? istToday();
  const universeMode = searchParams.get("universe") ?? "top-volume";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectorRows, setSectorRows] = useState<SectorRow[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [breakoutRows, setBreakoutRows] = useState<StockRow[]>([]);
  const [breakdownRows, setBreakdownRows] = useState<StockRow[]>([]);
  const [errorRows, setErrorRows] = useState<Array<{ symbol: string; reason: string }>>([]);
  const [source, setSource] = useState<string>("");
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [liveLtp, setLiveLtp] = useState<Record<string, number>>({});
  /** Bump to re-fetch scanner API without changing URL (5 Min Breakout Refresh). */
  const [reloadNonce, setReloadNonce] = useState(0);
  const [myTodayFnoScanNonce, setMyTodayFnoScanNonce] = useState(0);
  const [myTodayFnoMeta, setMyTodayFnoMeta] = useState<{
    totalScanned?: number;
    window?: string;
    thresholds?: { minAbsChangePct: number; minAbsOiChangePct: number };
  } | null>(null);
  const [sectorSort, setSectorSort] = useState<SectorSortState>({
    col: "change_pct",
    dir: "desc",
  });
  const [breakoutSort, setBreakoutSort] = useState<BreakSortState>({
    col: "diff",
    dir: "desc",
  });
  const [breakdownSort, setBreakdownSort] = useState<BreakSortState>({
    col: "diff",
    dir: "asc",
  });
  const [stockSort, setStockSort] = useState<StockSortState>({
    col: "change_pct",
    dir: "desc",
  });

  const pageTitle = TITLES[type] ?? "Scanner";
  const isSector = type === "sector";
  const is5minBreakout = type === "5min-breakout";
  const isMyTodayFno = type === "my-today-fno";

  useEffect(() => {
    setMyTodayFnoScanNonce(0);
  }, [date, type]);

  useLayoutEffect(() => {
    if (isMyTodayFno && myTodayFnoScanNonce === 0) {
      setLoading(false);
    }
  }, [isMyTodayFno, myTodayFnoScanNonce]);

  function sortedBreakRows(rows: StockRow[], sort: BreakSortState): StockRow[] {
    const mul = sort.dir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sort.col) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "first_5m_high":
          cmp = (a.first_5m_high ?? 0) - (b.first_5m_high ?? 0);
          break;
        case "first_5m_low":
          cmp = (a.first_5m_low ?? 0) - (b.first_5m_low ?? 0);
          break;
        case "prev_close":
          cmp = (a.prev_close ?? 0) - (b.prev_close ?? 0);
          break;
        case "open":
          cmp = (a.open ?? 0) - (b.open ?? 0);
          break;
        case "high":
          cmp = (a.high ?? 0) - (b.high ?? 0);
          break;
        case "low":
          cmp = (a.low ?? 0) - (b.low ?? 0);
          break;
        case "volume_shares":
          cmp = (a.volume_shares ?? 0) - (b.volume_shares ?? 0);
          break;
        case "value_lakhs":
          cmp = (a.value_lakhs ?? 0) - (b.value_lakhs ?? 0);
          break;
        case "scan_ref":
          cmp = (a.scan_ref ?? a.last_price) - (b.scan_ref ?? b.last_price);
          break;
        case "change_pct":
          cmp = a.change_pct - b.change_pct;
          break;
        case "diff":
          cmp = (a.diff ?? 0) - (b.diff ?? 0);
          break;
        case "ltp": {
          const la = liveLtp[a.symbol] ?? a.scan_ref ?? a.last_price;
          const lb = liveLtp[b.symbol] ?? b.scan_ref ?? b.last_price;
          cmp = la - lb;
          break;
        }
        default:
          cmp = 0;
      }
      if (cmp !== 0) return cmp * mul;
      return a.symbol.localeCompare(b.symbol);
    });
    return copy;
  }

  const sortedBreakoutRows = useMemo(
    () => sortedBreakRows(breakoutRows, breakoutSort),
    [breakoutRows, breakoutSort, liveLtp]
  );
  const sortedBreakdownRows = useMemo(
    () => sortedBreakRows(breakdownRows, breakdownSort),
    [breakdownRows, breakdownSort, liveLtp]
  );

  function toggleBreakoutSort(col: BreakSortCol) {
    setBreakoutSort((s) =>
      s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }
    );
  }
  function toggleBreakdownSort(col: BreakSortCol) {
    setBreakdownSort((s) =>
      s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }
    );
  }

  function SortTh({
    column,
    label,
    sort,
    onSort,
  }: {
    column: BreakSortCol;
    label: string;
    sort: BreakSortState;
    onSort: (c: BreakSortCol) => void;
  }) {
    const active = sort.col === column;
    return (
      <th>
        <button
          type="button"
          onClick={() => onSort(column)}
          style={{ border: 0, background: "transparent", padding: 0, font: "inherit", cursor: "pointer" }}
        >
          {label}
          {active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
        </button>
      </th>
    );
  }

  const sectorStockRows = useMemo(() => {
    if (!selectedSector) return [];
    const key = normSectorName(selectedSector).toLowerCase();
    return stockRows
      .filter((r) => normSectorName(r.sector).toLowerCase() === key)
      .sort((a, b) => b.change_pct - a.change_pct);
  }, [stockRows, selectedSector]);

  const effectiveSectorRows = useMemo(() => {
    if (sectorRows.length > 0) return sectorRows;
    const by = new Map<string, { sum: number; n: number }>();
    for (const r of stockRows) {
      const sector = normSectorName(r.sector) || "Others";
      const g = by.get(sector) ?? { sum: 0, n: 0 };
      g.sum += Number.isFinite(r.change_pct) ? r.change_pct : 0;
      g.n += 1;
      by.set(sector, g);
    }
    return [...by.entries()]
      .map(([name, g]) => ({
        name,
        stocks: g.n,
        change_pct: g.n > 0 ? g.sum / g.n : 0,
      }))
      .sort((a, b) => b.change_pct - a.change_pct);
  }, [sectorRows, stockRows]);

  const sortedSectorRows = useMemo(() => {
    const mul = sectorSort.dir === "asc" ? 1 : -1;
    const copy = [...effectiveSectorRows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sectorSort.col === "name") cmp = a.name.localeCompare(b.name);
      else if (sectorSort.col === "stocks") cmp = a.stocks - b.stocks;
      else cmp = a.change_pct - b.change_pct;
      if (cmp !== 0) return cmp * mul;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [effectiveSectorRows, sectorSort]);

  function toggleSectorSort(col: SectorSortCol) {
    setSectorSort((s) =>
      s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }
    );
  }

  function toggleStockSort(col: StockSortCol) {
    setStockSort((s) =>
      s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }
    );
  }

  const sortedStockRows = useMemo(() => {
    const mul = stockSort.dir === "asc" ? 1 : -1;
    const copy = [...stockRows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (stockSort.col === "symbol") {
        cmp = a.symbol.localeCompare(b.symbol);
      } else if (stockSort.col === "exchange") {
        cmp = a.exchange.localeCompare(b.exchange);
      } else if (stockSort.col === "last_price") {
        cmp = a.last_price - b.last_price;
      } else if (stockSort.col === "change_pct") {
        cmp = a.change_pct - b.change_pct;
      } else if (stockSort.col === "oi_change_pct") {
        cmp = (a.oi_change_pct ?? 0) - (b.oi_change_pct ?? 0);
      } else {
        cmp = a.change_rs - b.change_rs;
      }
      if (cmp !== 0) return cmp * mul;
      return a.symbol.localeCompare(b.symbol);
    });
    return copy;
  }, [stockRows, stockSort]);

  const breakoutSymbolKey = useMemo(() => {
    if (!is5minBreakout) return "";
    const syms = [
      ...new Set(
        [...breakoutRows, ...breakdownRows, ...stockRows].map((r) => r.symbol)
      ),
    ].sort();
    return syms.join(",");
  }, [is5minBreakout, breakoutRows, breakdownRows, stockRows]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token && !isPublicPage) {
      navigate("/login", { replace: true });
    }
  }, [isPublicPage, navigate]);

  useEffect(() => {
    const d = parseDashDate(searchParams.get("date"));
    if (d) setScanDate(d);
  }, [searchParams, setScanDate]);

  /** Surface Kite API errors in header only (see Header + AppShellContext). */
  useEffect(() => {
    if (error && isKiteOrBrokerSessionError(error)) {
      setKiteApiErrorMessage(error);
    } else {
      setKiteApiErrorMessage(null);
    }
    return () => setKiteApiErrorMessage(null);
  }, [error, setKiteApiErrorMessage]);

  useEffect(() => {
    let cancelled = false;

    if (type === "my-today-fno") {
      if (myTodayFnoScanNonce === 0) {
        setLoading(false);
        setError(null);
        setSectorRows([]);
        setStockRows([]);
        setBreakoutRows([]);
        setBreakdownRows([]);
        setErrorRows([]);
        setSource("");
        setMyTodayFnoMeta(null);
        setLiveLtp({});
        return () => {
          cancelled = true;
        };
      }

      setLoading(true);
      setError(null);
      setLiveLtp({});

      API.get<{
        date: string;
        source?: string;
        stockRows?: StockRow[];
        rows?: StockRow[];
        errorRows?: Array<{ symbol: string; reason: string }>;
        totalScanned?: number;
        window?: string;
        thresholds?: { minAbsChangePct: number; minAbsOiChangePct: number };
      }>(`/api/market/my-today-fno-scan?date=${encodeURIComponent(date)}`)
        .then((res) => {
          if (cancelled) return;
          const raw = res.data.stockRows ?? res.data.rows ?? [];
          const rows = raw.map(normalizeBreakRow);
          setSource(res.data.source ?? "");
          setSectorRows([]);
          setStockRows(rows);
          setBreakoutRows([]);
          setBreakdownRows([]);
          setErrorRows(res.data.errorRows ?? []);
          setMyTodayFnoMeta({
            totalScanned: res.data.totalScanned,
            window: res.data.window,
            thresholds: res.data.thresholds,
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(getApiErrorMessage(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    setLiveLtp({});
    setMyTodayFnoMeta(null);

    const q = new URLSearchParams();
    q.set("date", date);
    if (type !== "fno-stocks") {
      q.set("type", apiTypeParam(type));
    }
    if (type === "5min-breakout") q.set("universe", universeMode);
    const endpoint =
      type === "fno-stocks"
        ? `/api/market/fno-stocks?${q.toString()}`
        : `/api/market/nifty50-scanner?${q.toString()}`;

    API.get<{
      date: string;
      source?: string;
      sectorRows?: SectorRow[];
      stockRows?: StockRow[];
      breakoutRows?: StockRow[];
      breakdownRows?: StockRow[];
      errorRows?: Array<{ symbol: string; reason: string }>;
      universeMode?: string;
      totalSymbols?: number;
    }>(endpoint)
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data.stockRows ?? []).map(normalizeBreakRow);
        const bo = (res.data.breakoutRows ?? rows.filter((r) => r.side === "breakout")).map(
          normalizeBreakRow
        );
        const bd = (
          res.data.breakdownRows ?? rows.filter((r) => r.side === "breakdown")
        ).map(normalizeBreakRow);
        const fallbackBothSides =
          bo.length === 0 && bd.length === 0 && rows.length > 0
            ? rows
            : [];
        setSource(res.data.source ?? "");
        setSectorRows(res.data.sectorRows ?? []);
        setStockRows(rows);
        setBreakoutRows(bo.length > 0 ? bo : fallbackBothSides);
        setBreakdownRows(bd);
        setErrorRows(res.data.errorRows ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [type, date, universeMode, reloadNonce, myTodayFnoScanNonce]);

  function setUniverseMode(next: "all" | "top-volume") {
    const q = new URLSearchParams(searchParams);
    q.set("universe", next);
    setSearchParams(q, { replace: true });
  }

  useEffect(() => {
    setSelectedSector(null);
  }, [type, date]);

  /** Live LTP for 5 Min Breakout list (Kite quote poll). */
  useEffect(() => {
    if (loading || !is5minBreakout || !breakoutSymbolKey) return;
    const symbols = breakoutSymbolKey.split(",").filter(Boolean);
    if (symbols.length === 0) return;

    let cancelled = false;

    async function fetchQuotes() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const qs = symbols
          .map((s) => `i=${encodeURIComponent(`NSE:${s}`)}`)
          .join("&");
        const res = await API.get<KiteQuoteEnvelope>(`/api/kite/quote?${qs}`);
        if (cancelled) return;
        const data = res.data?.data ?? {};
        const next: Record<string, number> = {};
        for (const sym of symbols) {
          const row = data[`NSE:${sym}`];
          const lp = parseFloat(String(row?.last_price ?? ""));
          if (Number.isFinite(lp)) next[sym] = lp;
        }
        if (Object.keys(next).length > 0) {
          setLiveLtp((prev) => ({ ...prev, ...next }));
        }
      } catch {
        /* keep last LTP */
      }
    }

    void fetchQuotes();
    const intervalMs = 4000;
    const timer = window.setInterval(fetchQuotes, intervalMs);
    const onVis = () => {
      if (!document.hidden) void fetchQuotes();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [breakoutSymbolKey, loading, is5minBreakout]);

  function displayBreakoutLtp(symbol: string, scanPrice: number): string {
    const live = liveLtp[symbol];
    if (live != null && Number.isFinite(live)) return formatAmount(live);
    return formatAmount(scanPrice);
  }

  if (loading && !(isMyTodayFno && myTodayFnoScanNonce === 0)) {
    return (
      <div className="scanner-page px-4 pb-10 pt-2 md:px-6">
        <div className="scanner-container mx-auto max-w-[1100px]">
          <CenteredLoader label="Loading…" />
        </div>
      </div>
    );
  }

  return (
    <div className="scanner-page px-4 pb-10 pt-2 md:px-6">
      <div className="scanner-container mx-auto max-w-[1100px]">
        <div className="scanner-top">
          <div>
            <h2 style={{ margin: "0 0 4px" }}>{pageTitle}</h2>
            <div className="scanner-muted">
              Date: <strong>{date}</strong>
              {source ? (
                <>
                  {" "}
                  · Source: <strong>{source}</strong>
                  {isMyTodayFno ? (
                    <>
                      {" "}
                      · Window:{" "}
                      <strong>{myTodayFnoMeta?.window ?? "09:15–09:25 IST"}</strong>
                      {myTodayFnoMeta?.thresholds ? (
                        <>
                          {" "}
                          · |Δ price| &gt;{" "}
                          <strong>{myTodayFnoMeta.thresholds.minAbsChangePct}%</strong>, |Δ OI| &gt;{" "}
                          <strong>{myTodayFnoMeta.thresholds.minAbsOiChangePct}%</strong>
                        </>
                      ) : null}
                      {myTodayFnoMeta?.totalScanned != null ? (
                        <>
                          {" "}
                          · Scanned: <strong>{myTodayFnoMeta.totalScanned}</strong> symbols
                        </>
                      ) : null}
                    </>
                  ) : (
                    <> (NIFTY 50 market via Kite)</>
                  )}
                </>
              ) : null}
              {isSector && selectedSector ? (
                <>
                  {" "}
                  · Stocks in <strong>{selectedSector}</strong>
                </>
              ) : null}
            </div>
            {isSector && selectedSector ? (
              <button
                type="button"
                className="scanner-sector-back"
                onClick={() => setSelectedSector(null)}
              >
                ← All sectors
              </button>
            ) : null}
            {is5minBreakout ? (
              <p className="scanner-muted" style={{ margin: "8px 0 0", maxWidth: 720 }}>
                NSE equity universe where <strong>first 5-minute candle (09:15)</strong>{" "}
                high/low is broken. Lists are separated into <strong>Breakout</strong>{" "}
                and <strong>Breakdown</strong>. <strong>LTP</strong> updates live.
              </p>
            ) : null}
            {is5minBreakout ? (
              <div
                className="scanner-muted"
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>
                  Universe{" "}
                  <select
                    value={universeMode === "top" ? "top-volume" : universeMode}
                    onChange={(e) =>
                      setUniverseMode(
                        e.target.value === "top-volume" ? "top-volume" : "all"
                      )
                    }
                    className="scanner-select"
                    style={{ marginLeft: 6 }}
                  >
                    <option value="all">All NSE EQ</option>
                    <option value="top-volume">Top Volume (fast)</option>
                  </select>
                </span>
                <button
                  type="button"
                  className="scanner-refresh-btn"
                  onClick={() => setReloadNonce((n) => n + 1)}
                >
                  Refresh
                </button>
              </div>
            ) : null}
            {isMyTodayFno ? (
              <p className="scanner-muted" style={{ margin: "8px 0 0", maxWidth: 760 }}>
                Listed <strong>F&amp;O underlyings</strong> only. Metrics use{" "}
                <strong>09:15–09:25 IST</strong> 5-minute candles: cash price vs{" "}
                <strong>previous close</strong>, and OI on the <strong>nearest expiry future</strong>.
                A row appears only if <strong>|Δ price vs prev. close| &gt; 2%</strong> and{" "}
                <strong>|Δ OI in window| &gt; 7%</strong>. Pick any past session date—data comes from Kite
                historical candles. Use <strong>Run Scan</strong> to load; <strong>Refresh</strong> repeats the
                same date.
              </p>
            ) : null}
            {isMyTodayFno ? (
              <div
                className="scanner-muted"
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>
                  Scan date:{" "}
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      const q = new URLSearchParams(searchParams);
                      q.set("date", e.target.value || istToday());
                      setSearchParams(q, { replace: true });
                    }}
                    className="scanner-select"
                    style={{ marginLeft: 6, minWidth: 150 }}
                  />
                </span>
                <button
                  type="button"
                  className="scanner-refresh-btn"
                  onClick={() => setMyTodayFnoScanNonce((n) => n + 1)}
                >
                  Run Scan
                </button>
                <button
                  type="button"
                  className="scanner-refresh-btn"
                  title="Fetch again for the same date"
                  disabled={myTodayFnoScanNonce === 0}
                  onClick={() => setReloadNonce((n) => n + 1)}
                >
                  Refresh
                </button>
              </div>
            ) : null}
            {type === "fno-stocks" ? (
              <div
                className="scanner-muted"
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>
                  Scan date:{" "}
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      const q = new URLSearchParams(searchParams);
                      q.set("date", e.target.value || istToday());
                      setSearchParams(q, { replace: true });
                    }}
                    className="scanner-select"
                    style={{ marginLeft: 6, minWidth: 150 }}
                  />
                </span>
                <button
                  type="button"
                  className="scanner-refresh-btn"
                  onClick={() => setReloadNonce((n) => n + 1)}
                >
                  Refresh
                </button>
              </div>
            ) : null}
          </div>
          <Link
            className="scanner-back"
            to={
              isPublicPage
                ? "/#scanners"
                : `/dashboard?date=${encodeURIComponent(date)}`
            }
          >
            {isPublicPage ? "Back to Home" : "Back to Dashboard"}
          </Link>
        </div>

        {error && !isKiteOrBrokerSessionError(error) && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: "12px 16px",
              borderRadius: 8,
              marginBottom: 16,
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {is5minBreakout ? (
          <>
            <div className="scanner-card" style={{ marginBottom: 16 }}>
              <strong>Breakout:</strong> {breakoutRows.length} · <strong>Breakdown:</strong>{" "}
              {breakdownRows.length}
            </div>
            <div className="scanner-card" style={{ marginBottom: 16 }}>
              <h3 className="scanner-list-heading scanner-list-heading--breakout">
                Breakout list
              </h3>
              <table>
                <thead>
                  <tr>
                    <SortTh column="symbol" label="Symbol" sort={breakoutSort} onSort={toggleBreakoutSort} />
                    <SortTh column="first_5m_high" label="1st 5m High" sort={breakoutSort} onSort={toggleBreakoutSort} />
                    <SortTh column="first_5m_low" label="1st 5m Low" sort={breakoutSort} onSort={toggleBreakoutSort} />
                    <SortTh column="volume_shares" label="Volume (Shares)" sort={breakoutSort} onSort={toggleBreakoutSort} />
                    <SortTh column="value_lakhs" label="Value (₹ Lakhs)" sort={breakoutSort} onSort={toggleBreakoutSort} />
                    <SortTh column="scan_ref" label="Scan Ref." sort={breakoutSort} onSort={toggleBreakoutSort} />
                    <SortTh column="change_pct" label="%chng" sort={breakoutSort} onSort={toggleBreakoutSort} />
                    <SortTh column="diff" label="Diff" sort={breakoutSort} onSort={toggleBreakoutSort} />
                    <SortTh column="ltp" label="LTP" sort={breakoutSort} onSort={toggleBreakoutSort} />
                  </tr>
                </thead>
                <tbody>
                  {breakoutRows.length === 0 ? (
                    <tr>
                      <td colSpan={13}>No breakout stocks.</td>
                    </tr>
                  ) : (
                    sortedBreakoutRows.map((row) => (
                      <tr key={`bo-${row.symbol}`}>
                        <td>
                          <Link
                            className="scanner-symbol-link"
                            to={`/chart?exchange=${encodeURIComponent(row.exchange)}&symbol=${encodeURIComponent(row.symbol)}&date=${encodeURIComponent(date)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {row.symbol}
                          </Link>
                        </td>
                        <td>{formatAmount(row.first_5m_high)}</td>
                        <td>{formatAmount(row.first_5m_low)}</td>
                        <td>{row.volume_shares == null ? "-" : Math.round(row.volume_shares).toLocaleString("en-IN")}</td>
                        <td>{row.value_lakhs == null ? "-" : formatAmount(row.value_lakhs)}</td>
                        <td>{formatAmount(row.scan_ref ?? row.last_price)}</td>
                        <td className={(row.change_pct ?? 0) >= 0 ? "scanner-positive" : "scanner-negative"}>
                          {formatAmount(row.change_pct)}%
                        </td>
                        <td className={(row.diff ?? 0) >= 0 ? "scanner-positive" : "scanner-negative"}>
                          {formatAmount(row.diff ?? 0)}
                        </td>
                        <td className="scanner-ltp-live">
                          Rs {displayBreakoutLtp(row.symbol, row.scan_ref ?? row.last_price)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="scanner-card">
              <h3 className="scanner-list-heading scanner-list-heading--breakdown">
                Breakdown list
              </h3>
              <table>
                <thead>
                  <tr>
                    <SortTh column="symbol" label="Symbol" sort={breakdownSort} onSort={toggleBreakdownSort} />
                    <SortTh column="first_5m_high" label="1st 5m High" sort={breakdownSort} onSort={toggleBreakdownSort} />
                    <SortTh column="first_5m_low" label="1st 5m Low" sort={breakdownSort} onSort={toggleBreakdownSort} />
                    <SortTh column="volume_shares" label="Volume (Shares)" sort={breakdownSort} onSort={toggleBreakdownSort} />
                    <SortTh column="value_lakhs" label="Value (₹ Lakhs)" sort={breakdownSort} onSort={toggleBreakdownSort} />
                    <SortTh column="scan_ref" label="Scan Ref." sort={breakdownSort} onSort={toggleBreakdownSort} />
                    <SortTh column="change_pct" label="%chng" sort={breakdownSort} onSort={toggleBreakdownSort} />
                    <SortTh column="diff" label="Diff" sort={breakdownSort} onSort={toggleBreakdownSort} />
                    <SortTh column="ltp" label="LTP" sort={breakdownSort} onSort={toggleBreakdownSort} />
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.length === 0 ? (
                    <tr>
                      <td colSpan={13}>No breakdown stocks.</td>
                    </tr>
                  ) : (
                    sortedBreakdownRows.map((row) => (
                      <tr key={`bd-${row.symbol}`}>
                        <td>
                          <Link
                            className="scanner-symbol-link"
                            to={`/chart?exchange=${encodeURIComponent(row.exchange)}&symbol=${encodeURIComponent(row.symbol)}&date=${encodeURIComponent(date)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {row.symbol}
                          </Link>
                        </td>
                        <td>{formatAmount(row.first_5m_high)}</td>
                        <td>{formatAmount(row.first_5m_low)}</td>
                        <td>{row.volume_shares == null ? "-" : Math.round(row.volume_shares).toLocaleString("en-IN")}</td>
                        <td>{row.value_lakhs == null ? "-" : formatAmount(row.value_lakhs)}</td>
                        <td>{formatAmount(row.scan_ref ?? row.last_price)}</td>
                        <td className={(row.change_pct ?? 0) >= 0 ? "scanner-positive" : "scanner-negative"}>
                          {formatAmount(row.change_pct)}%
                        </td>
                        <td className={(row.diff ?? 0) >= 0 ? "scanner-positive" : "scanner-negative"}>
                          {formatAmount(row.diff ?? 0)}
                        </td>
                        <td className="scanner-ltp-live">
                          Rs {displayBreakoutLtp(row.symbol, row.scan_ref ?? row.last_price)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {errorRows.length > 0 ? (
              <div className="scanner-card" style={{ marginTop: 16 }}>
                <div className="scanner-muted" style={{ marginBottom: 8 }}>
                  Skipped / errors ({errorRows.length})
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.map((er, i) => (
                      <tr key={`${er.symbol}-${i}-${er.reason}`}>
                        <td>{er.symbol}</td>
                        <td>{er.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : (
        <>
        <div className="scanner-card">
          <table>
            <thead>
              {isSector && !selectedSector ? (
                <tr>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleSectorSort("name")}>
                      Sector{sectorSort.col === "name" ? (sectorSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleSectorSort("stocks")}>
                      No. of Stocks{sectorSort.col === "stocks" ? (sectorSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleSectorSort("change_pct")}>
                      Avg Change %{sectorSort.col === "change_pct" ? (sectorSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                </tr>
              ) : isSector && selectedSector ? (
                <tr>
                  <th>Symbol</th>
                  <th>Exchange</th>
                  <th>Last / Close</th>
                  <th>Change %</th>
                  <th>Net Chg ₹</th>
                  <th>R. Factor %</th>
                </tr>
              ) : isMyTodayFno ? (
                <tr>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleStockSort("symbol")}>
                      Symbol{stockSort.col === "symbol" ? (stockSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>Prev close</th>
                  <th title="Cash: close of last 5m bar in 09:15–09:25">Ref (window)</th>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleStockSort("change_pct")}>
                      Δ % vs prev.{stockSort.col === "change_pct" ? (stockSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleStockSort("change_rs")}>
                      Net Chg ₹{stockSort.col === "change_rs" ? (stockSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>OI start</th>
                  <th>OI end</th>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleStockSort("oi_change_pct")}>
                      OI Δ %{stockSort.col === "oi_change_pct" ? (stockSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                </tr>
              ) : is5minBreakout ? (
                <tr>
                  <th>Symbol</th>
                  <th>Exchange</th>
                  <th>Last / Close</th>
                  <th>Change %</th>
                  <th>Net Chg ₹</th>
                  <th>LTP</th>
                </tr>
              ) : type === "fno-stocks" ? (
                <tr>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleStockSort("symbol")}>
                      Symbol{stockSort.col === "symbol" ? (stockSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleStockSort("last_price")}>
                      LTP{stockSort.col === "last_price" ? (stockSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleStockSort("change_pct")}>
                      %Change{stockSort.col === "change_pct" ? (stockSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scanner-th-sort" onClick={() => toggleStockSort("oi_change_pct")}>
                      %Change in OI{stockSort.col === "oi_change_pct" ? (stockSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                </tr>
              ) : (
                <tr>
                  <th>Symbol</th>
                  <th>Exchange</th>
                  <th>Last / Close</th>
                  <th>Change %</th>
                  <th>Net Chg ₹</th>
                </tr>
              )}
            </thead>
            <tbody>
              {isSector && !selectedSector ? (
                effectiveSectorRows.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No data available.</td>
                  </tr>
                ) : (
                  sortedSectorRows.map((row) => {
                    const c = row.change_pct;
                    const sectorName = normSectorName(row.name);
                    return (
                      <tr
                        key={sectorName}
                        className="scanner-sector-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedSector(sectorName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedSector(sectorName);
                          }
                        }}
                      >
                        <td>
                          <span className="scanner-sector-name">{sectorName}</span>
                          <span className="scanner-sector-hint">View stocks</span>
                        </td>
                        <td>{row.stocks}</td>
                        <td
                          className={
                            c >= 0 ? "scanner-positive" : "scanner-negative"
                          }
                        >
                          {formatAmount(c)}%
                        </td>
                      </tr>
                    );
                  })
                )
              ) : isSector && selectedSector ? (
                sectorStockRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No stocks in this sector.</td>
                  </tr>
                ) : (
                  sectorStockRows.map((row) => {
                    const ch = row.change_pct;
                    const rs = row.change_rs;
                    const rf = rFactorPct(row);
                    return (
                      <tr key={`${row.exchange}-${row.symbol}`}>
                        <td>
                          <Link
                            className="scanner-symbol-link"
                            to={`/chart?exchange=${encodeURIComponent(row.exchange)}&symbol=${encodeURIComponent(row.symbol)}&date=${encodeURIComponent(date)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {row.symbol}
                          </Link>
                        </td>
                        <td>{row.exchange}</td>
                        <td>Rs {formatAmount(row.last_price)}</td>
                        <td
                          className={
                            ch >= 0 ? "scanner-positive" : "scanner-negative"
                          }
                        >
                          {formatAmount(ch)}%
                        </td>
                        <td
                          className={
                            rs >= 0 ? "scanner-positive" : "scanner-negative"
                          }
                        >
                          Rs {formatAmount(rs)}
                        </td>
                        <td
                          className={
                            rf == null
                              ? ""
                              : rf >= 0
                                ? "scanner-positive"
                                : "scanner-negative"
                          }
                          title="(Last − Reference close) ÷ Reference close × 100"
                        >
                          {rf == null ? "—" : `${formatAmount(rf)}%`}
                        </td>
                      </tr>
                    );
                  })
                )
              ) : stockRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      is5minBreakout ? 6 : isMyTodayFno ? 8 : type === "fno-stocks" ? 4 : 5
                    }
                  >
                    {isMyTodayFno && myTodayFnoScanNonce === 0
                      ? "Select scan date and click Run Scan."
                      : isMyTodayFno
                        ? "No stocks matched both filters for this session."
                        : type === "fno-stocks"
                          ? "No F&O equities in this list — connect Zerodha and refresh, or pick another date."
                          : "No data available."}
                  </td>
                </tr>
              ) : type === "fno-stocks" ? (
                sortedStockRows.map((row) => {
                  const ch = row.change_pct;
                  const oiCh = row.oi_change_pct;
                  return (
                    <tr key={`fno-${row.exchange}-${row.symbol}`}>
                      <td>
                        <a
                          className="scanner-symbol-link"
                          href={`https://www.nseindia.com/option-chain?symbol=${encodeURIComponent(
                            row.symbol
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.symbol}
                        </a>
                      </td>
                      <td>Rs {formatAmount(row.last_price)}</td>
                      <td className={ch >= 0 ? "scanner-positive" : "scanner-negative"}>
                        {formatAmount(ch)}%
                      </td>
                      <td className={oiCh != null && oiCh >= 0 ? "scanner-positive" : "scanner-negative"}>
                        {oiCh == null ? "-" : `${formatAmount(oiCh)}%`}
                      </td>
                    </tr>
                  );
                })
              ) : isMyTodayFno ? (
                sortedStockRows.map((row) => {
                  const ch = row.change_pct;
                  const rs = row.change_rs;
                  const oiCh = row.oi_change_pct ?? 0;
                  const pref = row.prev_close ?? row.last_price - row.change_rs;
                  return (
                    <tr key={`mtf-${row.exchange}-${row.symbol}`}>
                      <td>
                        <Link
                          className="scanner-symbol-link"
                          to={`/chart?exchange=${encodeURIComponent(row.exchange)}&symbol=${encodeURIComponent(row.symbol)}&date=${encodeURIComponent(date)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.symbol}
                        </Link>
                      </td>
                      <td>Rs {formatAmount(pref)}</td>
                      <td>Rs {formatAmount(row.ref_price_925 ?? row.last_price)}</td>
                      <td
                        className={
                          ch >= 0 ? "scanner-positive" : "scanner-negative"
                        }
                      >
                        {formatAmount(ch)}%
                      </td>
                      <td
                        className={
                          rs >= 0 ? "scanner-positive" : "scanner-negative"
                        }
                      >
                        Rs {formatAmount(rs)}
                      </td>
                      <td>
                        {row.oi_start != null
                          ? Math.round(row.oi_start).toLocaleString("en-IN")
                          : "—"}
                      </td>
                      <td>
                        {row.oi_end != null
                          ? Math.round(row.oi_end).toLocaleString("en-IN")
                          : "—"}
                      </td>
                      <td
                        className={
                          oiCh >= 0 ? "scanner-positive" : "scanner-negative"
                        }
                      >
                        {formatAmount(oiCh)}%
                      </td>
                    </tr>
                  );
                })
              ) : is5minBreakout ? (
                stockRows.map((row) => {
                  const ch = row.change_pct;
                  const rs = row.change_rs;
                  return (
                    <tr key={`${row.exchange}-${row.symbol}`}>
                      <td>
                        <Link
                          className="scanner-symbol-link"
                          to={`/chart?exchange=${encodeURIComponent(row.exchange)}&symbol=${encodeURIComponent(row.symbol)}&date=${encodeURIComponent(date)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.symbol}
                        </Link>
                      </td>
                      <td>{row.exchange}</td>
                      <td>Rs {formatAmount(row.last_price)}</td>
                      <td
                        className={
                          ch >= 0 ? "scanner-positive" : "scanner-negative"
                        }
                      >
                        {formatAmount(ch)}%
                      </td>
                      <td
                        className={
                          rs >= 0 ? "scanner-positive" : "scanner-negative"
                        }
                      >
                        Rs {formatAmount(rs)}
                      </td>
                      <td className="scanner-ltp-live">
                        Rs {displayBreakoutLtp(row.symbol, row.last_price)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                stockRows.map((row) => {
                  const ch = row.change_pct;
                  const rs = row.change_rs;
                  return (
                    <tr key={`${row.exchange}-${row.symbol}`}>
                      <td>
                        <Link
                          className="scanner-symbol-link"
                          to={`/chart?exchange=${encodeURIComponent(row.exchange)}&symbol=${encodeURIComponent(row.symbol)}&date=${encodeURIComponent(date)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.symbol}
                        </Link>
                      </td>
                      <td>{row.exchange}</td>
                      <td>Rs {formatAmount(row.last_price)}</td>
                      <td
                        className={
                          ch >= 0 ? "scanner-positive" : "scanner-negative"
                        }
                      >
                        {formatAmount(ch)}%
                      </td>
                      <td
                        className={
                          rs >= 0 ? "scanner-positive" : "scanner-negative"
                        }
                      >
                        Rs {formatAmount(rs)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {isMyTodayFno && errorRows.length > 0 ? (
          <div className="scanner-card" style={{ marginTop: 16 }}>
            <div className="scanner-muted" style={{ marginBottom: 8 }}>
              Skipped / errors ({errorRows.length})
            </div>
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {errorRows.map((er, i) => (
                  <tr key={`mtf-err-${er.symbol}-${i}-${er.reason}`}>
                    <td>{er.symbol}</td>
                    <td>{er.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        </>
        )}
      </div>
    </div>
  );
};

export default Scanner;
