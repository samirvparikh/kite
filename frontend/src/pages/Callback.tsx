import { useEffect, useState } from "react";
import API from "../services/api";

const Callback: React.FC = () => {
  const [message, setMessage] = useState("Processing login...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const request_token = params.get("request_token");
    const status = params.get("status");

    if (status === "success" && request_token) {
      setMessage("Processing login...");

      API.get(`/api/callback?request_token=${request_token}`)
        .then(() => {
          window.location.assign(
            `/dashboard?date=${encodeURIComponent(
              new Date().toLocaleDateString("en-CA", {
                timeZone: "Asia/Kolkata",
              })
            )}`
          );

        })
        .catch((err) => {
          const backendMessage =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            "Kite connection failed. Please try again.";
          setMessage(String(backendMessage));
          setTimeout(() => {
            window.location.assign("/login");
          }, 1800);
        });

    } else {
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