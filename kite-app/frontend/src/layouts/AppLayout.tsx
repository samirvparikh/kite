import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AppShellProvider } from "../context/AppShellContext";
import { Sidebar } from "../components/layout/Sidebar";
import { Header } from "../components/layout/Header";

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AppShellProvider>
      <div className="flex h-svh min-h-0 w-full overflow-hidden bg-slate-50 text-slate-800 antialiased">
        <button
          type="button"
          className={[
            "fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden",
            sidebarOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0",
          ].join(" ")}
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        />

        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-[10px]">
            <Outlet />
          </main>
        </div>
      </div>
    </AppShellProvider>
  );
}
