"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import VacationBudget from "@/components/hr/VacationBudget";

type AbsenceType = "vacation" | "sick" | "special" | "overtime";
type AbsenceStatus = "pending" | "approved" | "rejected";

type Absence = {
  id: string;
  absence_type: AbsenceType;
  start_date: string;
  end_date: string;
  note?: string | null;
  status: AbsenceStatus;
  workdays: number;
  created_at: string;
};

type GroupInfo = {
  id: string;
  name: string;
};

type Entitlement = {
  days_total: number;
  days_carry: number;
  days_used: number;
  days_pending: number;
};

const TYPE_LABELS: Record<AbsenceType, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  special: "Sonderurlaub",
  overtime: "Überstundenabbau",
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

export default function VacationPage() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());

  // Form
  const [absenceType, setAbsenceType] = useState<AbsenceType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [vacRes, entRes] = await Promise.all([
        fetchWithAuth(`/api/hr/vacation?year=${year}`),
        fetchWithAuth(`/api/hr/vacation/entitlement?year=${year}`),
      ]);
      const vacData = await vacRes.json();
      const entData = await entRes.json();
      if (!vacRes.ok) throw new Error(vacData.error || "Fehler beim Laden.");
      if (!entRes.ok) throw new Error(entData.error || "Fehler beim Laden.");
      setAbsences(vacData.absences || []);
      setGroups(vacData.groups || []);
      if (entData.entitlement) setEntitlement(entData.entitlement);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/hr/vacation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          absence_type: absenceType,
          start_date: startDate,
          end_date: endDate,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Erstellen.");
      setStartDate("");
      setEndDate("");
      setNote("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Antrag wirklich löschen?")) return;
    try {
      const res = await fetchWithAuth(`/api/hr/vacation/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Löschen.");
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  return (
    <div className="mx-auto max-w-[800px] space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mein Urlaub</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            ←
          </button>
          <span className="text-sm font-medium">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            →
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Budget */}
      {entitlement && (
        <VacationBudget
          daysTotal={entitlement.days_total}
          daysCarry={entitlement.days_carry}
          daysUsed={entitlement.days_used}
          daysPending={entitlement.days_pending}
        />
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">Meine Gruppen</h2>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/hr/vacation/${g.id}`}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100"
              >
                📅 {g.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Neuer Antrag</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Typ
              </label>
              <select
                value={absenceType}
                onChange={(e) =>
                  setAbsenceType(e.target.value as AbsenceType)
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {(Object.keys(TYPE_LABELS) as AbsenceType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Von
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Bis
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Notiz (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. Familienurlaub"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !startDate || !endDate}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Wird eingereicht…" : "Antrag einreichen"}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Meine Anträge</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Laden…</p>
        ) : absences.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Anträge vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {absences.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">
                    {TYPE_LABELS[a.absence_type] || a.absence_type} –{" "}
                    {formatDate(a.start_date)} bis {formatDate(a.end_date)}
                    <span className="ml-2 text-xs text-gray-500">
                      ({a.workdays} Arbeitstage)
                    </span>
                  </div>
                  {a.note && (
                    <div className="text-xs text-gray-500">{a.note}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status]}`}
                  >
                    {STATUS_LABELS[a.status]}
                  </span>
                  {a.status === "pending" && (
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
