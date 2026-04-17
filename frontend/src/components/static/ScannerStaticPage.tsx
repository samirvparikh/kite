import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../BrandLogo";

type Props = {
  title: string;
  description: string;
  imagePath: string;
};

const scannerLinks = [
  { to: "/scanners/5min-breakout", label: "5 Min Breakout" },
  { to: "/scanners/9-20-breakout", label: "9:20 Breakout" },
  { to: "/scanners/9-30-breakout", label: "9:30 Breakout" },
  { to: "/scanners/ce-pe-bias", label: "CE / PE bias" },
  { to: "/scanners/my-today-choice", label: "My Today Choice" },
];

const ScannerStaticPage: React.FC<Props> = ({ title, description, imagePath }) => {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(Boolean(localStorage.getItem("access_token")));
  }, []);

  return (
    <div className="min-h-svh bg-white text-slate-900 antialiased">
      <header className="sticky top-0 z-50 border-b border-slate-100/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <BrandLogo heightClass="h-9 sm:h-10" />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <Link to="/" className="transition hover:text-brand-orange">
              Features
            </Link>
            <Link to="/#scanners" className="transition text-brand-orange">
              Scanners
            </Link>
            <Link to="/#connect" className="transition hover:text-brand-orange">
              Kite Connect
            </Link>
          </nav>
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
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-orange">
              Scanner Detail
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              {description}
            </p>
            <div className="mt-6">
              <Link
                to="/#scanners"
                className="inline-flex rounded-xl border-2 border-brand-navy px-6 py-3 text-sm font-semibold text-brand-navy transition hover:bg-[#f5821f0d]"
              >
                Back to Home Scanners
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
            <img
              src={imagePath}
              alt={`${title} preview`}
              className="h-full min-h-[260px] w-full object-cover"
            />
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">All Scanners</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {scannerLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  item.label === title
                    ? "bg-brand-orange/10 font-semibold text-brand-navy ring-1 ring-brand-orange/25"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
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

export default ScannerStaticPage;
