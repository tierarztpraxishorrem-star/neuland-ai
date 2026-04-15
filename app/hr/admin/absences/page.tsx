"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type AbsenceType = "vacation" | "sick" | "school" | "other";
type AbsenceStatus = "pending" | "approved" | "rejected";

type Absence = {
  id: string;
  employee_id: string;
  type: AbsenceType;
  starts_on: string;
  ends_on: string;
  note?: string | null;
  status: AbsenceStatus;
  created_at: string;
};

type Employee = {
  id: string;
  user_id: string;
  role: string;
};

const TYPE_LABELS: Record<AbsenceType, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  school: "Berufsschule",
  other: "Sonstiges",
};

const STATUS_LABELS: Record<AbsenceStatus, string> = {
  pending: "Ausstehend",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
};

const STATUS_COLORS: Record<AbsenceStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
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

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminAbsencesPage() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth("/api/debug/system-state");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");

      setEmployees(data.employees || []);

      // Load all absences (admin sees all via RLS)
      const absRes = await fetchWithAuth("/api/hr/absences");
      const absData = await absRes.json();

      // Admin endpoint returns own absences, so we also need to load all via supabase
      // Actually, the admin needs a different approach - load all absences for the practice
      // Using system-state pattern: load via the GET that returns own; for admin we need all
      // For now, let's use a workaround - the admin page will just call the same endpoint
      // but since the admin is also an employee, they only get their own
      // We need to enhance this. Let's load all employees' absences by calling supabase directly.

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Nicht angemeldet.");

      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
          auth: { persistSession: false },
        }
      );

      const { data: allAbsences, error: absError } = await adminSupabase
        .from("absences")
        .select(
          "id, employee_id, type, starts_on, ends_on, note, status, created_at"
        )
        .order("created_at", { ascending: false });

      if (absError) throw new Error(absError.message);
      setAbsences((allAbsences || []) as Absence[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleStatusChange(absenceId: string, newStatus: "approved" | "rejected") {
    setUpdating(absenceId);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/hr/absences/${absenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Aktualisieren.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setUpdating(null);
    }
  }

  function getEmployeeLabel(employeeId: string) {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return employeeId.slice(0, 8) + "…";
    return emp.user_id.slice(0, 8) + "…";
  }

  const pending = absences.filter((a) => a.status === "pending");
  const rest = absences.filter((a) => a.status !== "pending");

  return (
    <div className="mx-auto max-w-[900px] space-y-6 p-4">
      <h1 className="text-2xl font-bold">Abwesenheitsverwaltung</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Laden…</p>
      ) : (
        <>
          {/* Pending absences */}
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">
              Ausstehende Anträge ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-500">
                Keine ausstehenden Anträge.
              </p>
            ) : (
              <div className="space-y-2">
                {pending.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-amber-100 bg-amber-50 p-3"
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">
                        {TYPE_LABELS[a.type] || a.type} –{" "}
                        <span className="text-gray-600">
                          {getEmployeeLabel(a.employee_id)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(a.starts_on)} – {formatDate(a.ends_on)}
                        {a.note && (
                          <span className="ml-2 italic">{a.note}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStatusChange(a.id, "approved")}
                        disabled={updating === a.id}
                        className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Genehmigen
                      </button>
                      <button
                        onClick={() => handleStatusChange(a.id, "rejected")}
                        disabled={updating === a.id}
                        className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Ablehnen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past absences */}
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">
              Bearbeitete Anträge ({rest.length})
            </h2>
            {rest.length === 0 ? (
              <p className="text-sm text-gray-500">
                Keine bearbeiteten Anträge.
              </p>
            ) : (
              <div className="space-y-2">
                {rest.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 p-3"
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">
                        {TYPE_LABELS[a.type] || a.type} –{" "}
                        <span className="text-gray-600">
                          {getEmployeeLabel(a.employee_id)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(a.starts_on)} – {formatDate(a.ends_on)}
                        {a.note && (
                          <span className="ml-2 italic">{a.note}</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] || "bg-gray-100 text-gray-700"}`}
                    >
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
