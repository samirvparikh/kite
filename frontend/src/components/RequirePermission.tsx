import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppShell } from "../context/AppShellContext";

type Props = {
  permission: string;
  children: ReactNode;
};

export default function RequirePermission({ permission, children }: Props) {
  const navigate = useNavigate();
  const { can, sessionReady } = useAppShell();

  useEffect(() => {
    if (!sessionReady) return;
    if (!localStorage.getItem("access_token")) {
      navigate("/login", { replace: true });
    }
  }, [sessionReady, navigate]);

  if (!sessionReady) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-600">
        Loading…
      </div>
    );
  }

  if (!can(permission)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600">
          You do not have permission for this page. Ask an administrator to grant
          the <code className="rounded bg-slate-100 px-1">{permission}</code>{" "}
          permission for your role.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
