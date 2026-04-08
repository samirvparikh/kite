import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import API from "../services/api";
import { parseDashDate, useAppShell } from "../context/AppShellContext";
import "./Scanner.css";

const TITLES: Record<string, string> = {
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
};

type KiteQuoteEnvelope = {
  data?: Record<string, { last_price?: number | string }>;
};

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

function apiTypeParam(pageType: string): string {
  if (pageType === "sector") return "sector";
  if (pageType === "5min-breakout") return "5min-breakout";
  if (pageType === "top-losers") return "top-losers";
  return "top-gainers";
}

const Scanner: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setScanDate } = useAppShell();
  const type = searchParams.get("type") ?? "sector";
  const date = searchParams.get("date") ?? istToday();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectorRows, setSectorRows] = useState<SectorRow[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [source, setSource] = useState<string>("");
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [liveLtp, setLiveLtp] = useState<Record<string, number>>({});

  const pageTitle = TITLES[type] ?? "Scanner";
  const isSector = type === "sector";
  const is5minBreakout = type === "5min-breakout";

  const sectorStockRows = useMemo(() => {
    if (!selectedSector) return [];
    return stockRows
      .filter((r) => r.sector === selectedSector)
      .sort((a, b) => b.change_pct - a.change_pct);
  }, [stockRows, selectedSector]);

  const breakoutSymbolKey = useMemo(() => {
    if (!is5minBreakout) return "";
    const syms = [...new Set(stockRows.map((r) => r.symbol))].sort();
    return syms.join(",");
  }, [is5minBreakout, stockRows]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const d = parseDashDate(searchParams.get("date"));
    if (d) setScanDate(d);
  }, [searchParams, setScanDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLiveLtp({});

    const q = new URLSearchParams();
    q.set("date", date);
    q.set("type", apiTypeParam(type));

    API.get<{
      date: string;
      source?: string;
      sectorRows?: SectorRow[];
      stockRows?: StockRow[];
    }>(`/api/market/nifty50-scanner?${q.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setSource(res.data.source ?? "");
        setSectorRows(res.data.sectorRows ?? []);
        setStockRows(res.data.stockRows ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        let msg = "Failed to load scanner";
        if (isAxiosError(err)) {
          const d = err.response?.data;
          if (typeof d === "string") msg = d;
          else if (d && typeof d === "object" && "message" in d) {
            msg = String((d as { message: unknown }).message);
          } else if (err.message) msg = err.message;
        } else if (err instanceof Error) msg = err.message;
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [type, date]);

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

  if (loading) {
    return (
      <div className="scanner-page px-4 pb-10 pt-2 md:px-6">
        <div className="scanner-container mx-auto max-w-[1100px]">
          <p className="scanner-muted">Loading…</p>
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
                  · Source: <strong>{source}</strong> (NIFTY 50 market via Kite)
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
                NIFTY 50 names where price, after the <strong>09:15</strong>{" "}
                (first) 5-minute candle, has traded{" "}
                <strong>above that candle&apos;s high</strong> and{" "}
                <strong>below its low</strong> (both sides broken).{" "}
                <strong>LTP</strong> in the last column updates live from Kite,
                like 9:30 Breakout; other columns use the scan snapshot.
              </p>
            ) : null}
          </div>
          <Link
            className="scanner-back"
            to={`/dashboard?date=${encodeURIComponent(date)}`}
          >
            Back to Dashboard
          </Link>
        </div>

        {error && (
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

        <div className="scanner-card">
          <table>
            <thead>
              {isSector && !selectedSector ? (
                <tr>
                  <th>Sector</th>
                  <th>No. of Stocks</th>
                  <th>Avg Change %</th>
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
              ) : is5minBreakout ? (
                <tr>
                  <th>Symbol</th>
                  <th>Exchange</th>
                  <th>Last / Close</th>
                  <th>Change %</th>
                  <th>Net Chg ₹</th>
                  <th>LTP</th>
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
                sectorRows.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No data available.</td>
                  </tr>
                ) : (
                  sectorRows.map((row) => {
                    const c = row.change_pct;
                    return (
                      <tr
                        key={row.name}
                        className="scanner-sector-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedSector(row.name)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedSector(row.name);
                          }
                        }}
                      >
                        <td>
                          <span className="scanner-sector-name">{row.name}</span>
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
                  <td colSpan={is5minBreakout ? 6 : 5}>No data available.</td>
                </tr>
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
      </div>
    </div>
  );
};

export default Scanner;
