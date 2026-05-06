import React from "react";
import { Link } from "react-router-dom";

const NotFound: React.FC = () => {
  const hasSession = Boolean(localStorage.getItem("access_token"));

  return (
    <div className="min-h-svh bg-slate-50 px-4 py-12 text-slate-900 md:px-6">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-orange">
          Error 404
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">
          Page not found
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
          The page you are looking for does not exist or may have been moved.
          Please use one of the buttons below to continue.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={hasSession ? "/dashboard" : "/"}
            className="inline-flex rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90"
          >
            {hasSession ? "Go to Dashboard" : "Go to Home"}
          </Link>
          <Link
            to="/login"
            className="inline-flex rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
