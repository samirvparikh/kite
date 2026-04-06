import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";

const Home: React.FC = () => {
  const [hasSession, setHasSession] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setHasSession(Boolean(localStorage.getItem("access_token")));
  }, []);

  return (
    <div className="min-h-svh bg-white text-slate-900 antialiased">
      <header className="sticky top-0 z-50 border-b border-slate-100/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
            <BrandLogo heightClass="h-9 sm:h-10" />
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="transition hover:text-brand-orange">
              Features
            </a>
            <a href="#scanners" className="transition hover:text-brand-orange">
              Scanners
            </a>
            <a href="#connect" className="transition hover:text-brand-orange">
              Kite Connect
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden"
              aria-expanded={menuOpen}
              aria-label="Menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              )}
            </button>
            {hasSession ? (
              <Link
                to="/dashboard"
                className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                to="/login"
                className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90"
              >
                Login
              </Link>
            )}
          </div>
        </div>

        {menuOpen && (
          <div className="border-b border-slate-100 bg-white px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              <a
                href="#features"
                className="rounded-lg px-3 py-2 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                Features
              </a>
              <a
                href="#scanners"
                className="rounded-lg px-3 py-2 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                Scanners
              </a>
              <a
                href="#connect"
                className="rounded-lg px-3 py-2 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                Kite Connect
              </a>
            </nav>
          </div>
        )}
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-slate-100">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_-10%,rgba(245,130,31,0.12),transparent)]"
            aria-hidden
          />
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-24">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-orange">
                Be the star of every innings
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.25rem]">
                Trade and analyse with clarity.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
                Portfolio overview, NIFTY 50 market scanners, sector views, and
                charts — powered by your Kite session. Built for traders who want
                a fast, focused workspace.
              </p>
              <ul className="mt-8 flex flex-col gap-3 text-sm text-slate-700 sm:flex-row sm:flex-wrap">
                {[
                  "Live margins & holdings",
                  "Top gainers / losers (market)",
                  "NIFTY50 9:21 scan",
                  "TradingView charts",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-100"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                {hasSession ? (
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center justify-center rounded-xl bg-brand-navy px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-navy/25 transition hover:bg-brand-navy/90"
                  >
                    Open dashboard
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center rounded-xl bg-brand-navy px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-navy/25 transition hover:bg-brand-navy/90"
                  >
                    Explore now
                  </Link>
                )}
                <a
                  href="https://kite.trade/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border-2 border-brand-navy px-8 py-3.5 text-base font-semibold text-brand-navy transition hover:bg-[#f5821f0d]"
                >
                  Learn about Kite
                </a>
              </div>
            </div>

            <div className="relative lg:pl-4">
              <div className="relative mx-auto max-w-lg rounded-2xl border border-slate-200/80 bg-white p-2 shadow-2xl shadow-slate-200/60 ring-1 ring-slate-100">
                <div className="overflow-hidden rounded-xl bg-slate-50">
                  <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    </div>
                    <span className="text-xs font-medium text-slate-400">
                      inningstar
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-500">
                        Summary
                      </div>
                      <div className="flex gap-2">
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          +1.2%
                        </span>
                        <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs text-slate-600">
                          NIFTY50
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { l: "Equity", v: "₹ —" },
                        { l: "P&L", v: "₹ —", up: true },
                        { l: "Holdings", v: "—" },
                        { l: "Margin", v: "—" },
                      ].map((c) => (
                        <div
                          key={c.l}
                          className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-sm"
                        >
                          <div className="text-[10px] font-medium uppercase text-slate-400">
                            {c.l}
                          </div>
                          <div
                            className={`mt-1 text-sm font-bold ${
                              c.up ? "text-emerald-600" : "text-slate-800"
                            }`}
                          >
                            {c.v}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 h-36 rounded-lg bg-gradient-to-b from-slate-100 to-white p-3 ring-1 ring-inset ring-slate-200/60">
                      <div className="flex h-full flex-col justify-end">
                        <div className="flex h-24 items-end justify-between gap-1 px-1">
                          {[40, 65, 45, 80, 55, 70, 50, 85, 60, 75, 55, 90].map(
                            (h, i) => (
                              <div
                                key={i}
                                className="w-full max-w-[8%] rounded-t bg-brand-orange/80"
                                style={{ height: `${h}%` }}
                              />
                            )
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-center text-[10px] text-slate-400">
                        Illustrative · connect Kite for live data
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-4 hidden w-48 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:block lg:-right-8">
                <div className="text-[10px] font-semibold text-slate-500">
                  Mobile ready
                </div>
                <div className="mt-2 h-32 rounded-lg bg-slate-900 p-2">
                  <div className="h-full rounded bg-gradient-to-b from-emerald-500/20 to-red-500/20" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
        >
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Everything in one workspace
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Same patterns you expect from pro trading tools — tailored for Kite
            Connect workflows.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                t: "Portfolio at a glance",
                d: "Margins, holdings value, and day P&L in clear cards.",
              },
              {
                t: "Market scanners",
                d: "NIFTY 50 movers and sector aggregates by scan date.",
              },
              {
                t: "Charts on demand",
                d: "Open symbols in TradingView in a new tab when you need depth.",
              },
            ].map((card) => (
              <div
                key={card.t}
                className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-sm transition hover:border-brand-orange/30 hover:shadow-md"
              >
                <h3 className="font-semibold text-slate-900">{card.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {card.d}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="scanners"
          className="border-y border-slate-100 bg-slate-50/70 py-16 lg:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Scanners that respect the tape
            </h2>
            <p className="mt-3 max-w-2xl text-slate-600">
              Pick a date, jump between sector view, breakout-style ranking, top
              gainers and losers — all backed by Kite market data for the NIFTY
              50 universe.
            </p>
          </div>
        </section>

        <section id="connect" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="rounded-3xl bg-gradient-to-br from-brand-navy to-[#0f1828] px-8 py-12 text-center text-white shadow-xl sm:px-12 ring-1 ring-white/10">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Ready to connect?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-white/80">
              Sign in with Zerodha Kite. Your API credentials stay on your server;
              we never store your Kite password.
            </p>
            {hasSession ? (
              <Link
                to="/dashboard"
                className="mt-8 inline-flex rounded-xl bg-brand-orange px-8 py-3.5 text-base font-semibold text-white shadow-lg transition hover:bg-brand-orange/90"
              >
                Go to dashboard
              </Link>
            ) : (
              <Link
                to="/login"
                className="mt-8 inline-flex rounded-xl bg-brand-orange px-8 py-3.5 text-base font-semibold text-white shadow-lg transition hover:bg-brand-orange/90"
              >
                Login with Kite
              </Link>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Inningstar · Not affiliated with Zerodha</span>
          <div className="flex gap-6">
            <a
              href="https://kite.trade/docs/connect/v3/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand-orange"
            >
              Kite Connect docs
            </a>
            <Link to="/login" className="hover:text-brand-orange">
              Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
