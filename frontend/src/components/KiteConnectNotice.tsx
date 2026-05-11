import { Link } from "react-router-dom";
import { isKiteOrBrokerSessionError } from "../utils/apiError";

type Props = {
  /** API/page error text; used only to detect Kite-type failures. */
  message?: string | null;
  /** True when /api/auth/me reports Zerodha not connected (shell). */
  shellKiteDisconnected?: boolean;
  className?: string;
};

const TITLE = "Zerodha (Kite) session required";
const BODY_PRIMARY =
  "Kite API not connected. Please connect Zerodha from login page.";
const BODY_SECONDARY =
  "Your app login is still valid. Use Zerodha login below when needed. If Kite returns a refresh token for your app, we save it and renew your access token on the next IST trading day automatically.";
const LINK_LABEL = "Go to login → Connect Zerodha";

/**
 * Shown when Kite/Zerodha session is missing (API error or shell auth check).
 * Keeps the user on the route instead of redirecting away.
 */
export default function KiteConnectNotice({
  message = null,
  shellKiteDisconnected = false,
  className = "",
}: Props) {
  const show =
    shellKiteDisconnected ||
    (message != null &&
      message !== "" &&
      isKiteOrBrokerSessionError(message));
  if (!show) return null;

  return (
    <div
      className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 ${className}`}
      role="alert"
    >
      <p className="font-semibold">{TITLE}</p>
      <p className="mt-1 text-amber-900/90">{BODY_PRIMARY}</p>
      <p className="mt-2 text-amber-900/90">{BODY_SECONDARY}</p>
      <Link
        to="/login"
        className="mt-2 inline-block font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
      >
        {LINK_LABEL}
      </Link>
    </div>
  );
}
