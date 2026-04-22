import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import API from "../../services/api";
import CenteredLoader from "../../components/CenteredLoader";

const Static930Breakout: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dateParam = searchParams.get("date") || todayIST;
  const [selectedDate, setSelectedDate] = useState(dateParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [finalPicks, setFinalPicks] = useState<any[]>([]);

  useEffect(() => {
    setSelectedDate(dateParam);
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("access_token");
    if (!token) {
      setRows([]);
      setFinalPicks([]);
      setError("Please login to load NSE scanner data.");
      setLoading(false);
      return;
    }
    API.get(`/api/scan/nse-oi-momentum-breakout?date=${encodeURIComponent(dateParam)}`)
      .then((res) => {
        setRows(res.data?.candidates ?? []);
        setFinalPicks(res.data?.finalPicks ?? []);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Failed to load scanner";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [dateParam]);

  function runScan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const d = String(fd.get("date") ?? "").trim();
    if (d) setSearchParams({ date: d });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <CenteredLoader label="Loading NSE scanner..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">9:20 Breakout (NSE OI + Momentum)</h1>
        <p className="mt-2 text-sm text-slate-600">
          Real-time NSE OI Spurts + Top Gainers/Losers with 9:15-9:30 breakout logic.
        </p>
        <form onSubmit={runScan} className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="scan-date" className="text-sm font-medium text-slate-700">Select Date:</label>
          <input id="scan-date" name="date" type="date" defaultValue={selectedDate} key={selectedDate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white">Load Data</button>
          <Link to="/#scanners" className="text-sm text-brand-orange">Back to Scanners</Link>
        </form>
        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Final Picks (3-6)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="px-2 py-2">Stock</th><th className="px-2 py-2">OI %</th><th className="px-2 py-2">Price %</th><th className="px-2 py-2">Signal</th><th className="px-2 py-2">Entry</th><th className="px-2 py-2">Stop Loss</th><th className="px-2 py-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {finalPicks.length === 0 ? (
                <tr><td className="px-2 py-3 text-slate-500" colSpan={7}>No final picks for selected date.</td></tr>
              ) : finalPicks.map((r) => (
                <tr key={`f-${r.symbol}`} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium">{r.symbol}</td>
                  <td className="px-2 py-2">{r.oiChangePct == null ? "-" : Number(r.oiChangePct).toFixed(2)}</td>
                  <td className="px-2 py-2">{r.priceChangePct == null ? "-" : Number(r.priceChangePct).toFixed(2)}</td>
                  <td className={`px-2 py-2 font-semibold ${r.signal === "BUY" ? "text-emerald-600" : r.signal === "SELL" ? "text-red-600" : "text-slate-600"}`}>{r.signal}</td>
                  <td className="px-2 py-2">{r.entry == null ? "-" : Number(r.entry).toFixed(2)}</td>
                  <td className="px-2 py-2">{r.stopLoss == null ? "-" : Number(r.stopLoss).toFixed(2)}</td>
                  <td className="px-2 py-2">{r.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">All Candidates</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="px-2 py-2">Stock</th><th className="px-2 py-2">Setup</th><th className="px-2 py-2">OI %</th><th className="px-2 py-2">Price %</th><th className="px-2 py-2">Signal</th><th className="px-2 py-2">Volume</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td className="px-2 py-3 text-slate-500" colSpan={6}>No candidate data available.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.symbol} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium">{r.symbol}</td>
                  <td className="px-2 py-2">{r.setup}</td>
                  <td className="px-2 py-2">{r.oiChangePct == null ? "-" : Number(r.oiChangePct).toFixed(2)}</td>
                  <td className="px-2 py-2">{r.priceChangePct == null ? "-" : Number(r.priceChangePct).toFixed(2)}</td>
                  <td className={`px-2 py-2 font-semibold ${r.signal === "BUY" ? "text-emerald-600" : r.signal === "SELL" ? "text-red-600" : "text-slate-600"}`}>{r.signal}</td>
                  <td className="px-2 py-2">{r.volumeShares == null ? "-" : Number(r.volumeShares).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Static930Breakout;
