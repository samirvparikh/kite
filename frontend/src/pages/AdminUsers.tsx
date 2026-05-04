import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "../services/api";
import { useAppShell } from "../context/AppShellContext";

type RoleRow = { id: number; name: string; slug: string };
type UserRow = {
  id: number;
  username: string;
  email: string;
  role_id: number | null;
  role_slug: string | null;
  role_name: string | null;
  kite_connected: number | boolean;
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
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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

  async function onRoleChange(userId: number, roleId: number) {
    setSavingId(userId);
    setError(null);
    try {
      await API.patch(`/api/admin/users/${userId}`, { roleId });
      await load();
      await refreshSession();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Save failed"
      );
    } finally {
      setSavingId(null);
    }
  }

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
            className="shrink-0 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90"
          >
            {createOpen ? "Close form" : "Add user"}
          </button>
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
                <th className="px-4 py-3">Kite</th>
                <th className="px-4 py-3">Role</th>
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
                  <td className="px-4 py-3">
                    {u.kite_connected ? (
                      <span className="text-emerald-700">Connected</span>
                    ) : (
                      <span className="text-slate-500">Not connected</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      value={u.role_id ?? ""}
                      disabled={savingId === u.id}
                      onChange={(ev) => {
                        const v = parseInt(ev.target.value, 10);
                        if (Number.isFinite(v)) void onRoleChange(u.id, v);
                      }}
                    >
                      <option value="" disabled>
                        —
                      </option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
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
    </div>
  );
};

export default AdminUsers;
