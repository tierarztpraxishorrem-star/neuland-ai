"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section, Button, Badge } from "../../../../components/ui/System";

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
  display_name?: string | null;
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

const STATUS_TONES: Record<AbsenceStatus, "accent" | "success" | "danger"> = {
  pending: "accent",
  approved: "success",
  rejected: "danger",
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
    return emp.display_name || emp.user_id.slice(0, 8) + "…";
  }

  const pending = absences.filter((a) => a.status === "pending");
  const rest = absences.filter((a) => a.status !== "pending");

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>
          Abwesenheitsverwaltung
        </h1>

        {error && (
          <div style={{ padding: 12, borderRadius: uiTokens.radiusCard, border: "1px solid #fca5a5", background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 14, color: uiTokens.textMuted }}>Laden…</p>
        ) : (
          <>
            {/* Pending absences */}
            <Section title={`Ausstehende Anträge (${pending.length})`}>
              {pending.length === 0 ? (
                <p style={{ fontSize: 14, color: uiTokens.textMuted }}>
                  Keine ausstehenden Anträge.
                </p>
              ) : (
                <div style={{ display: "grid", gap: uiTokens.cardGap }}>
                  {pending.map((a) => (
                    <Card key={a.id}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: uiTokens.textPrimary }}>
                            {TYPE_LABELS[a.type] || a.type} –{" "}
                            <span style={{ color: uiTokens.textSecondary }}>
                              {getEmployeeLabel(a.employee_id)}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: uiTokens.textMuted }}>
                            {formatDate(a.starts_on)} – {formatDate(a.ends_on)}
                            {a.note && (
                              <span style={{ marginLeft: 8, fontStyle: "italic" }}>{a.note}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button
                            size="sm"
                            onClick={() => handleStatusChange(a.id, "approved")}
                            disabled={updating === a.id}
                            style={{ background: "#16a34a", borderColor: "#16a34a" }}
                          >
                            Genehmigen
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleStatusChange(a.id, "rejected")}
                            disabled={updating === a.id}
                            style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
                          >
                            Ablehnen
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Section>

            {/* Past absences */}
            <Section title={`Bearbeitete Anträge (${rest.length})`}>
              {rest.length === 0 ? (
                <p style={{ fontSize: 14, color: uiTokens.textMuted }}>
                  Keine bearbeiteten Anträge.
                </p>
              ) : (
                <div style={{ display: "grid", gap: uiTokens.cardGap }}>
                  {rest.map((a) => (
                    <Card key={a.id}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: uiTokens.textPrimary }}>
                            {TYPE_LABELS[a.type] || a.type} –{" "}
                            <span style={{ color: uiTokens.textSecondary }}>
                              {getEmployeeLabel(a.employee_id)}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: uiTokens.textMuted }}>
                            {formatDate(a.starts_on)} – {formatDate(a.ends_on)}
                            {a.note && (
                              <span style={{ marginLeft: 8, fontStyle: "italic" }}>{a.note}</span>
                            )}
                          </div>
                        </div>
                        <Badge tone={STATUS_TONES[a.status] || "accent"}>
                          {STATUS_LABELS[a.status] || a.status}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </main>
  );
}
