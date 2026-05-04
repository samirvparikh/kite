import React from "react";
import { Link } from "react-router-dom";
import KiteConnectNotice from "../KiteConnectNotice";
import { isKiteOrBrokerSessionError } from "../../utils/apiError";
import "../../pages/Dashboard.css";

export type PortfolioMarginSegment = {
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

export type PortfolioProfileData = {
  user_name?: string;
  user_id?: string;
  broker?: string;
  email?: string;
  user_shortname?: string;
  user_type?: string;
  exchanges?: string[];
  products?: string[];
};

export type PortfolioHoldingRow = {
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

function isNonEmptyEnabled(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

export type PortfolioOverviewBlockProps = {
  profileData: PortfolioProfileData;
  equityData: PortfolioMarginSegment;
  commodityData: PortfolioMarginSegment;
  holdingsData: PortfolioHoldingRow[];
  needsKiteConnect: boolean;
  error: string | null;
  equityAvailable: number;
  equityUtilised: number;
  totalPnl: number;
  totalHoldingValue: number;
};

const PortfolioOverviewBlock: React.FC<PortfolioOverviewBlockProps> = ({
  profileData,
  equityData,
  commodityData,
  holdingsData,
  needsKiteConnect,
  error,
  equityAvailable,
  equityUtilised,
  totalPnl,
  totalHoldingValue,
}) => {
  return (
    <div className="dashboard-page col-span-full mb-8 px-0 pt-0 md:mb-10">
      <div className="dashboard-container max-w-[1100px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
              {h(profileData.user_name ?? "Portfolio")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {h(profileData.user_id ?? "-")} · {h(profileData.broker ?? "-")} ·{" "}
              {h(profileData.email ?? "-")}
            </p>
          </div>
          <p className="text-sm font-medium text-violet-600">
            Margins &amp; holdings · also in sidebar scanners
          </p>
        </div>

        {needsKiteConnect && (
          <div
            className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="status"
          >
            <p className="font-medium">
              Connect Zerodha to load portfolio and margins
            </p>
            <p className="mt-1 text-amber-900/90">
              Your app login is active. Open the login page and use{" "}
              <strong>Connect with Zerodha</strong> to link this account.
            </p>
            <Link
              to="/login"
              className="mt-3 inline-block font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
            >
              Go to login → Connect Zerodha
            </Link>
          </div>
        )}

        <KiteConnectNotice message={error} />
        {error && !isKiteOrBrokerSessionError(error) && (
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
            <strong>Short name:</strong>{" "}
            {h(profileData.user_shortname ?? "-")}
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
                  {formatAmount(
                    commodityData.available?.intraday_payin ?? 0
                  )}
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
                          pnl >= 0
                            ? "dashboard-positive"
                            : "dashboard-negative"
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

export default PortfolioOverviewBlock;
