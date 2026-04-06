import React, { useEffect, useState } from "react";
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
};

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

  const pageTitle = TITLES[type] ?? "Scanner";
  const isSector = type === "sector";

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

  const emptyColSpan = isSector ? 3 : 5;

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
            </div>
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
              {isSector ? (
                <tr>
                  <th>Sector</th>
                  <th>No. of Stocks</th>
                  <th>Avg Change %</th>
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
              {isSector ? (
                sectorRows.length === 0 ? (
                  <tr>
                    <td colSpan={emptyColSpan}>No data available.</td>
                  </tr>
                ) : (
                  sectorRows.map((row) => {
                    const c = row.change_pct;
                    return (
                      <tr key={row.name}>
                        <td>{row.name}</td>
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
              ) : stockRows.length === 0 ? (
                <tr>
                  <td colSpan={emptyColSpan}>No data available.</td>
                </tr>
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
