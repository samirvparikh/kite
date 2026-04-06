import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export default function ChartPage() {
  const [params] = useSearchParams();
  const exchange = params.get("exchange") || "NSE";
  const symbol = params.get("symbol") || "NIFTY";
  const interval = params.get("interval") || "1";
  const tvSymbol = `${exchange}:${symbol}`;

  const src = useMemo(() => {
    const encoded = encodeURIComponent(tvSymbol);
    return `https://s.tradingview.com/widgetembed/?symbol=${encoded}&interval=${interval}&theme=light&style=1&locale=en&timezone=Asia%2FKolkata`;
  }, [tvSymbol, interval]);

  return (
    <div className="container">
      <div className="top">
        <h2 style={{ margin: 0 }}>Chart: {tvSymbol}</h2>
        <button className="btn" onClick={() => window.history.back()}>Back</button>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <iframe title="tradingview" src={src} width="100%" height="640" style={{ border: 0 }} />
      </div>
    </div>
  );
}
