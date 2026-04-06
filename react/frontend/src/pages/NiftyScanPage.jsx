import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

const money = (v) => Number(v || 0).toFixed(2);

export default function NiftyScanPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(params.get("tab") || "gainer");
  const date = params.get("date") || new Date().toISOString().slice(0, 10);
  const tf = params.get("tf") || "5";

  useEffect(() => {
    api.get(`/api/nifty-scan?date=${date}&tf=${tf}`).then((res) => setData(res.data));
  }, [date, tf]);

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  };

  const rows = tab === "gainer" ? (data?.gainerRows || []) : (data?.loserRows || []);

  return (
    <div className="container">
      <div className="top">
        <div>
          <h2 style={{ margin: 0 }}>NIFTY50 Timeframe Scan</h2>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <input type="date" value={date} onChange={(e) => update("date", e.target.value)} />
            <select value={tf} onChange={(e) => update("tf", e.target.value)}>
              {[1, 2, 3, 5, 10, 15].map((v) => <option key={v} value={v}>{v} minutes</option>)}
            </select>
          </div>
        </div>
        <Link className="btn" to="/dashboard">Back</Link>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="btn" onClick={() => setTab("gainer")}>Gainer ({data?.gainerRows?.length || 0})</button>
        <button className="btn" onClick={() => setTab("loser")}>Loser ({data?.loserRows?.length || 0})</button>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Symbol</th><th>First Open</th><th>First Close</th><th>Second Open</th><th>Second Close</th><th>Gap</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6}>No matching stock found.</td></tr> : rows.map((r) => (
              <tr key={r.symbol}>
                <td><Link to={`/chart?exchange=NSE&symbol=${r.symbol}&date=${date}`}>{r.symbol}</Link></td>
                <td>{money(r.first.open)}</td><td>{money(r.first.close)}</td>
                <td>{money(r.second.open)}</td><td>{money(r.second.close)}</td>
                <td className="positive">{money(r.gap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
