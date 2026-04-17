import React, { useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import API from "../services/api";

const Login: React.FC = () => {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const handleLogin = async () => {
    try {
      const res = await API.get<{ url: string }>("/api/login");
      window.location.href = res.data.url;
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-slate-100/80 text-slate-900 antialiased">
      {/* Top nav */}
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800"
          >
            <BrandLogo heightClass="h-8" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
            <Link to="/#features" className="transition hover:text-brand-orange">
              Features
            </Link>
            <Link to="/#scanners" className="transition hover:text-brand-orange">
              Scanners
            </Link>
            <span className="inline-flex items-center gap-1.5">
              <Link to="/#connect" className="transition hover:text-brand-orange">
                Connect
              </Link>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                New
              </span>
            </span>
          </nav>
          <Link
            to="/"
            className="text-sm font-medium text-brand-navy hover:text-brand-orange"
          >
            Home
          </Link>
        </div>
      </header>

      {/* Promo banner */}
      {!bannerDismissed && (
        <div className="relative overflow-hidden bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-800 px-4 py-2.5 text-white sm:px-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
            }}
            aria-hidden
          />
          <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <p className="text-sm sm:text-[15px]">
              <span className="font-semibold">Tip:</span> Pick a scan date in the
              header for NIFTY 50 market views.{" "}
              <Link to="/" className="font-semibold underline decoration-white/60 underline-offset-2 hover:decoration-white">
                Learn more
              </Link>
            </p>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="shrink-0 rounded-md border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm transition hover:bg-white/20"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main two columns */}
      <main className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-6 lg:py-14">
        <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          {/* Left: branding */}
          <div className="order-2 lg:order-1">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-lg border border-slate-100 bg-white p-1 shadow-sm">
                <BrandLogo heightClass="h-12" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Welcome to{" "}
                  <span className="text-brand-navy">Inningstar</span>
                </h1>
                <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
                  Connect your Zerodha account via{" "}
                  <strong className="font-semibold text-slate-800">
                    Kite Connect
                  </strong>
                  . View margins, holdings, NIFTY 50 scanners, and open charts —
                  without storing your Kite password on this app.
                </p>
              </div>
            </div>

            <ul className="mt-10 space-y-6">
              <li className="flex gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-2xl"
                  aria-hidden
                >
                  🪁
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    No extra brokerage here
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    You authorize on the official Kite login page. We only
                    receive an access token for API calls — same model as other
                    Kite Connect apps.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
                  <svg
                    className="h-7 w-7 text-slate-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.25}
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Built on Kite Connect
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Use an API key issued from your Zerodha developer console.
                    Revoke access anytime from Kite linked apps settings.
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* Right: login card */}
          <div className="order-1 lg:order-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-8">
              <h2 className="text-lg font-bold text-slate-800 sm:text-xl">
                Login with your broker
              </h2>

              <button
                type="button"
                onClick={handleLogin}
                className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border-2 border-brand-orange/35 bg-[#f5821f0f] py-3.5 text-[15px] font-semibold text-slate-800 transition hover:border-brand-orange/50 hover:bg-[#f5821f18] focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:ring-offset-2"
              >
                <ZerodhaMark className="h-8 w-8 shrink-0" />
                Login with Zerodha
              </button>

              <p className="mt-4 text-center text-sm text-slate-600">
                Don&apos;t have a Zerodha account?{" "}
                <a
                  href="https://zerodha.com/open-account"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-navy hover:text-brand-orange hover:underline"
                >
                  Open Now
                </a>
              </p>

              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide text-slate-400">
                  <span className="bg-white px-3">Or login with</span>
                </div>
              </div>

              <div className="space-y-3">
                <BrokerRow label="Angel One" disabled />
                <BrokerRow label="Upstox" disabled />
                <BrokerRow label="ICICI Direct" disabled />
              </div>

              <a
                href="https://kite.trade/docs/connect/v3/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500 transition hover:text-brand-orange"
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                  />
                </svg>
                Is it safe to login with my broker?
              </a>

              <button
                type="button"
                disabled
                className="mt-6 flex w-full cursor-not-allowed items-center justify-between rounded-lg border border-slate-200 bg-slate-50 py-3 px-4 text-left text-sm font-medium text-slate-400"
              >
                <span className="flex items-center gap-3">
                  <GoogleMark />
                  Sign in with Google
                </span>
                <svg className="h-5 w-5 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                Not available for Kite Connect login
              </p>
            </div>

            <p className="mt-6 text-center text-xs text-slate-500">
              By proceeding, you agree to Zerodha&apos;s and this app&apos;s use
              of Kite Connect as described in the{" "}
              <a
                href="https://kite.trade/docs/connect/v3/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-navy hover:text-brand-orange hover:underline"
              >
                API documentation
              </a>
              .
            </p>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Inningstar · dev build
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

function BrokerRow({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white py-3 px-4 text-left text-sm font-medium text-slate-400 opacity-60 cursor-not-allowed"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-400">
        {label.slice(0, 1)}
      </span>
      {label}
      {disabled && (
        <span className="ml-auto text-[10px] font-semibold uppercase text-slate-400">
          Soon
        </span>
      )}
    </button>
  );
}

/** Simplified Zerodha-style mark (not official logo) */
function ZerodhaMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="6" fill="#387ed1" />
      <path
        d="M8 22V10l6 8 6-8v12"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default Login;
