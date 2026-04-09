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

function shouldRedirectToHome(error: unknown): boolean {
  const err = error as {
    response?: { status?: number; data?: unknown };
    message?: string;
  };
  const status = err?.response?.status;
  const data = err?.response?.data;
  const message =
    typeof data === "string"
      ? data
      : data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message ?? "")
        : err?.message ?? "";
  const m = message.toLowerCase();

  if (status === 401) return true;
  if (m.includes("incorrect `api_key` or `access_token`")) return true;
  if (m.includes("incorrect api_key or access_token")) return true;
  if (m.includes("token is invalid or has expired")) return true;
  if (m.includes("tokenexception")) return true;
  return false;
}

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (shouldRedirectToHome(error)) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("request_token");
      if (window.location.pathname !== "/") {
        window.location.assign("/");
      }
    }
    return Promise.reject(error);
  }
);

export default API;