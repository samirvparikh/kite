import { useState } from "react";
import { api } from "../api";

export default function LoginPage() {
  const [error, setError] = useState("");

  const onLogin = async () => {
    try {
      const { data } = await api.get("/api/auth/login");
      window.location.href = data.loginUrl;
    } catch (e) {
      setError(e.response?.data?.error || "Unable to start login.");
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 500, margin: "80px auto" }}>
        <h2 style={{ marginTop: 0 }}>Login with Zerodha</h2>
        <button className="btn" onClick={onLogin}>Login to Kite</button>
        {error ? <p className="negative">{error}</p> : null}
      </div>
    </div>
  );
}
