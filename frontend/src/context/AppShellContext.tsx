import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { isAxiosError } from "axios";
import API from "../services/api";

export type ShellProfile = {
  user_name?: string;
  user_id?: string;
  broker?: string;
  email?: string;
};

export function istToday(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

export function parseDashDate(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export type SessionAuthStatus = "loading" | "ok" | "failed";

type ShellCtx = {
  profile: ShellProfile | null;
  profileLoading: boolean;
  authStatus: SessionAuthStatus;
  authErrorMessage: string | null;
  scanDate: string;
  setScanDate: (v: string) => void;
};

const AppShellContext = createContext<ShellCtx | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ShellProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<SessionAuthStatus>("loading");
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [scanDate, setScanDateState] = useState(istToday);

  const setScanDate = useCallback((v: string) => {
    setScanDateState(v);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAuthStatus("loading");
    setAuthErrorMessage(null);
    API.get<{ data: ShellProfile }>("/api/kite/user/profile")
      .then((r) => {
        if (cancelled) return;
        const p = r.data?.data ?? null;
        setProfile(p);
        setAuthStatus(p ? "ok" : "failed");
        if (!p) setAuthErrorMessage("No profile data");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProfile(null);
        setAuthStatus("failed");
        let msg: string | null = null;
        if (isAxiosError(err)) {
          const d = err.response?.data;
          if (d && typeof d === "object" && "message" in d) {
            msg = String((d as { message: unknown }).message);
          } else if (typeof d === "string") msg = d;
        }
        setAuthErrorMessage(msg ?? "Session invalid");
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value: ShellCtx = {
    profile,
    profileLoading,
    authStatus,
    authErrorMessage,
    scanDate,
    setScanDate,
  };

  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used within AppShellProvider");
  return ctx;
}
