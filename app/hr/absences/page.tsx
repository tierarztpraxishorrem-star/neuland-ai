"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type AbsenceType = "vacation" | "sick" | "school" | "other";
type AbsenceStatus = "pending" | "approved" | "rejected";

type Absence = {
  id: string;
  type: AbsenceType;
  starts_on: string;
  ends_on: string;
  note?: string | null;
  status: AbsenceStatus;
  created_at: string;
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

export default function AbsencesPage() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [type, setType] = useState<AbsenceType>("vacation");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");

  const loadAbsences = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth("/api/hr/absences");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setAbsences(data.absences || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAbsences();
  }, [loadAbsences]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithAuth("/api/hr/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          starts_on: startsOn,
          ends_on: endsOn,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Erstellen.");
      setStartsOn("");
      setEndsOn("");
      setNote("");
      await loadAbsences();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[800px] space-y-6 p-4">
      <h1 className="text-2xl font-bold">Abwesenheiten</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* New absence form */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Neuer Antrag</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Typ
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AbsenceType)}
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
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
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
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
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
            disabled={submitting || !startsOn || !endsOn}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Wird eingereicht…" : "Antrag einreichen"}
          </button>
        </form>
      </div>

      {/* Absence list */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Meine Abwesenheiten</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Laden…</p>
        ) : absences.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Abwesenheiten vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {absences.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 p-3"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">
                    {TYPE_LABELS[a.type] || a.type}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(a.starts_on)} – {formatDate(a.ends_on)}
                    {a.note && <span className="ml-2 italic">{a.note}</span>}
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
    </div>
  );
}
