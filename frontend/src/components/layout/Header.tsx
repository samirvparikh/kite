import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAppShell } from "../../context/AppShellContext";

type Props = {
  onMenuClick: () => void;
};

export const Header: React.FC<Props> = ({ onMenuClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const {
    profile,
    profileLoading,
    authStatus,
    authErrorMessage,
    scanDate,
    setScanDate,
  } = useAppShell();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  /** Indian FY (Apr–Mar) in IST, e.g. Apr 2026 → 2026-2027 */
  const fyLabel = (() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "numeric",
    }).formatToParts(new Date());
    const y = parseInt(
      parts.find((p) => p.type === "year")?.value ?? "0",
      10
    );
    const m = parseInt(
      parts.find((p) => p.type === "month")?.value ?? "1",
      10
    );
    if (!Number.isFinite(y) || !Number.isFinite(m)) {
      const cy = new Date().getFullYear();
      return `${cy}-${cy + 1}`;
    }
    if (m >= 4) return `${y}-${y + 1}`;
    return `${y - 1}-${y}`;
  })();

  const displayMonth = new Date().toLocaleDateString("en-IN", {
    month: "short",
    timeZone: "Asia/Kolkata",
  });

  function onDateChange(v: string) {
    setScanDate(v);
    if (
      location.pathname === "/dashboard" ||
      location.pathname === "/positions" ||
      location.pathname === "/nifty50-921" ||
      location.pathname === "/nifty50-930-breakout" ||
      location.pathname === "/nifty-option-bias"
    ) {
      setSearchParams({ date: v }, { replace: true });
    }
  }

  function logout() {
    localStorage.removeItem("access_token");
    setMenuOpen(false);
    navigate("/", { replace: true });
  }

  const initials = (() => {
    const src = profile?.user_name || profile?.email || "U";
    const parts = src.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return src.slice(0, 2).toUpperCase();
  })();

  return (
    <header className="sticky top-0 z-30 flex h-auto min-h-14 shrink-0 flex-col border-b border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 md:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 lg:hidden"
          aria-label="Open menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        <div className="flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
          <label htmlFor="header-scan-date" className="shrink-0 text-xs font-medium text-slate-500">
            Scan date
          </label>
          <input
            id="header-scan-date"
            type="date"
            value={scanDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/25"
          />
        </div>

        <div className="ml-auto flex min-w-0 flex-1 basis-full flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:basis-auto lg:flex-initial">
          <div className="flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-slate-600 sm:gap-x-4">
            <span className="inline-flex max-w-full items-center gap-1.5">
              <span className="shrink-0 text-slate-400">Broker</span>
              <span className="max-w-[12rem] truncate font-semibold uppercase tracking-wide text-slate-800">
                {profileLoading ? "…" : profile?.broker ?? "—"}
              </span>
            </span>
            <span className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
            <span className="inline-flex max-w-full items-center gap-1.5">
              <span className="shrink-0 text-slate-400">User</span>
              <span className="max-w-[10rem] truncate font-semibold text-slate-800">
                {profileLoading ? "…" : profile?.user_id ?? "—"}
              </span>
            </span>
            <span className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400">FY</span>
              <span className="font-semibold tabular-nums text-slate-800">{fyLabel}</span>
            </span>
            <span className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400">Month</span>
              <span className="font-semibold text-slate-800">{displayMonth}</span>
            </span>
          </div>

          <div
            className={
              authStatus === "ok"
                ? "flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800"
                : authStatus === "loading"
                  ? "flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600"
                  : "flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-800"
            }
            aria-label={
              authStatus === "ok"
                ? "Session active"
                : authStatus === "loading"
                  ? "Checking session"
                  : authErrorMessage ?? "Session invalid"
            }
            title={authStatus === "failed" ? authErrorMessage ?? undefined : undefined}
          >
            <span className="relative flex h-2.5 w-2.5">
              {authStatus === "ok" ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </>
              ) : authStatus === "loading" ? (
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-slate-400" />
              ) : (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </>
              )}
            </span>
            {authStatus === "ok"
              ? "Active"
              : authStatus === "loading"
                ? "Checking"
                : "Inactive"}
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white shadow-md ring-2 ring-white transition hover:opacity-95"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              {initials}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-slate-200 bg-white py-2 text-left shadow-xl">
                <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                  Signed in as
                  <div className="mt-0.5 truncate text-sm font-medium text-slate-900">
                    {profile?.email ?? profile?.user_name ?? "Trader"}
                  </div>
                </div>
                <Link
                  to={`/dashboard?date=${encodeURIComponent(scanDate)}`}
                  className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={logout}
                  className="w-full px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-sky-100 bg-sky-50 px-4 py-2 text-center text-xs text-sky-900 md:px-6">
        <strong className="font-semibold">Kite Connect</strong> — Market data
        and scans use your session. Always verify trades on Kite.
      </div>

    </header>
  );
};
