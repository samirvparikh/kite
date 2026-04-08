import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import API from "../services/api";
import { parseDashDate, useAppShell } from "../context/AppShellContext";
import "./Nifty921.css";
import "./OptionBias.css";

type OptRow = {
  strike: number;
  tradingsymbol: string;
  ltp: number | null;
  oi: number | null;
  volume: number | null;
  indicator: string;
  indicatorSide: string;
};

type ScanPayload = {
  expiry: string;
  availableExpiries?: string[];
  todayIST: string;
  niftyLtp: number;
  niftyChange: number | null;
  changePct: number | null;
  atm: number;
  bias: string;
  biasDetail: string;
  calls: OptRow[];
  puts: OptRow[];
};

function formatAmount(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

function formatInt(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? String(Math.round(n)) : "—";
}

const REFRESH_INTERVALS = [0, 5, 8, 12, 30] as const;
const DEFAULT_REFRESH_SEC = 8;

function parseRefreshSec(raw: string | null): number {
  const n = parseInt(raw ?? "", 10);
  if (n === 0) return 0;
  if ((REFRESH_INTERVALS as readonly number[]).includes(n)) return n;
  return DEFAULT_REFRESH_SEC;
}

const OptionBias: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setScanDate } = useAppShell();

  const wingsParam = parseInt(searchParams.get("wings") ?? "5", 10);
  const wings = Number.isFinite(wingsParam)
    ? Math.min(12, Math.max(1, wingsParam))
    : 5;
  const expiryParam = searchParams.get("expiry") ?? "";
  const refreshSec = parseRefreshSec(searchParams.get("refresh"));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScanPayload | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    const d = parseDashDate(searchParams.get("date"));
    if (d) setScanDate(d);
  }, [searchParams, setScanDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    q.set("wings", String(wings));
    if (expiryParam.trim()) q.set("expiry", expiryParam.trim());
    try {
      const res = await API.get<ScanPayload>(
        `/api/scan/nifty-option-bias?${q.toString()}`
      );
      setData(res.data);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      let msg = "Failed to load option bias";
      if (isAxiosError(err)) {
        const d = err.response?.data;
        if (typeof d === "string") msg = d;
        else if (d && typeof d === "object" && "error" in d) {
          msg = String((d as { error: unknown }).error);
        } else if (err.message) msg = err.message;
      } else if (err instanceof Error) msg = err.message;
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [wings, expiryParam]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshSec <= 0) return;
    const t = window.setInterval(() => void load(), refreshSec * 1000);
    return () => window.clearInterval(t);
  }, [load, refreshSec]);

  function setWings(next: number) {
    const q = new URLSearchParams(searchParams);
    q.set("wings", String(next));
    setSearchParams(q, { replace: true });
  }

  function setExpiry(next: string) {
    const q = new URLSearchParams(searchParams);
    if (next) q.set("expiry", next);
    else q.delete("expiry");
    setSearchParams(q, { replace: true });
  }

  function setRefreshInterval(next: number) {
    const q = new URLSearchParams(searchParams);
    if (next === DEFAULT_REFRESH_SEC) q.delete("refresh");
    else q.set("refresh", String(next));
    setSearchParams(q, { replace: true });
  }

  const expiryOptions = useMemo(() => {
    if (!data?.expiry) return [];
    const s = new Set(data.availableExpiries ?? []);
    s.add(data.expiry);
    return [...s].sort();
  }, [data]);

  const expirySelectValue =
    expiryParam && expiryOptions.includes(expiryParam)
      ? expiryParam
      : data?.expiry ?? "";

  function biasLabel(b: string): string {
    if (b === "bullish") return "Bullish tilt";
    if (b === "bearish") return "Bearish tilt";
    return "Neutral / two-sided";
  }

  function IndicatorBadge({ row }: { row: OptRow }) {
    const c = row.indicatorSide;
    return (
      <span
        className={
          c === "buy"
            ? "ob-ind ob-ind--buy"
            : c === "sell"
              ? "ob-ind ob-ind--sell"
              : "ob-ind ob-ind--wait"
        }
      >
        {row.indicator}
      </span>
    );
  }

  if (loading && !data) {
    return (
      <div className="nifty-page px-4 pb-10 pt-2 md:px-6">
        <div className="nifty-container">
          <p className="nifty-muted">Loading option bias…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`nifty-page px-4 pb-10 pt-2 md:px-6${loading && data ? " ob-page--refreshing" : ""}`}
    >
      <div className="nifty-container">
        <div className="nifty-top">
          <div>
            <h2 style={{ margin: 0 }}>NIFTY options — call / put bias</h2>
            <p className="nifty-muted" style={{ margin: "6px 0 0", maxWidth: 720 }}>
              Live chain around ATM (50-point strikes). Quotes refresh automatically
              on a timer (near real-time polling, not a WebSocket). Bias uses spot vs
              the <strong>09:15</strong> 5m bar when available, else day change vs
              previous close. <strong>Buy / Sell / Wait</strong> is a directional hint
              only (not advice). Markets can move either way — use risk controls.
            </p>
            {lastUpdated ? (
              <p className="ob-live-status nifty-muted" aria-live="polite">
                <span
                  className={
                    refreshSec > 0 ? "ob-live-dot" : "ob-live-dot ob-live-dot--idle"
                  }
                  title={refreshSec > 0 ? "Auto-refresh on" : "Auto-refresh off"}
                />
                Last updated{" "}
                <time dateTime={lastUpdated.toISOString()}>
                  {lastUpdated.toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  })}
                </time>{" "}
                IST
                {refreshSec > 0 ? (
                  <> · Auto-refresh every {refreshSec}s</>
                ) : (
                  <> · Auto-refresh off (use Refresh)</>
                )}
              </p>
            ) : null}
            <div className="nifty-inline-form ob-controls">
              <label>
                Wings{" "}
                <select
                  value={wings}
                  onChange={(e) => setWings(parseInt(e.target.value, 10))}
                  className="ob-select"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <option key={n} value={n}>
                      ±{n} strikes
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Auto-refresh{" "}
                <select
                  value={refreshSec}
                  onChange={(e) =>
                    setRefreshInterval(parseInt(e.target.value, 10))
                  }
                  className="ob-select"
                  title="How often to re-fetch quotes from Kite"
                >
                  <option value={5}>Every 5s</option>
                  <option value={8}>Every 8s (default)</option>
                  <option value={12}>Every 12s</option>
                  <option value={30}>Every 30s</option>
                  <option value={0}>Off</option>
                </select>
              </label>
              {expiryOptions.length > 0 ? (
                <label>
                  Expiry{" "}
                  <select
                    value={expirySelectValue}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="ob-select"
                  >
                    {expiryOptions.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button type="button" className="nifty-btn" onClick={() => void load()}>
                Refresh
              </button>
            </div>
          </div>
          <Link className="nifty-back" to="/dashboard">
            Dashboard
          </Link>
        </div>

        {error && (
          <div className="nifty-card ob-error" role="alert">
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="nifty-card ob-summary">
              <div className="ob-summary-grid">
                <div>
                  <span className="ob-muted">NIFTY 50</span>
                  <strong className="ob-big">{formatAmount(data.niftyLtp)}</strong>
                  {data.changePct != null && (
                    <span
                      className={
                        data.changePct >= 0 ? "nifty-positive" : "nifty-negative"
                      }
                    >
                      {" "}
                      ({data.changePct >= 0 ? "+" : ""}
                      {formatAmount(data.changePct)}%)
                    </span>
                  )}
                </div>
                <div>
                  <span className="ob-muted">Expiry</span>
                  <strong>{data.expiry}</strong>
                </div>
                <div>
                  <span className="ob-muted">ATM strike</span>
                  <strong>{data.atm}</strong>
                </div>
                <div>
                  <span className="ob-muted">Bias</span>
                  <strong className={`ob-bias ob-bias--${data.bias}`}>
                    {biasLabel(data.bias)}
                  </strong>
                  <div className="nifty-muted" style={{ marginTop: 4 }}>
                    {data.biasDetail}
                  </div>
                </div>
              </div>
            </div>

            <div className="ob-tables">
              <div className="nifty-card nifty-card-table">
                <h3 className="nifty-list-heading ob-heading-ce">Calls (CE)</h3>
                <table className="nifty-table ob-table">
                  <thead>
                    <tr>
                      <th>Strike</th>
                      <th>Symbol</th>
                      <th>LTP</th>
                      <th>OI</th>
                      <th>Vol</th>
                      <th>Hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.calls.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No strikes in this window.</td>
                      </tr>
                    ) : (
                      data.calls.map((row) => (
                        <tr key={row.tradingsymbol}>
                          <td>{row.strike}</td>
                          <td className="ob-mono">{row.tradingsymbol}</td>
                          <td>{row.ltp != null ? formatAmount(row.ltp) : "—"}</td>
                          <td>{formatInt(row.oi)}</td>
                          <td>{formatInt(row.volume)}</td>
                          <td>
                            <IndicatorBadge row={row} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="nifty-card nifty-card-table">
                <h3 className="nifty-list-heading ob-heading-pe">Puts (PE)</h3>
                <table className="nifty-table ob-table">
                  <thead>
                    <tr>
                      <th>Strike</th>
                      <th>Symbol</th>
                      <th>LTP</th>
                      <th>OI</th>
                      <th>Vol</th>
                      <th>Hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.puts.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No strikes in this window.</td>
                      </tr>
                    ) : (
                      data.puts.map((row) => (
                        <tr key={row.tradingsymbol}>
                          <td>{row.strike}</td>
                          <td className="ob-mono">{row.tradingsymbol}</td>
                          <td>{row.ltp != null ? formatAmount(row.ltp) : "—"}</td>
                          <td>{formatInt(row.oi)}</td>
                          <td>{formatInt(row.volume)}</td>
                          <td>
                            <IndicatorBadge row={row} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OptionBias;
