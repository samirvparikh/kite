import React, { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import API from "../services/api";
import { parseDashDate, useAppShell } from "../context/AppShellContext";
import "./Nifty921.css";

type ScanRow = {
  symbol: string;
  high_920_range: number;
  low_920_range: number;
  scan_ref: number;
  side: "breakout" | "breakdown";
  diff: number;
  price_source: string;
};

type ErrorRow = { symbol: string; reason: string };

type KiteQuoteEnvelope = {
  data?: Record<string, { last_price?: number | string }>;
};

function formatAmount(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function istToday(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

function normalizePageDate(raw: string | null): string {
  const strict = parseDashDate(raw);
  if (strict) return strict;
  if (!raw?.trim()) return istToday();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
  if (!m) return istToday();
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
}

const Nifty921: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setScanDate } = useAppShell();
  const rawDate = searchParams.get("date");
  const dateParam = rawDate != null && rawDate.trim() !== "" ? normalizePageDate(rawDate) : istToday();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAfterScanTime, setIsAfterScanTime] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dateParam);
  const [todayIST, setTodayIST] = useState(istToday());
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [errorRows, setErrorRows] = useState<ErrorRow[]>([]);
  const [totalSymbols, setTotalSymbols] = useState(50);
  const [liveLtp, setLiveLtp] = useState<Record<string, number>>({});

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
    if (searchParams.get("date")) return;
    setSearchParams({ date: dateParam }, { replace: true });
  }, [searchParams, setSearchParams, dateParam]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLiveLtp({});

    const q = new URLSearchParams();
    q.set("date", dateParam);

    API.get<{
      isAfterScanTime: boolean;
      selectedDate: string;
      todayIST: string;
      scanRows: ScanRow[];
      errorRows: ErrorRow[];
      totalSymbols?: number;
    }>(`/api/scan/nifty50-920-breakout?${q.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setIsAfterScanTime(res.data.isAfterScanTime);
        setSelectedDate(res.data.selectedDate);
        setTodayIST(res.data.todayIST);
        setScanRows(res.data.scanRows ?? []);
        setErrorRows(res.data.errorRows ?? []);
        if (typeof res.data.totalSymbols === "number") {
          setTotalSymbols(res.data.totalSymbols);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        let msg = "Failed to load scan";
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
  }, [dateParam]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const d = String(fd.get("date") ?? "").trim();
    if (d) setSearchParams({ date: d });
  }

  const breakoutRows = useMemo(
    () =>
      scanRows
        .filter((r) => r.side === "breakout")
        .sort((a, b) => b.diff - a.diff),
    [scanRows]
  );
  const breakdownRows = useMemo(
    () =>
      scanRows
        .filter((r) => r.side === "breakdown")
        .sort((a, b) => a.diff - b.diff),
    [scanRows]
  );

  const listSymbolKey = useMemo(() => {
    const set = new Set<string>();
    for (const r of scanRows) set.add(r.symbol);
    return [...set].sort().join(",");
  }, [scanRows]);

  useEffect(() => {
    if (loading || !listSymbolKey) return;
    const symbols = listSymbolKey.split(",").filter(Boolean);
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
        /* keep last known LTP */
      }
    }

    void fetchQuotes();
    const timer = window.setInterval(fetchQuotes, 4000);
    const onVis = () => {
      if (!document.hidden) void fetchQuotes();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [listSymbolKey, loading]);

  function displayLtp(symbol: string, fallback: number): string {
    const live = liveLtp[symbol];
    if (live != null && Number.isFinite(live)) return formatAmount(live);
    return formatAmount(fallback);
  }

  if (loading) {
    return (
      <div className="nifty-page px-4 pb-10 pt-2 md:px-6">
        <div className="nifty-container mx-auto max-w-[1100px]">
          <p className="nifty-muted">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nifty-page px-4 pb-10 pt-2 md:px-6">
      <div className="nifty-container mx-auto max-w-[1100px]">
        <div className="nifty-top">
          <div>
            <h2 style={{ margin: 0 }}>
              NIFTY 50 · 09:15 to 09:20 High/Low Breakout
            </h2>
            <div className="nifty-muted">
              Date: {selectedDate} | Run after 09:21 AM IST (09:20 candle complete)
            </div>
            <form className="nifty-inline-form" onSubmit={onSubmit}>
              <label htmlFor="nifty-date">Scan date:</label>
              <input
                type="date"
                id="nifty-date"
                name="date"
                defaultValue={selectedDate}
                key={selectedDate}
              />
              <button type="submit" className="nifty-btn">
                Run Scan
              </button>
            </form>
          </div>
          <Link
            className="nifty-back"
            to={`/dashboard?date=${encodeURIComponent(selectedDate)}`}
          >
            Back to Dashboard
          </Link>
        </div>

        {error && (
          <div
            className="nifty-card"
            style={{
              background: "#fef2f2",
              borderColor: "#fecaca",
              color: "#991b1b",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {!isAfterScanTime ? (
          <div className="nifty-card nifty-warning">
            Scan is available after <strong>09:21 AM IST</strong> for today&apos;s
            date ({todayIST}).
          </div>
        ) : (
          <>
            <div className="nifty-card">
              <strong>Breakout:</strong> {breakoutRows.length} / {totalSymbols} ·{" "}
              <strong>Breakdown:</strong> {breakdownRows.length} / {totalSymbols}
            </div>

            <div className="nifty-card nifty-card-table">
              <h3 className="nifty-list-heading nifty-list-heading--breakout">
                Breakout List
              </h3>
              <table className="nifty-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>High (09:15-09:20)</th>
                    <th>Low (09:15-09:20)</th>
                    <th>Scan Ref.</th>
                    <th>Type</th>
                    <th>Diff</th>
                    <th>LTP</th>
                  </tr>
                </thead>
                <tbody>
                  {breakoutRows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        No stocks above 09:15-09:20 high.
                      </td>
                    </tr>
                  ) : (
                    breakoutRows.map((row) => (
                      <tr key={row.symbol}>
                        <td>
                          <Link
                            className="nifty-symbol-link"
                            to={`/chart?exchange=NSE&symbol=${encodeURIComponent(row.symbol)}&date=${encodeURIComponent(selectedDate)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {row.symbol}
                          </Link>
                        </td>
                        <td>{formatAmount(row.high_920_range)}</td>
                        <td>{formatAmount(row.low_920_range)}</td>
                        <td>
                          {formatAmount(row.scan_ref)}
                          <span className="nifty-muted" style={{ marginLeft: 6 }}>
                            ({row.price_source === "ltp" ? "LTP" : "last min close"})
                          </span>
                        </td>
                        <td className="nifty-positive">Breakout</td>
                        <td
                          className={row.diff >= 0 ? "nifty-positive" : ""}
                          style={
                            row.diff < 0
                              ? { color: "#b91c1c", fontWeight: 600 }
                              : undefined
                          }
                        >
                          {formatAmount(row.diff)}
                        </td>
                        <td className="nifty-ltp-live">
                          {displayLtp(row.symbol, row.scan_ref)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="nifty-card nifty-card-table">
              <h3 className="nifty-list-heading nifty-list-heading--breakdown">
                Breakdown List
              </h3>
              <table className="nifty-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>High (09:15-09:20)</th>
                    <th>Low (09:15-09:20)</th>
                    <th>Scan Ref.</th>
                    <th>Type</th>
                    <th>Diff</th>
                    <th>LTP</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        No stocks below 09:15-09:20 low.
                      </td>
                    </tr>
                  ) : (
                    breakdownRows.map((row) => (
                      <tr key={row.symbol}>
                        <td>
                          <Link
                            className="nifty-symbol-link"
                            to={`/chart?exchange=NSE&symbol=${encodeURIComponent(row.symbol)}&date=${encodeURIComponent(selectedDate)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {row.symbol}
                          </Link>
                        </td>
                        <td>{formatAmount(row.high_920_range)}</td>
                        <td>{formatAmount(row.low_920_range)}</td>
                        <td>
                          {formatAmount(row.scan_ref)}
                          <span className="nifty-muted" style={{ marginLeft: 6 }}>
                            ({row.price_source === "ltp" ? "LTP" : "last min close"})
                          </span>
                        </td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>
                          Breakdown
                        </td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>
                          {formatAmount(row.diff)}
                        </td>
                        <td className="nifty-ltp-live">
                          {displayLtp(row.symbol, row.scan_ref)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {errorRows.length > 0 && (
              <div className="nifty-card nifty-card-table">
                <div className="nifty-muted" style={{ marginBottom: 8 }}>
                  Skipped/Errors ({errorRows.length})
                </div>
                <table className="nifty-table">
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
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Nifty921;
