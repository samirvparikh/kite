import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

export type MeUser = {
  id: number;
  username: string;
  email: string;
  kiteConnected: boolean;
  role?: { slug: string; name: string };
  permissions?: string[];
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
  /** True after first /api/auth/me attempt finishes (success or failure). */
  sessionReady: boolean;
  /** Signed-in app user id from /api/auth/me (null if not loaded). */
  currentUserId: number | null;
  roleSlug: string;
  permissions: string[];
  can: (slug: string) => boolean;
  refreshSession: () => Promise<void>;
};

const AppShellContext = createContext<ShellCtx | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ShellProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<SessionAuthStatus>("loading");
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [scanDate, setScanDateState] = useState(istToday);
  const [sessionReady, setSessionReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [roleSlug, setRoleSlug] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);

  const setScanDate = useCallback((v: string) => {
    setScanDateState(v);
  }, []);

  const can = useCallback(
    (slug: string) => {
      if (roleSlug === "admin") return true;
      return permissions.includes(slug);
    },
    [roleSlug, permissions]
  );

  const loadSession = useCallback(async () => {
    setAuthStatus("loading");
    setAuthErrorMessage(null);
    setSessionReady(false);
    setCurrentUserId(null);
    setRoleSlug("");
    setPermissions([]);

    const token = localStorage.getItem("access_token");
    if (!token) {
      setProfile(null);
      setAuthStatus("failed");
      setAuthErrorMessage("Not signed in");
      setProfileLoading(false);
      setSessionReady(true);
      return;
    }

    try {
      const me = await API.get<{ user: MeUser }>("/api/auth/me");
      const user = me.data?.user;
      if (!user) {
        setProfile(null);
        setAuthStatus("failed");
        setAuthErrorMessage("No user data");
        setSessionReady(true);
        return;
      }
      const rSlug = user.role?.slug ?? "user";
      setRoleSlug(rSlug);
      setPermissions(Array.isArray(user.permissions) ? user.permissions : []);
      setCurrentUserId(user.id);
      if (!user.kiteConnected) {
        setProfile({
          user_name: user.username,
          email: user.email,
          user_id: user.username,
        });
        setAuthStatus("failed");
        setAuthErrorMessage("Zerodha (Kite) session required");
        setSessionReady(true);
        return;
      }
      const profileRes = await API.get<{ data: ShellProfile }>(
        "/api/kite/user/profile"
      );
      const p = profileRes.data?.data ?? null;
      // Kite profile carries the Zerodha account email; keep app login email for UI identity.
      setProfile(
        p ? { ...p, email: user.email, user_name: user.username } : null
      );
      setAuthStatus(p ? "ok" : "failed");
      if (!p) setAuthErrorMessage("No profile data");
      setSessionReady(true);
    } catch (err: unknown) {
      setProfile(null);
      setCurrentUserId(null);
      setAuthStatus("failed");
      let msg: string | null = null;
      if (isAxiosError(err)) {
        const d = err.response?.data;
        if (d && typeof d === "object" && "message" in d) {
          msg = String((d as { message: unknown }).message);
        } else if (d && typeof d === "object" && "error" in d) {
          msg = String((d as { error: unknown }).error);
        } else if (typeof d === "string") msg = d;
      }
      setAuthErrorMessage(msg ?? "Session invalid");
      setSessionReady(true);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const refreshSession = useCallback(async () => {
    setProfileLoading(true);
    await loadSession();
  }, [loadSession]);

  const value: ShellCtx = useMemo(
    () => ({
      profile,
      profileLoading,
      authStatus,
      authErrorMessage,
      scanDate,
      setScanDate,
      sessionReady,
      currentUserId,
      roleSlug,
      permissions,
      can,
      refreshSession,
    }),
    [
      profile,
      profileLoading,
      authStatus,
      authErrorMessage,
      scanDate,
      setScanDate,
      sessionReady,
      currentUserId,
      roleSlug,
      permissions,
      can,
      refreshSession,
    ]
  );

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
