import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

const Callback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const request_token = params.get("request_token");
    const status = params.get("status");

    console.log("Token:", request_token);
    console.log("Status:", status);

    // Only proceed if login success
    if (status === "success" && request_token) {

      API.get(`/callback?request_token=${request_token}`)
        .then((res) => {
          console.log("API RESPONSE:", res.data);

          // Save token
          localStorage.setItem("access_token", res.data.access_token);

          // 🔥 REDIRECT TO DASHBOARD
          navigate(
            `/dashboard?date=${encodeURIComponent(
              new Date().toLocaleDateString("en-CA", {
                timeZone: "Asia/Kolkata",
              })
            )}`
          );

        })
        .catch((err) => {
          console.error("Callback error:", err);
        });

    } else {
      console.error("Login failed");
    }

  }, [navigate]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4 text-slate-600">
      <p className="text-sm font-medium">Processing login…</p>
    </div>
  );
};

export default Callback;