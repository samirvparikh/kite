import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import API from "../services/api";
import { parseDashDate, useAppShell } from "../context/AppShellContext";
import "./Nifty921.css";

type ScanRow = {
  symbol: string;
  high_915: number;
  low_930: number;
  latest_price: number;
  price_source: string;
  vs_high_915?: number;
  vs_low_930?: number;
};

type ErrorRow = { symbol: string; reason: string };

function formatAmount(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function istToday(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

/** Align URL/query dates with server (pad YYYY-M-D). */
function normalizePageDate(raw: string | null): string {
  const strict = parseDashDate(raw);
  if (strict) return strict;
  if (!raw?.trim()) return istToday();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
  if (!m) return istToday();
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
}

const Breakout930: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setScanDate, scanDate } = useAppShell();
  const rawDate = searchParams.get("date");
  const dateParam =
    rawDate != null && rawDate.trim() !== ""
      ? normalizePageDate(rawDate)
      : scanDate;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAfterScanTime, setIsAfterScanTime] = useState(false);
  const [isFutureDate, setIsFutureDate] = useState(false);
  const [isPastSession, setIsPastSession] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dateParam);
  const [todayIST, setTodayIST] = useState(istToday());
  const [breakoutRows, setBreakoutRows] = useState<ScanRow[]>([]);
  const [breakdownRows, setBreakdownRows] = useState<ScanRow[]>([]);
  const [errorRows, setErrorRows] = useState<ErrorRow[]>([]);
  const [totalSymbols, setTotalSymbols] = useState(50);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  /** Keep shell scan date aligned with ?date= (including padded past dates). */
  useEffect(() => {
    setScanDate(normalizePageDate(searchParams.get("date")));
  }, [searchParams, setScanDate]);

  /** Ensure ?date= is present so the API always receives the chosen session. */
  useEffect(() => {
    if (searchParams.get("date")) return;
    setSearchParams({ date: scanDate }, { replace: true });
  }, [searchParams, scanDate, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const q = new URLSearchParams();
    q.set("date", dateParam);

    API.get<{
      isAfterScanTime: boolean;
      isFutureDate?: boolean;
      isPastSession?: boolean;
      selectedDate: string;
      todayIST: string;
      breakoutRows: ScanRow[];
      breakdownRows: ScanRow[];
      errorRows: ErrorRow[];
      totalSymbols?: number;
    }>(`/api/scan/nifty50-930-breakout?${q.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setIsAfterScanTime(res.data.isAfterScanTime);
        setIsFutureDate(Boolean(res.data.isFutureDate));
        setIsPastSession(res.data.selectedDate < res.data.todayIST);
        setSelectedDate(res.data.selectedDate);
        setTodayIST(res.data.todayIST);
        setBreakoutRows(res.data.breakoutRows ?? []);
        setBreakdownRows(res.data.breakdownRows ?? []);
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
            <h2 style={{ margin: 0 }}>9:30 breakout (NIFTY 50)</h2>
            <div className="nifty-muted">
              5-min bars: high of the <strong>09:15</strong> candle, low of the{" "}
              <strong>09:30</strong> candle. Breakout if price &gt; 09:15 high;
              breakdown if price &lt; 09:30 low. Today uses live{" "}
              <strong>LTP</strong>; past sessions use the <strong>last 5-min
              close</strong> of that day as the reference price.
            </div>
            <div className="nifty-muted">
              Date: {selectedDate} | Today (IST): {todayIST}
              {isPastSession
                ? " — historical session: lists use last 5-min close vs levels."
                : " — for today, run after 09:35 AM IST so the 09:30 5-min bar is complete."}
            </div>
            <form className="nifty-inline-form" onSubmit={onSubmit}>
              <label htmlFor="b930-date">Scan date:</label>
              <input
                type="date"
                id="b930-date"
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
            {isFutureDate ? (
              <>
                <strong>Future date:</strong> pick today or a past market day
                (IST).
              </>
            ) : (
              <>
                For <strong>today</strong> ({todayIST}), the scan runs after{" "}
                <strong>09:35 AM IST</strong> once the 09:30 5-minute candle has
                finished. Choose a <strong>past date</strong> to load breakout /
                breakdown lists anytime.
              </>
            )}
          </div>
        ) : (
          <>
            <div className="nifty-card">
              <strong>Breakout</strong> (LTP &gt; 09:15 high):{" "}
              {breakoutRows.length} / {totalSymbols} · <strong>Breakdown</strong>{" "}
              (LTP &lt; 09:30 low): {breakdownRows.length} / {totalSymbols}
            </div>

            <div className="nifty-card nifty-card-table">
              <h3 className="nifty-muted" style={{ margin: "0 0 8px" }}>
                Breakout list
              </h3>
              <table className="nifty-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>High 09:15</th>
                    <th>Low 09:30</th>
                    <th>LTP / ref</th>
                    <th>vs 09:15 high</th>
                  </tr>
                </thead>
                <tbody>
                  {breakoutRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No stocks above the 09:15 high.</td>
                    </tr>
                  ) : (
                    breakoutRows.map((row) => (
                      <tr key={`b-${row.symbol}`}>
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
                        <td>{formatAmount(row.high_915)}</td>
                        <td>{formatAmount(row.low_930)}</td>
                        <td>
                          {formatAmount(row.latest_price)}
                          <span className="nifty-muted" style={{ marginLeft: 6 }}>
                            ({row.price_source === "ltp" ? "LTP" : "last 5m close"})
                          </span>
                        </td>
                        <td className="nifty-positive">
                          +{formatAmount(row.vs_high_915 ?? 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="nifty-card nifty-card-table">
              <h3 className="nifty-muted" style={{ margin: "0 0 8px" }}>
                Breakdown list
              </h3>
              <table className="nifty-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>High 09:15</th>
                    <th>Low 09:30</th>
                    <th>LTP / ref</th>
                    <th>vs 09:30 low</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No stocks below the 09:30 low.</td>
                    </tr>
                  ) : (
                    breakdownRows.map((row) => (
                      <tr key={`d-${row.symbol}`}>
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
                        <td>{formatAmount(row.high_915)}</td>
                        <td>{formatAmount(row.low_930)}</td>
                        <td>
                          {formatAmount(row.latest_price)}
                          <span className="nifty-muted" style={{ marginLeft: 6 }}>
                            ({row.price_source === "ltp" ? "LTP" : "last 5m close"})
                          </span>
                        </td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>
                          {formatAmount(row.vs_low_930 ?? 0)}
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
                  Skipped / errors ({errorRows.length})
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

export default Breakout930;
