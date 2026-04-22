import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BrandLogo } from "../BrandLogo";
import { useAppShell } from "../../context/AppShellContext";

const linkBase =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors";
const linkIdle =
  "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
const linkActive =
  "bg-[#f5821f14] text-brand-navy ring-1 ring-brand-orange/25 border-l-4 border-l-brand-orange -ml-px pl-[11px]";

type Props = {
  open: boolean;
  onClose: () => void;
};

export const Sidebar: React.FC<Props> = ({ open, onClose }) => {
  const { pathname, search } = useLocation();
  const q = new URLSearchParams(search);
  const scannerType = q.get("type") ?? "sector";
  const { scanDate } = useAppShell();
  const d = encodeURIComponent(scanDate);

  const dash = pathname === "/dashboard";
  const pos = pathname === "/positions";
  const nifty = pathname === "/nifty50-920-breakout";
  const breakout930 = pathname === "/nifty50-930-breakout";
  const optionBias = pathname === "/nifty-option-bias";
  const myTodayChoice = pathname === "/my-today-choice";
  const scan = pathname === "/scanner";

  const Item = ({
    to,
    active,
    children,
    icon,
  }: {
    to: string;
    active: boolean;
    children: React.ReactNode;
    icon: React.ReactNode;
  }) => (
    <Link
      to={to}
      onClick={onClose}
      className={`${linkBase} ${active ? linkActive : linkIdle}`}
    >
      {icon}
      {children}
    </Link>
  );

  return (
    <aside
      className={[
        "fixed left-0 top-0 z-50 flex h-svh w-[min(17rem,88vw)] flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 lg:shadow-none",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      <div className="shrink-0 border-b border-slate-100 px-3 py-3">
        <Link
          to="/"
          onClick={onClose}
          className="block min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 focus-visible:ring-offset-2 rounded-lg"
        >
          <BrandLogo heightClass="h-10" />
          <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wide text-brand-orange">
            Be the star of every innings
          </p>
        </Link>
      </div>

      <div className="border-b border-slate-100 p-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <IconSearch />
          </span>
          <input
            type="search"
            placeholder="Search menus"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-orange focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
            readOnly
            aria-label="Search menus (coming soon)"
          />
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        <Item
          to={`/dashboard?date=${d}`}
          active={dash}
          icon={<IconChartBar />}
        >
          Dashboard
        </Item>
        <Item
          to={`/positions?date=${d}`}
          active={pos}
          icon={<IconTableCells />}
        >
          Positions
        </Item>
        <Item
          to={`/scanner?type=sector&date=${d}`}
          active={scan && scannerType === "sector"}
          icon={<IconLayers />}
        >
          Sector
        </Item>
        <Item
          to={`/scanner?type=top-gainers&date=${d}`}
          active={scan && scannerType === "top-gainers"}
          icon={<IconTrendUp />}
        >
          Top Gainers
        </Item>
        <Item
          to={`/scanner?type=top-losers&date=${d}`}
          active={scan && scannerType === "top-losers"}
          icon={<IconTrendDown />}
        >
          Top Losers
        </Item>
        <Item
          to={`/scanner?type=5min-breakout&date=${d}`}
          active={scan && scannerType === "5min-breakout"}
          icon={<IconBolt />}
        >
          5 Min Breakout
        </Item>
        <Item
          to={`/nifty50-920-breakout?date=${d}`}
          active={nifty}
          icon={<IconClock />}
        >
          9:20 Breakout
        </Item>
        <Item
          to={`/nifty50-930-breakout?date=${d}`}
          active={breakout930}
          icon={<IconBreak930 />}
        >
          9:20 Breakout
        </Item>
        <Item
          to={`/nifty-option-bias?date=${d}`}
          active={optionBias}
          icon={<IconSplit />}
        >
          CE / PE bias
        </Item>
        <Item
          to={`/my-today-choice?date=${d}`}
          active={myTodayChoice}
          icon={<IconStar />}
        >
          My Today Choice
        </Item>
      </nav>

      <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">
        Use header for scan date
      </div>
    </aside>
  );
};

function IconSearch() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function IconTableCells() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125V4.875m0 12.375c0 1.036.84 1.875 1.875 1.875h15.75c1.035 0 1.875-.84 1.875-1.875m-18.75 0V4.875m0 0C3.375 3.839 4.215 3 5.25 3h13.5c1.035 0 1.875.84 1.875 1.875v13.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75h7.5v4.5h-7.5v-4.5Z" />
    </svg>
  );
}

function IconChartBar() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21 12l-4.179 2.25m0 0 4.179 2.25L12 21.75l-9.75-5.25 4.179-2.25m11.142 0-5.571 3-5.571-3" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function IconBreak930() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5 14.25 3m0 0v6.75m0-6.75h-6.75M20.25 10.5 9.75 21m0 0h6.75m-6.75 0V14.25" />
    </svg>
  );
}

function IconTrendUp() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
    </svg>
  );
}

function IconTrendDown() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181" />
    </svg>
  );
}

function IconSplit() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5V3" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m11.48 3.499 2.239 4.537 5.007.728-3.623 3.532.855 4.987-4.478-2.354-4.478 2.354.855-4.987-3.623-3.532 5.007-.728 2.239-4.537Z" />
    </svg>
  );
}
