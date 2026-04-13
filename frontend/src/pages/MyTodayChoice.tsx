import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import API from "../services/api";
import { parseDashDate, useAppShell } from "../context/AppShellContext";
import CenteredLoader from "../components/CenteredLoader";
import "./Scanner.css";

type PickRow = {
  symbol: string;
  exchange: string;
  first_5m_high?: number;
  first_5m_low?: number;
  scan_ref?: number;
  diff?: number;
  change_pct?: number;
  side?: "breakout" | "breakdown";
};

function fmt(v: unknown): string {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n.toFixed(2) : "-";
}

function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const MyTodayChoice: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setScanDate } = useAppShell();
  const date = searchParams.get("date") ?? istToday();
  const universe = searchParams.get("universe") ?? "nifty50";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PickRow[]>([]);
  const [placing, setPlacing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    const d = parseDashDate(searchParams.get("date"));
    if (d) setScanDate(d);
  }, [searchParams, setScanDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    q.set("date", date);
    q.set("type", "5min-breakout");
    q.set("universe", universe);
    API.get<{ breakoutRows?: PickRow[]; stockRows?: PickRow[] }>(
      `/api/market/nifty50-scanner?${q.toString()}`
    )
      .then((res) => {
        if (cancelled) return;
        const bo =
          res.data.breakoutRows ??
          (res.data.stockRows ?? []).filter((r) => r.side === "breakout");
        setRows(bo);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        let msg = "Failed to load picks";
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
  }, [date, universe]);

  function setUniverse(next: "nifty50" | "top-volume" | "all") {
    const q = new URLSearchParams(searchParams);
    q.set("universe", next);
    setSearchParams(q, { replace: true });
  }

  const top3 = useMemo(() => {
    const scored = rows
      .map((r) => {
        const ref = r.first_5m_high ?? 0;
        const scan = r.scan_ref ?? 0;
        const rf = ref > 0 ? ((scan - ref) / ref) * 100 : -999;
        return { ...r, r_factor: rf };
      })
      .filter((r) => Number.isFinite(r.r_factor))
      .sort(
        (a, b) =>
          b.r_factor - a.r_factor || (b.change_pct ?? 0) - (a.change_pct ?? 0)
      );
    return scored.slice(0, 3);
  }, [rows]);

  async function placeBuy(row: PickRow) {
    const qtyRaw = window.prompt(`Quantity for ${row.symbol}`, "1");
    if (!qtyRaw) return;
    const qty = parseInt(qtyRaw, 10);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const ok = window.confirm(
      `Place MARKET BUY order?\n${row.symbol} x ${qty} (NSE, MIS)`
    );
    if (!ok) return;
    setPlacing((p) => ({ ...p, [row.symbol]: true }));
    try {
      await API.post("/api/kite/orders", {
        tradingsymbol: row.symbol,
        exchange: "NSE",
        quantity: qty,
        transaction_type: "BUY",
      });
      window.alert(`Order placed: BUY ${row.symbol} x ${qty}`);
    } catch (err: unknown) {
      let msg = "Order failed";
      if (isAxiosError(err)) {
        const d = err.response?.data;
        if (typeof d === "string") msg = d;
        else if (d && typeof d === "object" && "message" in d) {
          msg = String((d as { message: unknown }).message);
        } else if (err.message) msg = err.message;
      }
      window.alert(msg);
    } finally {
      setPlacing((p) => ({ ...p, [row.symbol]: false }));
    }
  }

  if (loading) return <CenteredLoader label="Loading today choices…" />;

  return (
    <div className="scanner-page px-4 pb-10 pt-2 md:px-6">
      <div className="scanner-container mx-auto max-w-[1100px]">
        <div className="scanner-top">
          <div>
            <h2 style={{ margin: "0 0 4px" }}>My Today Choice</h2>
            <div className="scanner-muted">
              Top 3 bullish picks from breakout scan · Date: <strong>{date}</strong>
            </div>
            <div className="scanner-muted" style={{ marginTop: 8 }}>
              Universe{" "}
              <select
                value={universe}
                onChange={(e) =>
                  setUniverse(
                    e.target.value === "all"
                      ? "all"
                      : e.target.value === "top-volume"
                        ? "top-volume"
                        : "nifty50"
                  )
                }
                className="scanner-select"
                style={{ marginLeft: 6 }}
              >
                <option value="nifty50">NIFTY50 (fast)</option>
                <option value="top-volume">Top Volume</option>
                <option value="all">All NSE EQ</option>
              </select>
            </div>
          </div>
          <Link className="scanner-back" to={`/dashboard?date=${encodeURIComponent(date)}`}>
            Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="scanner-card" style={{ color: "#991b1b", borderColor: "#fecaca", background: "#fef2f2" }}>
            {error}
          </div>
        )}

        <div className="scanner-card">
          <table>
            <thead>
              <tr>
                <th>LTP</th>
                <th>Symbol</th>
                <th>Entry</th>
                <th>Stop Loss</th>
                <th>Target</th>
                <th>R Factor %</th>
                <th>%chng</th>
                <th>Buy</th>
              </tr>
            </thead>
            <tbody>
              {top3.length === 0 ? (
                <tr>
                  <td colSpan={8}>No strong picks found for selected date.</td>
                </tr>
              ) : (
                top3.map((r) => {
                  const entry = r.scan_ref ?? 0;
                  const sl = r.first_5m_low ?? 0;
                  const risk = Math.max(0, entry - sl);
                  const target = entry + risk * 2;
                  const rf =
                    (r.first_5m_high ?? 0) > 0
                      ? (((r.scan_ref ?? 0) - (r.first_5m_high ?? 0)) /
                          (r.first_5m_high ?? 1)) *
                        100
                      : 0;
                  return (
                    <tr key={r.symbol}>
                      <td>{fmt(r.scan_ref ?? r.last_price)}</td>
                      <td>
                        <Link
                          className="scanner-symbol-link"
                          to={`/chart?exchange=NSE&symbol=${encodeURIComponent(r.symbol)}&date=${encodeURIComponent(date)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {r.symbol}
                        </Link>
                      </td>
                      <td>{fmt(entry)}</td>
                      <td>{fmt(sl)}</td>
                      <td>{fmt(target)}</td>
                      <td className={rf >= 0 ? "scanner-positive" : "scanner-negative"}>
                        {fmt(rf)}%
                      </td>
                      <td className={(r.change_pct ?? 0) >= 0 ? "scanner-positive" : "scanner-negative"}>
                        {fmt(r.change_pct)}%
                      </td>
                      <td>
                        <button
                          type="button"
                          className="nifty-btn"
                          onClick={() => void placeBuy(r)}
                          disabled={Boolean(placing[r.symbol])}
                        >
                          {placing[r.symbol] ? "Placing..." : "Buy"}
                        </button>
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

export default MyTodayChoice;
