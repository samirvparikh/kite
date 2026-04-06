import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

const money = (v) => Number(v || 0).toFixed(2);

export default function ScannerPage() {
  const { type } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/api/scanner?type=${encodeURIComponent(type)}`).then((res) => setData(res.data));
  }, [type]);

  if (!data) return <div className="container">Loading...</div>;
  const rows = data.rows || [];
  const sector = type === "sector";

  return (
    <div className="container">
      <div className="top">
        <h2 style={{ margin: 0 }}>{data.title}</h2>
        <Link className="btn" to="/dashboard">Back to Dashboard</Link>
      </div>
      <div className="card">
        <table>
          <thead>
            {sector
              ? <tr><th>Sector</th><th>No. of Stocks</th><th>Change %</th></tr>
              : <tr><th>Symbol</th><th>Exchange</th><th>Last</th><th>Change %</th><th>P&L</th></tr>}
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={5}>No data available.</td></tr> : rows.map((r) => sector ? (
              <tr key={r.name}><td>{r.name}</td><td>{r.stocks}</td><td className={r.change >= 0 ? "positive" : "negative"}>{money(r.change)}%</td></tr>
            ) : (
              <tr key={`${r.exchange}-${r.symbol}`}>
                <td><Link to={`/chart?exchange=${r.exchange}&symbol=${r.symbol}`}>{r.symbol}</Link></td>
                <td>{r.exchange}</td><td>Rs {money(r.last_price)}</td>
                <td className={r.change_pct >= 0 ? "positive" : "negative"}>{money(r.change_pct)}%</td>
                <td className={r.pnl >= 0 ? "positive" : "negative"}>Rs {money(r.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
