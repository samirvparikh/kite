import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import API from "../services/api";

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await API.post<{ token: string }>("/api/auth/register", {
        username,
        email,
        password,
      });
      localStorage.setItem("access_token", res.data.token);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Registration failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-slate-100/80 text-slate-900 antialiased">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
            <BrandLogo heightClass="h-8" />
          </Link>
          <Link to="/login" className="text-sm font-medium text-brand-navy hover:text-brand-orange">
            Login
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:py-14">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-8">
          <h1 className="text-xl font-bold text-slate-800">Create Account</h1>
          <p className="mt-2 text-sm text-slate-600">
            Register with username, email and password.
          </p>

          <form onSubmit={handleRegister} className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-orange"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-orange"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-orange"
                minLength={6}
                required
              />
            </div>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Register;
