import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import API from "../services/api";
import { parseDashDate, useAppShell } from "../context/AppShellContext";
import CenteredLoader from "../components/CenteredLoader";
import "./Dashboard.css";

type MarginSegment = {
  enabled?: boolean;
  net?: number;
  available?: {
    live_balance?: number;
    opening_balance?: number;
    intraday_payin?: number;
  };
  utilised?: {
    debits?: number;
  };
};

type ProfileData = {
  user_name?: string;
  user_id?: string;
  broker?: string;
  email?: string;
  user_shortname?: string;
  user_type?: string;
  exchanges?: string[];
  products?: string[];
};

type HoldingRow = {
  tradingsymbol?: string;
  exchange?: string;
  quantity?: number;
  average_price?: number;
  last_price?: number;
  pnl?: number;
};

function h(value: unknown): string {
  return String(value ?? "");
}

function formatAmount(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/** Mirrors PHP `!empty()` for margin segment `enabled` flags. */
function isNonEmptyEnabled(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setScanDate } = useAppShell();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ProfileData>({});
  const [equityData, setEquityData] = useState<MarginSegment>({});
  const [commodityData, setCommodityData] = useState<MarginSegment>({});
  const [holdingsData, setHoldingsData] = useState<HoldingRow[]>([]);

  useEffect(() => {
    const fromUrl = parseDashDate(searchParams.get("date"));
    if (fromUrl) setScanDate(fromUrl);
  }, [searchParams, setScanDate]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      API.get<{ data: ProfileData }>("/api/kite/user/profile"),
      API.get<{
        data: { equity?: MarginSegment; commodity?: MarginSegment };
      }>("/api/kite/user/margins"),
      API.get<{ data: HoldingRow[] }>("/api/kite/portfolio/holdings"),
    ])
      .then(([profileRes, marginsRes, holdingsRes]) => {
        if (cancelled) return;
        const md = marginsRes.data?.data ?? {};
        setProfileData(profileRes.data?.data ?? {});
        setEquityData(md.equity ?? {});
        setCommodityData(md.commodity ?? {});
        setHoldingsData(
          Array.isArray(holdingsRes.data?.data)
            ? holdingsRes.data.data
            : []
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        let msg = "Failed to load dashboard";
        if (isAxiosError(err)) {
          const d = err.response?.data;
          if (typeof d === "string") msg = d;
          else if (d && typeof d === "object" && "message" in d) {
            msg = String((d as { message: unknown }).message);
          } else if (d && typeof d === "object") {
            msg = JSON.stringify(d);
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
  }, [navigate]);

  const { equityAvailable, equityUtilised, totalPnl, totalHoldingValue } =
    useMemo(() => {
      let totalPnlVal = 0;
      let totalHoldingValueVal = 0;
      for (const item of holdingsData) {
        const quantity = Number(item.quantity ?? 0);
        const lastPrice = Number(item.last_price ?? 0);
        const pnl = Number(item.pnl ?? 0);
        totalHoldingValueVal += quantity * lastPrice;
        totalPnlVal += pnl;
      }
      return {
        equityAvailable: Number(
          equityData.available?.live_balance ?? 0
        ),
        equityUtilised: Number(equityData.utilised?.debits ?? 0),
        totalPnl: totalPnlVal,
        totalHoldingValue: totalHoldingValueVal,
      };
    }, [holdingsData, equityData]);

  if (loading) {
    return (
      <CenteredLoader label="Loading dashboard…" />
    );
  }

  return (
    <div className="dashboard-page px-4 pb-10 pt-2 md:px-6">
      <div className="dashboard-container mx-auto max-w-[1100px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              {h(profileData.user_name ?? "Dashboard")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {h(profileData.user_id ?? "-")} · {h(profileData.broker ?? "-")} ·{" "}
              {h(profileData.email ?? "-")}
            </p>
          </div>
          <p className="text-sm font-medium text-violet-600">
            Scanners in sidebar · scan date in header
          </p>
        </div>

        {error && (
          <div className="dashboard-error" role="alert">
            {error}
          </div>
        )}

        <div className="dashboard-grid">
          <div className="dashboard-card">
            <div className="dashboard-label">Equity Available</div>
            <div className="dashboard-value">
              Rs {formatAmount(equityAvailable)}
            </div>
          </div>
          <div className="dashboard-card">
            <div className="dashboard-label">Holdings Value</div>
            <div className="dashboard-value">
              Rs {formatAmount(totalHoldingValue)}
            </div>
          </div>
          <div className="dashboard-card">
            <div className="dashboard-label">Total P&L</div>
            <div
              className={`dashboard-value ${
                totalPnl >= 0 ? "dashboard-positive" : "dashboard-negative"
              }`}
            >
              Rs {formatAmount(totalPnl)}
            </div>
          </div>
          <div className="dashboard-card">
            <div className="dashboard-label">Equity Utilised</div>
            <div className="dashboard-value">
              Rs {formatAmount(equityUtilised)}
            </div>
          </div>
        </div>

        <h3 className="dashboard-section-title">Profile</h3>
        <div className="dashboard-card">
          <div>
            <strong>Short name:</strong> {h(profileData.user_shortname ?? "-")}
          </div>
          <div>
            <strong>User type:</strong> {h(profileData.user_type ?? "-")}
          </div>
          <div style={{ marginTop: 10 }}>
            <strong>Exchanges:</strong>
            <br />
            {(profileData.exchanges ?? []).map((ex) => (
              <span key={ex} className="dashboard-pill">
                {h(ex)}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <strong>Products:</strong>
            <br />
            {(profileData.products ?? []).map((p) => (
              <span key={p} className="dashboard-pill">
                {h(p)}
              </span>
            ))}
          </div>
        </div>

        <h3 className="dashboard-section-title">Margins</h3>
        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Segment</th>
                <th>Enabled</th>
                <th>Net</th>
                <th>Live Balance</th>
                <th>Opening Balance</th>
                <th>Intraday Payin</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Equity</td>
                <td>
                  {isNonEmptyEnabled(equityData.enabled) ? "Yes" : "No"}
                </td>
                <td>Rs {formatAmount(equityData.net ?? 0)}</td>
                <td>
                  Rs {formatAmount(equityData.available?.live_balance ?? 0)}
                </td>
                <td>
                  Rs{" "}
                  {formatAmount(equityData.available?.opening_balance ?? 0)}
                </td>
                <td>
                  Rs {formatAmount(equityData.available?.intraday_payin ?? 0)}
                </td>
              </tr>
              <tr>
                <td>Commodity</td>
                <td>
                  {isNonEmptyEnabled(commodityData.enabled) ? "Yes" : "No"}
                </td>
                <td>Rs {formatAmount(commodityData.net ?? 0)}</td>
                <td>
                  Rs{" "}
                  {formatAmount(commodityData.available?.live_balance ?? 0)}
                </td>
                <td>
                  Rs{" "}
                  {formatAmount(
                    commodityData.available?.opening_balance ?? 0
                  )}
                </td>
                <td>
                  Rs{" "}
                  {formatAmount(commodityData.available?.intraday_payin ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="dashboard-section-title">Holdings</h3>
        <div className="dashboard-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Exchange</th>
                <th>Quantity</th>
                <th>Avg Price</th>
                <th>Last Price</th>
                <th>Value</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {holdingsData.length === 0 ? (
                <tr>
                  <td colSpan={7}>No holdings found.</td>
                </tr>
              ) : (
                holdingsData.map((item, idx) => {
                  const qty = Number(item.quantity ?? 0);
                  const avg = Number(item.average_price ?? 0);
                  const ltp = Number(item.last_price ?? 0);
                  const value = qty * ltp;
                  const pnl = Number(item.pnl ?? 0);
                  const key = `${item.tradingsymbol ?? ""}-${item.exchange ?? ""}-${idx}`;
                  return (
                    <tr key={key}>
                      <td>{h(item.tradingsymbol ?? "-")}</td>
                      <td>{h(item.exchange ?? "-")}</td>
                      <td>{h(item.quantity ?? 0)}</td>
                      <td>Rs {formatAmount(avg)}</td>
                      <td>Rs {formatAmount(ltp)}</td>
                      <td>Rs {formatAmount(value)}</td>
                      <td
                        className={
                          pnl >= 0 ? "dashboard-positive" : "dashboard-negative"
                        }
                      >
                        Rs {formatAmount(pnl)}
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

export default Dashboard;
