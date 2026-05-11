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
  const scannerType =
    (q.get("type") ?? "fno-stocks").trim().toLowerCase() || "fno-stocks";
  const { scanDate, can } = useAppShell();
  const d = encodeURIComponent(scanDate);

  const dash = pathname === "/dashboard";
  const nifty = pathname === "/nifty50-920-breakout";
  const breakout930 = pathname === "/nifty50-930-breakout";
  const optionBias = pathname === "/nifty-option-bias";
  const myTodayChoice = pathname === "/my-today-choice";
  const scan = pathname === "/scanner";
  const adminUsers = pathname === "/admin/users";
  const adminRoles = pathname === "/admin/roles";
  const adminSettings = pathname === "/admin/settings";

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
        {can("menu.dashboard") ? (
          <Item
            to={`/dashboard?date=${d}`}
            active={dash}
            icon={<IconChartBar />}
          >
            Dashboard
          </Item>
        ) : null}
        {can("menu.scanner") ? (
          <>
            <Item
              to={`/scanner?type=my-today-fno&date=${d}`}
              active={scan && scannerType === "my-today-fno"}
              icon={<IconSparkles />}
            >
              My Today F&amp;O
            </Item>
            <Item
              to={`/scanner?type=fno-stocks&date=${d}`}
              active={scan && scannerType === "fno-stocks"}
              icon={<IconLayers />}
            >
              List F&amp;O Stock
            </Item>
            <Item
              to={`/scanner?type=5min-breakout&date=${d}`}
              active={scan && scannerType === "5min-breakout"}
              icon={<IconBolt />}
            >
              5 Min Breakout
            </Item>
          </>
        ) : null}
        {can("menu.nifty920") ? (
          <Item
            to={`/nifty50-920-breakout?date=${d}`}
            active={nifty}
            icon={<IconClock />}
          >
            9:20 Breakout
          </Item>
        ) : null}
        {can("menu.nifty930") ? (
          <Item
            to={`/nifty50-930-breakout?date=${d}`}
            active={breakout930}
            icon={<IconBreak930 />}
          >
            9:30 Breakout
          </Item>
        ) : null}
        {can("menu.optionbias") ? (
          <Item
            to={`/nifty-option-bias?date=${d}`}
            active={optionBias}
            icon={<IconSplit />}
          >
            CE / PE bias
          </Item>
        ) : null}
        {can("menu.mytoday") ? (
          <Item
            to={`/my-today-choice?date=${d}`}
            active={myTodayChoice}
            icon={<IconStar />}
          >
            My Today Choice
          </Item>
        ) : null}

        {(can("admin.users") || can("admin.roles") || can("admin.settings")) && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Administration
            </div>
            {can("admin.users") ? (
              <Item
                to="/admin/users"
                active={adminUsers}
                icon={<IconUsers />}
              >
                Users
              </Item>
            ) : null}
            {can("admin.roles") ? (
              <Item
                to="/admin/roles"
                active={adminRoles}
                icon={<IconShield />}
              >
                Roles &amp; permissions
              </Item>
            ) : null}
            {can("admin.settings") ? (
              <Item
                to="/admin/settings"
                active={adminSettings}
                icon={<IconCog />}
              >
                Settings
              </Item>
            ) : null}
          </div>
        )}
      </nav>

      {/* <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">
        Use header for scan date
      </div> */}
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

function IconChartBar() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
      />
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

function IconUsers() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function IconCog() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}
