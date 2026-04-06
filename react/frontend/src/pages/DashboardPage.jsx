import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

const money = (v) => Number(v || 0).toFixed(2);

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/dashboard")
      .then((res) => setData(res.data))
      .catch(() => {
        setError("Session expired. Please login again.");
        navigate("/");
      });
  }, [navigate]);

  const totals = useMemo(() => {
    const holdings = data?.holdings || [];
    let totalPnl = 0;
    let holdingValue = 0;
    holdings.forEach((h) => {
      totalPnl += Number(h.pnl || 0);
      holdingValue += Number(h.quantity || 0) * Number(h.last_price || 0);
    });
    return { totalPnl, holdingValue };
  }, [data]);

  if (error) return <div className="container"><p className="negative">{error}</p></div>;
  if (!data) return <div className="container"><p>Loading...</p></div>;

  const profile = data.profile || {};
  const equity = data.margins?.equity || {};
  const holdings = data.holdings || [];

  return (
    <div className="container">
      <div className="top card">
        <div>
          <h2 style={{ margin: 0 }}>{profile.user_name || "Trader Dashboard"}</h2>
          <div className="muted">{profile.user_id || "-"} | {profile.broker || "-"} | {profile.email || "-"}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="btn" to="/scanner/sector">Sector</Link>
            <Link className="btn" to="/scanner/5min-breakout">5 Min Breakout</Link>
            <Link className="btn" to="/nifty-scan">NIFTY50 9:21 Scan</Link>
            <Link className="btn" to="/scanner/top-gainers">Top Gainers</Link>
            <Link className="btn" to="/scanner/top-losers">Top Losers</Link>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 16 }}>
        <div className="card"><div className="muted">Equity Available</div><div>Rs {money(equity.available?.live_balance)}</div></div>
        <div className="card"><div className="muted">Holdings Value</div><div>Rs {money(totals.holdingValue)}</div></div>
        <div className="card"><div className="muted">Total P&L</div><div className={totals.totalPnl >= 0 ? "positive" : "negative"}>Rs {money(totals.totalPnl)}</div></div>
      </div>

      <div className="card">
        <h3>Holdings</h3>
        <table>
          <thead><tr><th>Symbol</th><th>Exchange</th><th>Qty</th><th>Last</th><th>P&L</th></tr></thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr><td colSpan={5}>No holdings found.</td></tr>
            ) : holdings.map((h) => (
              <tr key={`${h.exchange}-${h.tradingsymbol}`}>
                <td><Link to={`/chart?exchange=${h.exchange}&symbol=${h.tradingsymbol}`}>{h.tradingsymbol}</Link></td>
                <td>{h.exchange}</td>
                <td>{h.quantity}</td>
                <td>{money(h.last_price)}</td>
                <td className={Number(h.pnl) >= 0 ? "positive" : "negative"}>{money(h.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
