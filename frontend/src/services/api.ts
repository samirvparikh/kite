import axios from "axios";

/**
 * Base URL for the Express API (Kite proxy, /login, /callback).
 * - Local: `.env.development` → http://localhost:5000
 * - Production build: `.env.production` → https://inningstar.com
 * Override anytime: `.env.local` or `.env.production.local` (gitignored).
 */
const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000",
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function responseErrorText(
  data: unknown,
  fallbackMessage: string
): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const o = data as { message?: unknown; error?: unknown };
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
  }
  return fallbackMessage;
}

/** Broker / Zerodha API failures — keep user on the page; do not clear app JWT. */
function isKiteOrBrokerApiFailureMessage(text: string): boolean {
  const m = text.toLowerCase();
  return (
    m.includes("kite api not connected") ||
    m.includes("connect zerodha") ||
    m.includes("please connect zerodha") ||
    m.includes("incorrect `api_key` or `access_token`") ||
    m.includes("incorrect api_key or access_token") ||
    m.includes("token is invalid or has expired") ||
    m.includes("tokenexception") ||
    m.includes("incorrect authentication credentials")
  );
}

function requestPath(error: unknown): string {
  const url = String(
    (error as { config?: { url?: string } })?.config?.url ?? ""
  );
  const path = url.includes("://") ? new URL(url).pathname : url.split("?")[0];
  return path;
}

function shouldClearSessionAndRedirect(error: unknown): boolean {
  const err = error as {
    response?: { status?: number; data?: unknown };
    config?: { url?: string };
    message?: string;
  };
  const status = err?.response?.status;
  const data = err?.response?.data;
  const message = responseErrorText(data, err?.message ?? "");
  const path = requestPath(error);

  if (isKiteOrBrokerApiFailureMessage(message)) return false;

  if (status === 403) return false;

  if (path.endsWith("/api/auth/login") || path.endsWith("/api/auth/register")) {
    return false;
  }

  if (status === 401) {
    const m = message.toLowerCase();
    if (m.includes("invalid credentials")) return false;
    if (m.includes("please login first")) return true;
    if (path.endsWith("/api/auth/me")) return true;
    return false;
  }

  return false;
}

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (shouldClearSessionAndRedirect(error)) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("request_token");
      const path = window.location.pathname;
      if (path !== "/login" && path !== "/register") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export default API;