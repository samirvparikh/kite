import { Link } from "react-router-dom";
import { isKiteOrBrokerSessionError } from "../utils/apiError";

type Props = {
  message: string | null;
  className?: string;
};

/**
 * Shown at the top of app pages when Kite/Zerodha data failed to load.
 * Keeps the user on the route instead of redirecting away.
 */
export default function KiteConnectNotice({ message, className = "" }: Props) {
  if (!message || !isKiteOrBrokerSessionError(message)) return null;
  return (
    <div
      className={`mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 ${className}`}
      role="alert"
    >
      <p className="font-semibold">Zerodha (Kite) session required</p>
      <p className="mt-1 text-amber-900/90">{message}</p>
      <p className="mt-2 text-amber-900/90">
        Your app login is still valid. Use Zerodha login below when needed. If
        Kite returns a refresh token for your app, we save it and renew your
        access token on the next IST trading day automatically.
      </p>
      <Link
        to="/login"
        className="mt-2 inline-block font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
      >
        Go to login → Connect Zerodha
      </Link>
    </div>
  );
}
