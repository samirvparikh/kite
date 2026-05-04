import { isAxiosError } from "axios";

/** Pull a human-readable message from typical Express / Kite error bodies. */
export function getApiErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const d = err.response?.data;
    if (typeof d === "string") return d;
    if (d && typeof d === "object") {
      const o = d as { message?: unknown; error?: unknown };
      if (typeof o.message === "string") return o.message;
      if (typeof o.error === "string") return o.error;
      try {
        return JSON.stringify(d);
      } catch {
        /* fall through */
      }
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

/** True when the failure is Zerodha/Kite session (stay on page; do not log out app user). */
export function isKiteOrBrokerSessionError(message: string): boolean {
  const m = message.toLowerCase();
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
