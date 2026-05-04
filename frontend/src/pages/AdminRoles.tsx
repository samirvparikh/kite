import React, { useCallback, useEffect, useState } from "react";
import API from "../services/api";
import { useAppShell } from "../context/AppShellContext";

type RoleRow = {
  id: number;
  name: string;
  slug: string;
  permission_count?: number;
};
type PermRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
};

const AdminRoles: React.FC = () => {
  const { refreshSession } = useAppShell();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [allPerms, setAllPerms] = useState<PermRow[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    const r = await API.get<{ roles: RoleRow[] }>("/api/admin/roles");
    setRoles(r.data.roles ?? []);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const p = await API.get<{ permissions: PermRow[] }>(
        "/api/admin/permissions"
      );
      setAllPerms(p.data.permissions ?? []);
      await loadRoles();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Failed to load"
      );
    } finally {
      setLoading(false);
    }
  }, [loadRoles]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  const selectRole = useCallback(
    async (roleId: number) => {
      setSelectedRoleId(roleId);
      setError(null);
      try {
        const res = await API.get<{
          role: { id: number; slug: string };
          permissionIds: number[];
        }>(`/api/admin/roles/${roleId}/permissions`);
        const ids = new Set(res.data.permissionIds ?? []);
        const slugs = new Set(
          allPerms.filter((p) => ids.has(p.id)).map((p) => p.slug)
        );
        setSelectedSlugs(slugs);
      } catch (e) {
        setError(
          (e as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ?? "Failed to load role"
        );
      }
    },
    [allPerms]
  );

  useEffect(() => {
    if (roles.length && selectedRoleId == null) {
      void selectRole(roles[0].id);
    }
  }, [roles, selectedRoleId, selectRole]);

  function toggleSlug(slug: string) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function saveRole() {
    if (selectedRoleId == null) return;
    const role = roles.find((r) => r.id === selectedRoleId);
    if (role?.slug === "admin") {
      setError("Admin role cannot be edited.");
      return;
    }
    const permissionIds = allPerms
      .filter((p) => selectedSlugs.has(p.slug))
      .map((p) => p.id);
    setSaving(true);
    setError(null);
    try {
      await API.put(`/api/admin/roles/${selectedRoleId}/permissions`, {
        permissionIds,
      });
      await loadRoles();
      await refreshSession();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Save failed"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-8 text-sm text-slate-600">Loading…</div>
    );
  }

  return (
    <div className="px-4 pb-10 pt-2 md:px-6">
      <div className="mx-auto max-w-[960px]">
        <h1 className="text-2xl font-bold text-slate-900">
          Roles &amp; permissions
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Choose a role (except Admin, which always has full access), tick the
          permissions it should have, then save.
        </p>
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-1 lg:w-56">
            <div className="text-xs font-semibold uppercase text-slate-500">
              Roles
            </div>
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void selectRole(r.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                  selectedRoleId === r.id
                    ? "border-brand-orange bg-[#f5821f14] text-brand-navy"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>{r.name}</span>
                <span className="text-xs text-slate-500">
                  {r.permission_count ?? "—"}
                </span>
              </button>
            ))}
          </div>

          <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {!selectedRole ? (
              <p className="text-sm text-slate-600">No roles loaded.</p>
            ) : selectedRole.slug === "admin" ? (
              <p className="text-sm text-slate-600">
                <strong>Admin</strong> always has every permission. No checklist
                is shown.
              </p>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-slate-900">
                  {selectedRole.name}
                </h2>
                <ul className="mt-4 max-h-[min(60vh,520px)] space-y-2 overflow-y-auto pr-1">
                  {allPerms.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer gap-3 rounded-lg border border-transparent px-2 py-2 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedSlugs.has(p.slug)}
                          onChange={() => toggleSlug(p.slug)}
                        />
                        <span>
                          <span className="font-medium text-slate-900">
                            {p.name}
                          </span>
                          <span className="ml-2 font-mono text-xs text-slate-500">
                            {p.slug}
                          </span>
                          {p.description ? (
                            <span className="mt-0.5 block text-xs text-slate-600">
                              {p.description}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveRole()}
                  className="mt-4 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white shadow hover:opacity-95 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save permissions"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRoles;
