import React, { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./Chart.css";

function sanitizeExchange(raw: string | null): string {
  if (!raw) return "NSE";
  return raw.replace(/[^A-Z]/gi, "").toUpperCase() || "NSE";
}

function sanitizeSymbol(raw: string | null): string {
  if (!raw) return "";
  return raw.replace(/[^A-Z0-9&.\-]/gi, "").toUpperCase();
}

function loadTradingView(): Promise<void> {
  const w = window as unknown as {
    TradingView?: { widget: new (o: Record<string, unknown>) => unknown };
  };
  if (w.TradingView?.widget) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://s3.tradingview.com/tv.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      if (w.TradingView?.widget) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TradingView script failed"));
    document.body.appendChild(script);
  });
}

const Chart: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  const exchange = sanitizeExchange(searchParams.get("exchange"));
  const symbol = sanitizeSymbol(searchParams.get("symbol"));
  const scanDate =
    searchParams.get("date") ??
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const tvSymbol =
    symbol !== "" ? `${exchange}:${symbol}` : "NSE:NIFTY";

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    cleanupRef.current?.();
    cleanupRef.current = undefined;

    loadTradingView()
      .then(() => {
        if (cancelled) return;
        const el = document.getElementById("tvchart");
        const TV = (
          window as unknown as {
            TradingView?: {
              widget: new (o: Record<string, unknown>) => { remove?: () => void };
            };
          }
        ).TradingView;
        if (!el || !TV?.widget) return;
        el.innerHTML = "";
        // eslint-disable-next-line no-new
        const widget = new TV.widget({
          width: "100%",
          height: 640,
          symbol: tvSymbol,
          interval: "1",
          timezone: "Asia/Kolkata",
          theme: "light",
          style: "1",
          locale: "en",
          toolbar_bg: "#f1f3f6",
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: "tvchart",
        });
        cleanupRef.current = () => {
          if (typeof widget.remove === "function") widget.remove();
          el.innerHTML = "";
        };
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = undefined;
    };
  }, [tvSymbol]);

  return (
    <div className="chart-page min-h-svh bg-slate-50">
      <div className="chart-container">
        <div className="chart-top">
          <div>
            <h2 style={{ margin: "0 0 4px" }}>Chart: {tvSymbol}</h2>
            <div className="chart-muted">
              Scan Date: {scanDate} | Click other symbols from list to switch
              chart
            </div>
          </div>
          <button
            type="button"
            className="chart-back"
            onClick={() =>
              navigate(`/dashboard?date=${encodeURIComponent(scanDate)}`)
            }
          >
            Back to Dashboard
          </button>
        </div>

        <div className="chart-card">
          <div id="tvchart" />
        </div>
      </div>
    </div>
  );
};

export default Chart;
