import React, { useCallback, useEffect, useState } from "react";
import API from "../services/api";

type SettingRow = {
  id: number;
  field_name: string;
  field_value: string;
  created_at?: string;
  updated_at?: string;
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

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await API.get<{ settings: SettingRow[] }>(
        "/api/admin/settings"
      );
      setSettings(res.data.settings ?? []);
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
      <div className="px-4 py-8 text-sm text-slate-600">Loading settings…</div>
    );
  }

  return (
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
  );
};

export default AdminSettings;
