import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import API from "../services/api";
import { parseDashDate, useAppShell } from "../context/AppShellContext";
import "./Nifty921.css";

type ScanRow = {
  symbol: string;
  close_920: number;
  open_921: number;
  gap: number;
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

const Nifty921: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setScanDate } = useAppShell();
  const dateParam = searchParams.get("date") ?? istToday();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAfterScanTime, setIsAfterScanTime] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dateParam);
  const [todayIST, setTodayIST] = useState(istToday());
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [errorRows, setErrorRows] = useState<ErrorRow[]>([]);
  const [totalSymbols, setTotalSymbols] = useState(50);

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

    const q = new URLSearchParams();
    q.set("date", dateParam);

    API.get<{
      isAfterScanTime: boolean;
      selectedDate: string;
      todayIST: string;
      scanRows: ScanRow[];
      errorRows: ErrorRow[];
      totalSymbols?: number;
    }>(`/api/scan/nifty50-921?${q.toString()}`)
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
              NIFTY 50 Scan - 09:20 Close &gt; 09:21 Open
            </h2>
            <div className="nifty-muted">
              Date: {selectedDate} | Run after 09:21 AM IST
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
              <strong>Matched Stocks:</strong> {scanRows.length} /{" "}
              {totalSymbols}
            </div>

            <div className="nifty-card nifty-card-table">
              <table className="nifty-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>09:20 Close</th>
                    <th>09:21 Open</th>
                    <th>Difference (Close - Open)</th>
                  </tr>
                </thead>
                <tbody>
                  {scanRows.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        No matching stock found for selected date/time
                        condition.
                      </td>
                    </tr>
                  ) : (
                    scanRows.map((row) => (
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
                        <td>{formatAmount(row.close_920)}</td>
                        <td>{formatAmount(row.open_921)}</td>
                        <td className="nifty-positive">
                          {formatAmount(row.gap)}
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
