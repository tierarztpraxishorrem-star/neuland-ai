"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Absence = {
  id: string;
  employee_id: string;
  employee_name: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  note?: string | null;
  status: string;
  workdays: number;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  special: "Sonderurlaub",
  overtime: "Überstundenabbau",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ausstehend",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
};

const STATUS_COLORS: Record<string, string> = {
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

export default function AdminVacationPage() {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const loadAbsences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Use admin absences endpoint with status filter
      const statusParam = tab === "pending" ? "&status=pending" : "";
      const res = await fetchWithAuth(
        `/api/hr/absences?admin=true${statusParam}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setAbsences(data.absences || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    loadAbsences();
  }, [loadAbsences]);

  async function handleAction(id: string, status: "approved" | "rejected") {
    setActing(id);
    try {
      const res = await fetchWithAuth(`/api/hr/vacation/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler.");
      await loadAbsences();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 p-4">
      <h1 className="text-2xl font-bold">Urlaubsverwaltung</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab("pending")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "pending"
              ? "bg-white shadow-sm"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Offene Anträge
        </button>
        <button
          onClick={() => setTab("all")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "all"
              ? "bg-white shadow-sm"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Alle Anträge
        </button>
      </div>

      {/* List */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        {loading ? (
          <p className="text-sm text-gray-500">Laden…</p>
        ) : absences.length === 0 ? (
          <p className="text-sm text-gray-500">
            {tab === "pending"
              ? "Keine offenen Anträge."
              : "Keine Anträge vorhanden."}
          </p>
        ) : (
          <div className="space-y-3">
            {absences.map((a) => (
              <div
                key={a.id}
                className="rounded-md border border-gray-200 p-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {a.employee_name || "Mitarbeiter"}
                    </div>
                    <div className="text-sm text-gray-700">
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
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] || ""}`}
                    >
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                    {a.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleAction(a.id, "approved")}
                          disabled={acting === a.id}
                          className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Genehmigen
                        </button>
                        <button
                          onClick={() => handleAction(a.id, "rejected")}
                          disabled={acting === a.id}
                          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Ablehnen
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
