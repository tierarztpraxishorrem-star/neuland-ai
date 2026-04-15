"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Group = {
  id: string;
  name: string;
  description?: string | null;
  member_count: number;
};

type Member = {
  employee_id: string;
  display_name: string;
  role: string;
};

type Employee = {
  id: string;
  display_name: string | null;
  user_id: string;
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht angemeldet.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit members
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [membersLoading, setMembersLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth("/api/hr/vacation/groups");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setGroups(data.groups || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetchWithAuth("/api/hr/vacation/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDesc || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Erstellen.");
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(groupId: string) {
    if (!confirm("Gruppe wirklich löschen?")) return;
    try {
      const res = await fetchWithAuth(`/api/hr/vacation/groups/${groupId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Löschen.");
      }
      if (editGroupId === groupId) setEditGroupId(null);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  async function openMembers(groupId: string) {
    setEditGroupId(groupId);
    setMembersLoading(true);
    try {
      const [membersRes, employeesRes] = await Promise.all([
        fetchWithAuth(`/api/hr/vacation/groups/${groupId}/members`),
        fetchWithAuth("/api/hr/absences?list_employees=true"),
      ]);
      const membersData = await membersRes.json();
      const employeesData = await employeesRes.json();
      if (!membersRes.ok)
        throw new Error(membersData.error || "Fehler beim Laden.");
      setMembers(membersData.members || []);
      setAllEmployees(employeesData.employees || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setMembersLoading(false);
    }
  }

  async function addMember() {
    if (!addEmployeeId || !editGroupId) return;
    try {
      const res = await fetchWithAuth(
        `/api/hr/vacation/groups/${editGroupId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: addEmployeeId,
            role: "member",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler.");
      setAddEmployeeId("");
      await openMembers(editGroupId);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  async function toggleRole(employeeId: string, currentRole: string) {
    if (!editGroupId) return;
    const newRole = currentRole === "group_admin" ? "member" : "group_admin";
    try {
      const res = await fetchWithAuth(
        `/api/hr/vacation/groups/${editGroupId}/members`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: employeeId, role: newRole }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler.");
      await openMembers(editGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  async function removeMember(employeeId: string) {
    if (!editGroupId) return;
    try {
      const res = await fetchWithAuth(
        `/api/hr/vacation/groups/${editGroupId}/members`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: employeeId }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler.");
      }
      await openMembers(editGroupId);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  const availableEmployees = allEmployees.filter(
    (e) => !members.some((m) => m.employee_id === e.id)
  );

  return (
    <div className="mx-auto max-w-[800px] space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gruppenverwaltung</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showCreate ? "Abbrechen" : "Neue Gruppe"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Neue Gruppe</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                placeholder="z. B. Tierärzte"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Beschreibung (optional)
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Erstellen…" : "Erstellen"}
            </button>
          </form>
        </div>
      )}

      {/* Groups list */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-gray-500">Laden…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Gruppen vorhanden.</p>
        ) : (
          groups.map((g) => (
            <div
              key={g.id}
              className="rounded-lg border border-black/10 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{g.name}</div>
                  {g.description && (
                    <div className="text-xs text-gray-500">
                      {g.description}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">
                    {g.member_count} Mitglieder
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      editGroupId === g.id
                        ? setEditGroupId(null)
                        : openMembers(g.id)
                    }
                    className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                  >
                    {editGroupId === g.id ? "Schließen" : "Mitglieder"}
                  </button>
                  <button
                    onClick={() => handleDelete(g.id)}
                    className="rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
                    Löschen
                  </button>
                </div>
              </div>

              {/* Members panel */}
              {editGroupId === g.id && (
                <div className="mt-4 border-t pt-4">
                  {membersLoading ? (
                    <p className="text-sm text-gray-500">Laden…</p>
                  ) : (
                    <>
                      {/* Add member */}
                      <div className="mb-3 flex gap-2">
                        <select
                          value={addEmployeeId}
                          onChange={(e) => setAddEmployeeId(e.target.value)}
                          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="">Mitarbeiter auswählen…</option>
                          {availableEmployees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.display_name || e.user_id}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={addMember}
                          disabled={!addEmployeeId}
                          className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          Hinzufügen
                        </button>
                      </div>

                      {/* Members list */}
                      {members.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          Keine Mitglieder.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {members.map((m) => (
                            <div
                              key={m.employee_id}
                              className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
                            >
                              <div className="text-sm">
                                {m.display_name}
                                {m.role === "group_admin" && (
                                  <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                                    Gruppenadmin
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    toggleRole(m.employee_id, m.role)
                                  }
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  {m.role === "group_admin"
                                    ? "Zum Mitglied"
                                    : "Zum Gruppenadmin"}
                                </button>
                                <button
                                  onClick={() => removeMember(m.employee_id)}
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  Entfernen
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
