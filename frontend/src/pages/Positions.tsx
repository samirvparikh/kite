import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import API from "../services/api";
import { parseDashDate, useAppShell } from "../context/AppShellContext";

type NetPosition = {
  tradingsymbol?: string;
  exchange?: string;
  product?: string;
  quantity?: number;
  average_price?: number;
  last_price?: number;
  pnl?: number;
  realised?: number;
  unrealised?: number;
};

type MarginSegment = {
  utilised?: { debits?: number };
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function fmt2(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtInt(v: number): string {
  return Math.round(v).toLocaleString("en-IN");
}

function pnlClass(v: number): string {
  if (v > 0) return "text-emerald-600";
  if (v < 0) return "text-red-600";
  return "text-slate-700";
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function extractNet(body: unknown): NetPosition[] {
  const b = body as { data?: { net?: NetPosition[] } };
  const net = b?.data?.net;
  return Array.isArray(net) ? net : [];
}

const Positions: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { scanDate, setScanDate } = useAppShell();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [netRows, setNetRows] = useState<NetPosition[]>([]);
  const [marginDebits, setMarginDebits] = useState<number | null>(null);
  const [indexLine, setIndexLine] = useState<{
    label: string;
    ltp: number;
    chgPct: number;
  } | null>(null);

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

    const niftyKey = "NSE:NIFTY 50";

    Promise.all([
      API.get("/api/kite/portfolio/positions"),
      API.get<{ data?: { equity?: MarginSegment } }>("/api/kite/user/margins"),
      API.get(`/api/kite/quote?i=${encodeURIComponent(niftyKey)}`).catch(
        () => null
      ),
    ])
      .then(([posRes, marginsRes, quoteRes]) => {
        if (cancelled) return;
        setNetRows(extractNet(posRes.data));
        const eq = marginsRes.data?.data?.equity;
        const deb = eq?.utilised?.debits;
        setMarginDebits(typeof deb === "number" ? deb : null);

        if (quoteRes?.data) {
          const qd = (quoteRes.data as { data?: Record<string, unknown> })
            ?.data;
          const q = qd?.[niftyKey] as
            | {
                last_price?: number;
                ohlc?: { close?: number };
              }
            | undefined;
          if (q && typeof q.last_price === "number") {
            const close = num(q.ohlc?.close) || q.last_price;
            const chgPct =
              close !== 0 ? ((q.last_price - close) / close) * 100 : 0;
            setIndexLine({
              label: "NIFTY 50",
              ltp: q.last_price,
              chgPct,
            });
          } else setIndexLine(null);
        } else setIndexLine(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        let msg = "Failed to load positions";
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
  }, [navigate]);

  const activeNet = useMemo(
    () => netRows.filter((p) => num(p.quantity) !== 0),
    [netRows]
  );

  const totals = useMemo(() => {
    let totalPnl = 0;
    let booked = 0;
    let unbooked = 0;
    for (const p of activeNet) {
      totalPnl += num(p.pnl);
      booked += num(p.realised);
      unbooked += num(p.unrealised);
    }
    if (booked === 0 && unbooked === 0 && activeNet.length) {
      unbooked = totalPnl;
    }
    return { totalPnl, booked, unbooked };
  }, [activeNet]);

  const firstSym = activeNet[0]?.tradingsymbol;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Loading positions…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    );
  }

  return (
    <div className="grid gap-4 px-4 pb-10 md:px-6 lg:grid-cols-12">
      {/* Left — P&L summary */}
      <aside className="space-y-4 lg:col-span-3">
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            className="flex-1 rounded-md bg-blue-600 py-2 text-sm font-medium text-white shadow-sm"
          >
            Positions
          </button>
          <button
            type="button"
            className="flex-1 rounded-md py-2 text-sm font-medium text-slate-600"
            disabled
          >
            Groups
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Total P&amp;L</div>
              <div
                className={`text-lg font-semibold tabular-nums ${pnlClass(totals.totalPnl)}`}
              >
                {fmtInt(totals.totalPnl)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
              <div>
                <div className="text-xs text-slate-500">Booked P&amp;L</div>
                <div className={`font-medium tabular-nums ${pnlClass(totals.booked)}`}>
                  {fmtInt(totals.booked)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Unbooked P&amp;L</div>
                <div
                  className={`font-medium tabular-nums ${pnlClass(totals.unbooked)}`}
                >
                  {fmtInt(totals.unbooked)}
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs text-slate-500">Total decay</div>
              <div className="font-medium tabular-nums text-slate-400">—</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 shadow-sm"
          >
            Charges
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 shadow-sm"
          >
            <IconShare />
            Share P&amp;L
          </button>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-600">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="rounded border-slate-300" />
            Closed positions
          </label>
          <span className="text-blue-600">View funds</span>
        </div>

        {firstSym && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-medium text-slate-800">{firstSym}</span>
            <span className={` ml-2 tabular-nums ${pnlClass(totals.totalPnl)}`}>
              {fmtInt(totals.totalPnl)}
            </span>
          </div>
        )}
      </aside>

      {/* Center — table */}
      <section className="space-y-4 lg:col-span-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              {indexLine ? (
                <>
                  <span className="text-lg font-semibold text-slate-900">
                    {indexLine.label}{" "}
                    <span className="tabular-nums">
                      {fmt2(indexLine.ltp)}
                    </span>
                  </span>
                  <span
                    className={`text-sm font-medium tabular-nums ${pnlClass(indexLine.chgPct)}`}
                  >
                    {indexLine.chgPct >= 0 ? "+" : ""}
                    {indexLine.chgPct.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-lg font-semibold text-slate-900">
                  Positions
                </span>
              )}
              <button
                type="button"
                className="ml-auto rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
              >
                Info
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Breakeven: <span className="text-slate-400">—</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-3 md:grid-cols-6">
            {(
              [
                ["Total P&L", totals.totalPnl],
                ["Booked", totals.booked],
                ["Unbooked", totals.unbooked],
                ["Max profit", null],
                ["Max loss", null],
                ["Margin used", marginDebits],
              ] as const
            ).map(([label, val]) => (
              <div key={label} className="bg-white px-3 py-2 text-center text-xs">
                <div className="text-slate-500">{label}</div>
                <div
                  className={`mt-0.5 font-semibold tabular-nums ${
                    typeof val === "number" ? pnlClass(val) : "text-slate-400"
                  }`}
                >
                  {typeof val === "number" ? fmtInt(val) : "—"}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
            <button
              type="button"
              className="rounded-md border border-blue-600 px-3 py-1 text-xs font-medium text-blue-600"
            >
              Show all
            </button>
            <span className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700">
              {dayLabel(scanDate)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Avg</th>
                  <th className="px-2 py-2 font-medium">LTP</th>
                  <th className="px-2 py-2 font-medium">Booked</th>
                  <th className="px-2 py-2 font-medium">Unbooked</th>
                  <th className="px-4 py-2 font-medium">P/L</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-50 text-slate-600">
                  <td className="px-4 py-3" colSpan={7}>
                    Manual P&amp;L{" "}
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                    >
                      Add P&amp;L
                    </button>
                  </td>
                </tr>
                {activeNet.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-slate-500"
                      colSpan={7}
                    >
                      No open positions.
                    </td>
                  </tr>
                ) : (
                  activeNet.map((p, i) => {
                    const q = num(p.quantity);
                    const pnl = num(p.pnl);
                    const booked = num(p.realised);
                    const unb = num(p.unrealised);
                    const dispBooked =
                      booked === 0 && unb === 0 ? 0 : booked;
                    const dispUnbooked =
                      booked === 0 && unb === 0 ? pnl : unb;
                    const name = `${p.product ?? ""} ${p.tradingsymbol ?? ""}`.trim();
                    return (
                      <tr
                        key={`${p.tradingsymbol}-${p.exchange}-${i}`}
                        className="border-b border-slate-50 hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-2">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300"
                            />
                            <span className="font-medium text-slate-800">
                              {name || "—"}
                            </span>
                          </label>
                        </td>
                        <td className="px-2 py-2 tabular-nums">{fmtInt(q)}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {fmt2(num(p.average_price))}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {fmt2(num(p.last_price))}
                        </td>
                        <td
                          className={`px-2 py-2 tabular-nums ${pnlClass(dispBooked)}`}
                        >
                          {fmtInt(dispBooked)}
                        </td>
                        <td
                          className={`px-2 py-2 tabular-nums ${pnlClass(dispUnbooked)}`}
                        >
                          {fmtInt(dispUnbooked)}
                        </td>
                        <td
                          className={`px-4 py-2 font-medium tabular-nums ${pnlClass(pnl)}`}
                        >
                          {fmtInt(pnl)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Right — Actions */}
      <aside className="space-y-4 lg:col-span-3">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
            <button
              type="button"
              className="ml-auto text-slate-400"
              aria-label="Collapse"
            >
              <IconChevron />
            </button>
          </div>
          <div className="p-3">
            <button
              type="button"
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <IconPencil />
              Analyse
            </button>
            <ul className="space-y-1 text-sm text-slate-700">
              <ActionRow icon={<IconDoc />} label="Open in Builder" link />
              <ActionRow
                icon={<IconExit />}
                label={`Exit positions (${activeNet.length})`}
              />
              <ActionRow icon={<IconPlus />} label="Add to Group" />
              <ActionRow icon={<IconDoc />} label="Add to Drafts" />
              <ActionRow icon={<IconShield />} label="Stoploss orders" />
              <li className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
                <span className="text-slate-400">
                  <IconBranch />
                </span>
                <span className="flex-1">Conditional exit</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  New
                </span>
                <IconChevronSmall />
              </li>
            </ul>
          </div>
          <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <div className="mb-2 font-medium text-slate-700">Greeks</div>
            <p className="mb-2 text-slate-400">
              Not available from Kite positions. Use an options analytics tool
              for live Greeks.
            </p>
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt>Delta</dt>
                <dd className="tabular-nums text-slate-400">—</dd>
              </div>
              <div className="flex justify-between">
                <dt>Gamma</dt>
                <dd className="tabular-nums text-slate-400">—</dd>
              </div>
              <div className="flex justify-between">
                <dt>Vega</dt>
                <dd className="tabular-nums text-slate-400">—</dd>
              </div>
              <div className="flex justify-between">
                <dt>Theta</dt>
                <dd className="tabular-nums text-slate-400">—</dd>
              </div>
              <div className="flex justify-between">
                <dt>Decay</dt>
                <dd className="tabular-nums text-slate-400">—</dd>
              </div>
            </dl>
          </div>
        </div>
      </aside>
    </div>
  );
};

function ActionRow({
  icon,
  label,
  link,
}: {
  icon: React.ReactNode;
  label: string;
  link?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
      >
        <span className="text-slate-400">{icon}</span>
        <span className="flex-1">{label}</span>
        {link ? (
          <span className="text-slate-400">
            <IconExternal />
          </span>
        ) : null}
      </button>
    </li>
  );
}

function IconShare() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 5.314 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.166 2.25 2.25 0 0 0-3.935-2.166zm0-5.196a2.25 2.25 0 1 0 3.935-2.166 2.25 2.25 0 0 0-3.935 2.166Z" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
    </svg>
  );
}

function IconChevronSmall() {
  return (
    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 9L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function IconExit() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75a3.375 3.375 0 0 0-3.375 3.375v11.25a3.375 3.375 0 0 0 3.375 3.375h9.75a3.375 3.375 0 0 0 3.375-3.375Z" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function IconBranch() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

export default Positions;
