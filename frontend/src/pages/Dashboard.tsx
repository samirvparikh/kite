import React, { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { parseDashDate, useAppShell } from "../context/AppShellContext";

const FEATURE_PILLS = [
  "Live margins & holdings",
  "Top gainers / losers (market)",
  "NIFTY50 9:21 scan",
  "TradingView charts",
] as const;

function LineChartPreview() {
  return (
    <svg
      viewBox="0 0 320 120"
      className="h-32 w-full text-brand-orange"
      aria-hidden
    >
      <line
        x1="16"
        y1="100"
        x2="304"
        y2="100"
        className="stroke-slate-200"
        strokeWidth="1"
      />
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points="16,88 48,72 80,78 112,52 144,58 176,38 208,44 240,22 272,28 304,12"
      />
    </svg>
  );
}

function BarChartPreview() {
  const heights = [68, 88, 58, 100, 72];
  return (
    <div className="flex h-32 items-end justify-center gap-3 px-2 pt-4">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-10 rounded-t-md bg-gradient-to-t from-brand-orange/90 to-orange-200/90"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function CePePreview() {
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <div className="rounded-xl bg-sky-100/90 px-4 py-5 text-center ring-1 ring-sky-200/80">
        <p className="text-lg font-bold text-sky-700">CE</p>
        <p className="mt-1 text-xs font-medium text-sky-600">Call Strength</p>
      </div>
      <div className="rounded-xl bg-orange-100/90 px-4 py-5 text-center ring-1 ring-orange-200/80">
        <p className="text-lg font-bold text-orange-700">PE</p>
        <p className="mt-1 text-xs font-medium text-orange-600">Put Strength</p>
      </div>
    </div>
  );
}

type ScannerRowProps = {
  label: string;
  title: string;
  description: string;
  previewTitle: string;
  previewSubtitle: string;
  preview: React.ReactNode;
  liveTo: string;
};

function ScannerShowcaseRow({
  label,
  title,
  description,
  previewTitle,
  previewSubtitle,
  preview,
  liveTo,
}: ScannerRowProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-orange">
          {label}
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">
          {title}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/#scanners"
            className="inline-flex rounded-xl border-2 border-brand-navy px-5 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-[#f5821f0d]"
          >
            Back to Home Scanners
          </Link>
          <Link
            to={liveTo}
            className="inline-flex rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90"
          >
            Open live scanner
          </Link>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link
          to={liveTo}
          className="block rounded-xl bg-slate-50 p-5 ring-1 ring-slate-100 transition hover:ring-brand-orange/30"
        >
          <h3 className="text-lg font-bold text-brand-navy">{previewTitle}</h3>
          <p className="mt-1 text-sm text-slate-500">{previewSubtitle}</p>
          <div className="mt-4">{preview}</div>
        </Link>
      </div>
    </div>
  );
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setScanDate } = useAppShell();

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const fromUrl = parseDashDate(searchParams.get("date"));
    if (fromUrl) setScanDate(fromUrl);
  }, [searchParams, setScanDate]);

  return (
    <div className="min-h-full bg-slate-50/80 px-4 pb-16 pt-4 md:px-6 md:pt-6">
      <div className="mx-auto max-w-[1100px] space-y-12 md:space-y-16">
        <section className="rounded-2xl border border-slate-200/80 bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-orange">
            Be the star of every innings
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-brand-navy md:text-4xl">
            Trade and analyse with clarity.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            Portfolio overview, NIFTY 50 market scanners, sector views, and
            charts — powered by your Kite session. Built for traders who want a
            fast, focused workspace.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {FEATURE_PILLS.map((label) => (
              <li
                key={label}
                className="flex items-center gap-3 rounded-full border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-brand-orange"
                  aria-hidden
                />
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-slate-500">
            Live margins, holdings, and open positions are on the{" "}
            <Link
              to="/positions"
              className="font-semibold text-brand-navy underline decoration-brand-orange/40 underline-offset-2 hover:text-brand-orange"
            >
              Positions
            </Link>{" "}
            page.
          </p>
        </section>

        <ScannerShowcaseRow
          label="Scanner detail"
          title="5 Min Breakout"
          description="First five-minute candle range breakout strategy overview. This preview keeps the same home theme for a consistent experience — open the live scanner when the market is active."
          previewTitle="5 Min Breakout"
          previewSubtitle="First candle range breakout preview"
          preview={<LineChartPreview />}
          liveTo="/nifty50-930-breakout"
        />

        <ScannerShowcaseRow
          label="Scanner detail"
          title="9:20 Breakout"
          description="09:20 breakout level based scan description. Use the live page during session hours for actual levels; this card mirrors the marketing layout from Home."
          previewTitle="9:20 Breakout"
          previewSubtitle="Early momentum confirmation snapshot"
          preview={<BarChartPreview />}
          liveTo="/nifty50-920-breakout"
        />

        <ScannerShowcaseRow
          label="Scanner detail"
          title="CE / PE bias"
          description="Call/Put side strength interpretation with a clear visual cue. Jump to the live bias page for option-chain context tied to your session."
          previewTitle="CE / PE Bias"
          previewSubtitle="Call vs Put pressure visual"
          preview={<CePePreview />}
          liveTo="/nifty-option-bias"
        />
      </div>
    </div>
  );
};

export default Dashboard;
