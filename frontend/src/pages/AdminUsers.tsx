import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "../services/api";
import { useAppShell } from "../context/AppShellContext";

type RoleRow = { id: number; name: string; slug: string };
type UserRow = {
  id: number;
  username: string;
  email: string;
  status?: "Active" | "Inactive" | string | null;
  last_login_date?: string | null;
  role_id: number | null;
  role_slug: string | null;
  role_name: string | null;
  kite_connected: number | boolean;
};

type LoginAttemptLogRow = {
  id: number;
  identifier: string;
  attempted_password_hash?: string | null;
  attempted_password_text?: string | null;
  login_attempt_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
  failure_reason?: string | null;
};

const emptyCreate = {
  username: "",
  email: "",
  password: "",
  roleId: "" as number | "",
};

const AdminUsers: React.FC = () => {
  const { refreshSession, currentUserId } = useAppShell();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [attemptLogsOpen, setAttemptLogsOpen] = useState(false);
  const [attemptLogs, setAttemptLogs] = useState<LoginAttemptLogRow[]>([]);
  const [attemptLogsLoading, setAttemptLogsLoading] = useState(false);
  const [create, setCreate] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({
    username: "",
    email: "",
    roleId: "" as number | "",
    password: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const defaultRoleId = useMemo((): number | null => {
    const u = roles.find((r) => r.slug === "user");
    const id = u?.id ?? roles[0]?.id;
    return typeof id === "number" ? id : null;
  }, [roles]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const uRes = await API.get<{ users: UserRow[]; roles: RoleRow[] }>(
        "/api/admin/users"
      );
      setUsers(uRes.data.users ?? []);
      setRoles(uRes.data.roles ?? []);
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Failed to load"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (createOpen && create.roleId === "" && defaultRoleId != null) {
      setCreate((c) => ({ ...c, roleId: defaultRoleId }));
    }
  }, [createOpen, create.roleId, defaultRoleId]);

  function openEdit(u: UserRow) {
    setEditUser(u);
    setEditForm({
      username: u.username,
      email: u.email,
      roleId: u.role_id ?? "",
      password: "",
    });
    setError(null);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEditSaving(true);
    setError(null);
    try {
      const body: {
        username: string;
        email: string;
        roleId: number;
        password?: string;
      } = {
        username: editForm.username.trim(),
        email: editForm.email.trim().toLowerCase(),
        roleId: Number(editForm.roleId),
      };
      if (!body.username || !body.email) {
        setError("Username and email are required");
        setEditSaving(false);
        return;
      }
      if (!Number.isFinite(body.roleId) || body.roleId <= 0) {
        setError("Choose a role");
        setEditSaving(false);
        return;
      }
      if (editForm.password.trim()) {
        body.password = editForm.password.trim();
      }
      await API.patch(`/api/admin/users/${editUser.id}`, body);
      setEditUser(null);
      await load();
      await refreshSession();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Update failed"
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const roleId =
      create.roleId === "" ? (defaultRoleId ?? NaN) : Number(create.roleId);
    if (!Number.isFinite(roleId) || roleId <= 0) {
      setError("Choose a role");
      setCreating(false);
      return;
    }
    try {
      await API.post("/api/admin/users", {
        username: create.username.trim(),
        email: create.email.trim().toLowerCase(),
        password: create.password,
        roleId,
      });
      setCreate(emptyCreate);
      setCreateOpen(false);
      await load();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Create failed"
      );
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(u: UserRow) {
    if (u.id === currentUserId) return;
    if (
      !window.confirm(
        `Delete user "${u.username}" (${u.email})? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingId(u.id);
    setError(null);
    try {
      await API.delete(`/api/admin/users/${u.id}`);
      await load();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Delete failed"
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-8 text-sm text-slate-600">Loading users…</div>
    );
  }

  function formatLastLogin(value?: string | null) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  }

  async function loadAttemptLogs() {
    setAttemptLogsLoading(true);
    setError(null);
    try {
      const res = await API.get<{ logs: LoginAttemptLogRow[] }>(
        "/api/admin/login-attempt-logs?limit=500"
      );
      setAttemptLogs(res.data?.logs ?? []);
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Failed to load attempt logs"
      );
    } finally {
      setAttemptLogsLoading(false);
    }
  }

  return (
    <div className="px-4 pb-10 pt-2 md:px-6">
      <div className="mx-auto max-w-[960px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Users</h1>
            <p className="mt-1 text-sm text-slate-600">
              Create, edit, and remove accounts. Role permissions are under{" "}
              <strong>Roles &amp; permissions</strong>.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                setAttemptLogsOpen(true);
                await loadAttemptLogs();
              }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Attempt Logs
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateOpen((o) => !o);
                setError(null);
                if (!createOpen) {
                  setCreate({
                    ...emptyCreate,
                    roleId: defaultRoleId == null ? "" : defaultRoleId,
                  });
                }
              }}
              className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90"
            >
              {createOpen ? "Close form" : "Add user"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {createOpen && (
          <form
            onSubmit={submitCreate}
            className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
          >
            <h2 className="text-sm font-semibold text-slate-900">New user</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Username</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={create.username}
                  onChange={(e) =>
                    setCreate((c) => ({ ...c, username: e.target.value }))
                  }
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Email</span>
                <input
                  required
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={create.email}
                  onChange={(e) =>
                    setCreate((c) => ({ ...c, email: e.target.value }))
                  }
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Password</span>
                <input
                  required
                  type="password"
                  minLength={6}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={create.password}
                  onChange={(e) =>
                    setCreate((c) => ({ ...c, password: e.target.value }))
                  }
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Role</span>
                <select
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={create.roleId === "" ? "" : String(create.roleId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCreate((c) => ({
                      ...c,
                      roleId: v === "" ? "" : parseInt(v, 10),
                    }));
                  }}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                {/* <th className="px-4 py-3">Kite</th> */}
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {u.username}
                    {u.id === currentUserId && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        (you)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{u.email}</td>
                  {/* <td className="px-4 py-3">
                    {u.kite_connected ? (
                      <span className="text-emerald-700">Connected</span>
                    ) : (
                      <span className="text-slate-500">Not connected</span>
                    )}
                  </td> */}
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                      {u.role_name || "User"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
                        String(u.status || "Active") === "Active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {String(u.status || "Active")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatLastLogin(u.last_login_date)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={
                          u.id === currentUserId || deletingId === u.id
                        }
                        onClick={() => void onDelete(u)}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {deletingId === u.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editUser && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditUser(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={submitEdit} className="p-5">
              <h2
                id="edit-user-title"
                className="text-lg font-semibold text-slate-900"
              >
                Edit user
              </h2>
              <p className="mt-1 text-xs text-slate-500">ID {editUser.id}</p>
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Username</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={editForm.username}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, username: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Email</span>
                  <input
                    required
                    type="email"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Role</span>
                  <select
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={
                      editForm.roleId === "" ? "" : String(editForm.roleId)
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditForm((f) => ({
                        ...f,
                        roleId: v === "" ? "" : parseInt(v, 10),
                      }));
                    }}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    New password{" "}
                    <span className="font-normal text-slate-500">
                      (optional)
                    </span>
                  </span>
                  <input
                    type="password"
                    minLength={6}
                    placeholder="Leave blank to keep current"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={editForm.password}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, password: e.target.value }))
                    }
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
                >
                  {editSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {attemptLogsOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attempt-logs-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAttemptLogsOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2
                  id="attempt-logs-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Attempt Logs
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Failed login attempts from <code>login_attempt_logs</code>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void loadAttemptLogs()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setAttemptLogsOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Date Time</th>
                    <th className="px-3 py-2">Identifier</th>
                    <th className="px-3 py-2">Password</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">User Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attemptLogsLoading ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={6}>
                        Loading attempt logs...
                      </td>
                    </tr>
                  ) : attemptLogs.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={6}>
                        No logs found.
                      </td>
                    </tr>
                  ) : (
                    attemptLogs.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 text-slate-700">
                          {formatLastLogin(l.login_attempt_at)}
                        </td>
                        <td className="px-3 py-2 text-slate-900">
                          {l.identifier}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {l.attempted_password_text || "-"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {l.failure_reason || "-"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {l.ip_address || "-"}
                        </td>
                        <td className="max-w-[420px] truncate px-3 py-2 text-slate-500">
                          {l.user_agent || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
