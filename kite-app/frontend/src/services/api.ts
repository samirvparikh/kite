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

export default API;