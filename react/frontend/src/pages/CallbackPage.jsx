import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export default function CallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("request_token");
    if (!token) {
      navigate("/");
      return;
    }
    window.location.href = `${API_BASE}/api/auth/callback?request_token=${encodeURIComponent(token)}`;
  }, [params, navigate]);

  return <div className="container"><p>Authenticating...</p></div>;
}
