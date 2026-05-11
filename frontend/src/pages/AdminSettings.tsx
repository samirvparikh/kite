import React, { useCallback, useEffect, useState } from "react";
import API from "../services/api";

type SettingRow = {
  id: number;
  field_name: string;
  field_value: string;
  created_at?: string;
  updated_at?: string;
};

type KiteSessionRow = {
  id: number;
  kite_user_id: string | null;
  kite_access_token: string | null;
  kite_public_token: string | null;
  refresh_token: string | null;
  updated_at?: string;
};

type KiteSessionForm = {
  kiteUserId: string;
  kiteAccessToken: string;
  kitePublicToken: string;
  refreshToken: string;
};

const REGISTRATION_HINT =
  "Use field name registration_code and field_value as each invite code (exactly 6 characters per value). While at least one row exists, new signups must match a stored code.";

const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [create, setCreate] = useState({ fieldName: "", fieldValue: "" });
  const [editRow, setEditRow] = useState<SettingRow | null>(null);
  const [editForm, setEditForm] = useState({ fieldName: "", fieldValue: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [kiteSession, setKiteSession] = useState<KiteSessionRow | null>(null);
  const [kiteForm, setKiteForm] = useState<KiteSessionForm>({
    kiteUserId: "",
    kiteAccessToken: "",
    kitePublicToken: "",
    refreshToken: "",
  });
  const [kiteError, setKiteError] = useState<string | null>(null);
  const [kiteSaving, setKiteSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const load = useCallback(async () => {
    setError(null);
    setKiteError(null);
    setLoading(true);
    try {
      const [sRes, kRes] = await Promise.allSettled([
        API.get<{ settings: SettingRow[] }>("/api/admin/settings"),
        API.get<{ session: KiteSessionRow }>("/api/admin/kite-global-session"),
      ]);
      if (sRes.status === "fulfilled") {
        setSettings(sRes.value.data.settings ?? []);
      } else {
        const reason = sRes.reason as {
          response?: { data?: { error?: string } };
        };
        setError(reason?.response?.data?.error ?? "Failed to load app settings");
      }
      if (kRes.status === "fulfilled") {
        const sess = kRes.value.data.session;
        setKiteSession(sess);
        setKiteForm({
          kiteUserId: sess.kite_user_id ?? "",
          kiteAccessToken: sess.kite_access_token ?? "",
          kitePublicToken: sess.kite_public_token ?? "",
          refreshToken: sess.refresh_token ?? "",
        });
      } else {
        const reason = kRes.reason as {
          response?: { data?: { error?: string } };
        };
        setKiteSession(null);
        setKiteError(
          reason?.response?.data?.error ?? "Failed to load kite_global_session"
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await API.post("/api/admin/settings", {
        fieldName: create.fieldName.trim(),
        fieldValue: create.fieldValue.trim(),
      });
      setCreate({ fieldName: "", fieldValue: "" });
      setCreateOpen(false);
      await load();
      setToast("Setting row saved.");
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Create failed"
      );
    } finally {
      setCreating(false);
    }
  }

  function openEdit(s: SettingRow) {
    setEditRow(s);
    setEditForm({ fieldName: s.field_name, fieldValue: s.field_value });
    setError(null);
  }

  async function submitEdit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editRow) return;
    setEditSaving(true);
    setError(null);
    try {
      await API.patch(`/api/admin/settings/${editRow.id}`, {
        fieldName: editForm.fieldName.trim(),
        fieldValue: editForm.fieldValue.trim(),
      });
      setEditRow(null);
      await load();
      setToast("Setting updated.");
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Update failed"
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function onDelete(s: SettingRow) {
    if (
      !window.confirm(
        `Delete setting row #${s.id} (${s.field_name})? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingId(s.id);
    setError(null);
    try {
      await API.delete(`/api/admin/settings/${s.id}`);
      await load();
      setToast("Setting deleted.");
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Delete failed"
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function submitKiteSession(ev: React.FormEvent) {
    ev.preventDefault();
    setKiteSaving(true);
    setKiteError(null);
    try {
      const res = await API.patch<{ session: KiteSessionRow }>(
        "/api/admin/kite-global-session",
        {
          kiteUserId: kiteForm.kiteUserId,
          kiteAccessToken: kiteForm.kiteAccessToken,
          kitePublicToken: kiteForm.kitePublicToken,
          refreshToken: kiteForm.refreshToken,
        }
      );
      const sess = res.data.session;
      setKiteSession(sess);
      setKiteForm({
        kiteUserId: sess.kite_user_id ?? "",
        kiteAccessToken: sess.kite_access_token ?? "",
        kitePublicToken: sess.kite_public_token ?? "",
        refreshToken: sess.refresh_token ?? "",
      });
      setToast("Kite session saved.");
    } catch (e) {
      setKiteError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Failed to save kite session"
      );
    } finally {
      setKiteSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-8 text-sm text-slate-600">Loading settings…</div>
    );
  }

  return (
    <>
    <div className="px-4 pb-10 pt-2 md:px-6">
      <div className="mx-auto max-w-[960px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
            <p className="mt-1 text-sm text-slate-600">{REGISTRATION_HINT}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateOpen((o) => !o);
              setError(null);
              if (!createOpen) setCreate({ fieldName: "", fieldValue: "" });
            }}
            className="shrink-0 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90"
          >
            {createOpen ? "Close form" : "Add row"}
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
            <h2 className="text-sm font-semibold text-slate-900">New row</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-1">
                <span className="font-medium text-slate-700">Field name</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={create.fieldName}
                  onChange={(e) =>
                    setCreate((c) => ({ ...c, fieldName: e.target.value }))
                  }
                  placeholder="e.g. registration_code"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm sm:col-span-1">
                <span className="font-medium text-slate-700">Field value</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={create.fieldValue}
                  onChange={(e) =>
                    setCreate((c) => ({ ...c, fieldValue: e.target.value }))
                  }
                  placeholder="e.g. invite code or config value"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {creating ? "Saving…" : "Create"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Field name</th>
                <th className="px-4 py-3">Field value</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settings.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No rows yet. Add field name / value pairs here.
                  </td>
                </tr>
              ) : (
                settings.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {s.id}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {s.field_name}
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-3 text-slate-700" title={s.field_value}>
                      {s.field_value}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === s.id}
                          onClick={() => void onDelete(s)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                        >
                          {deletingId === s.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-10 border-t border-slate-200 pt-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Shared Zerodha session
              </h2>
              <p className="mt-1 font-mono text-xs text-slate-500">
                Table: kite_global_session · row id = 1
              </p>
              <p className="mt-2 max-w-[720px] text-sm text-slate-600">
                Stores the app-wide Kite tokens used for market data. Editing tokens here is
                advanced—normally users connect via <strong>Login → Connect Zerodha</strong>.
                Leave a field empty and save to clear it (NULL). Treat values as secrets.
              </p>
              {kiteSession?.updated_at ? (
                <p className="mt-2 text-xs text-slate-500">
                  Last updated (DB):{" "}
                  <span className="font-medium text-slate-700">
                    {new Date(kiteSession.updated_at).toLocaleString()}
                  </span>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reload session row
            </button>
          </div>

          {kiteError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {kiteError}
            </div>
          )}

          <form
            onSubmit={submitKiteSession}
            className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
          >
            <div className="grid gap-4">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Kite user id</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  value={kiteForm.kiteUserId}
                  onChange={(e) =>
                    setKiteForm((f) => ({ ...f, kiteUserId: e.target.value }))
                  }
                  placeholder="e.g. AB1234"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Kite access token</span>
                <textarea
                  rows={2}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed"
                  value={kiteForm.kiteAccessToken}
                  onChange={(e) =>
                    setKiteForm((f) => ({
                      ...f,
                      kiteAccessToken: e.target.value,
                    }))
                  }
                  placeholder="Optional — max 512 chars"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Kite public token</span>
                <textarea
                  rows={2}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed"
                  value={kiteForm.kitePublicToken}
                  onChange={(e) =>
                    setKiteForm((f) => ({
                      ...f,
                      kitePublicToken: e.target.value,
                    }))
                  }
                  placeholder="Optional — max 512 chars"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Refresh token</span>
                <textarea
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed"
                  value={kiteForm.refreshToken}
                  onChange={(e) =>
                    setKiteForm((f) => ({
                      ...f,
                      refreshToken: e.target.value,
                    }))
                  }
                  placeholder="Optional — used for session refresh"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={kiteSaving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {kiteSaving ? "Saving…" : "Save kite session"}
              </button>
              <p className="self-center text-xs text-slate-500">
                Saving sends all four fields; empty strings clear the column in the database.
              </p>
            </div>
          </form>
        </div>
      </div>

      {editRow && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-setting-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditRow(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={submitEdit} className="p-5">
              <h2
                id="edit-setting-title"
                className="text-lg font-semibold text-slate-900"
              >
                Edit setting
              </h2>
              <p className="mt-1 text-xs text-slate-500">ID {editRow.id}</p>
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Field name</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={editForm.fieldName}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, fieldName: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Field value</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={editForm.fieldValue}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, fieldValue: e.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setEditRow(null)}
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
    {toast ? (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-6 right-6 z-[300] max-w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950 shadow-lg ring-1 ring-emerald-500/10"
      >
        {toast}
      </div>
    ) : null}
    </>
  );
};

export default AdminSettings;
