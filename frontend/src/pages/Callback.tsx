import { useEffect, useState } from "react";
import API from "../services/api";

const Callback: React.FC = () => {
  const [message, setMessage] = useState("Processing login...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const request_token = params.get("request_token");
    const status = params.get("status");

    console.log("Token:", request_token);
    console.log("Status:", status);

    // Only proceed if login success
    if (status === "success" && request_token) {
      setMessage("Processing login...");

      API.get(`/api/callback?request_token=${request_token}`)
        .then((res) => {
          console.log("API RESPONSE:", res.data);

          // Save token
          localStorage.setItem("access_token", res.data.access_token);

          // Use full-page navigation for production safety (works even if router state is stale).
          window.location.assign(
            `/dashboard?date=${encodeURIComponent(
              new Date().toLocaleDateString("en-CA", {
                timeZone: "Asia/Kolkata",
              })
            )}`
          );

        })
        .catch((err) => {
          console.error("Callback error:", err);
          const backendMessage =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            "Login session expired. Please login again.";
          setMessage(String(backendMessage));
          setTimeout(() => {
            window.location.assign("/login");
          }, 1800);
        });

    } else {
      console.error("Login failed");
      setMessage("Login failed. Redirecting to login...");
      setTimeout(() => {
        window.location.assign("/login");
      }, 1200);
    }

  }, []);

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4 text-slate-600">
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
};

export default Callback;