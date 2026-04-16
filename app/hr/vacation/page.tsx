"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import VacationBudget from "@/components/hr/VacationBudget";
import { uiTokens, Card, Section, Button, Badge } from "@/components/ui/System";

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
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>
            Mein Urlaub
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => setYear((y) => y - 1)}>
              ←
            </Button>
            <span style={{ fontSize: 14, fontWeight: 500, color: uiTokens.textPrimary }}>{year}</span>
            <Button variant="secondary" size="sm" onClick={() => setYear((y) => y + 1)}>
              →
            </Button>
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, borderRadius: uiTokens.radiusCard, border: "1px solid #fca5a5", background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>
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
          <Card>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: uiTokens.textPrimary, marginBottom: 8 }}>Meine Gruppen</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {groups.map((g) => (
                <Link
                  key={g.id}
                  href={`/hr/vacation/${g.id}`}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 12,
                    border: `1px solid ${uiTokens.brand}33`,
                    background: `${uiTokens.brand}0a`,
                    fontSize: 14,
                    color: uiTokens.brand,
                    textDecoration: "none",
                  }}
                >
                  📅 {g.name}
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* Form */}
        <Section title="Neuer Antrag">
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500, color: uiTokens.textSecondary }}>
                  Typ
                </label>
                <select
                  value={absenceType}
                  onChange={(e) => setAbsenceType(e.target.value as AbsenceType)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: uiTokens.radiusCard,
                    border: uiTokens.cardBorder,
                    fontSize: 14,
                    background: "#fff",
                  }}
                >
                  {(Object.keys(TYPE_LABELS) as AbsenceType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div />
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500, color: uiTokens.textSecondary }}>
                  Von
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: uiTokens.radiusCard,
                    border: uiTokens.cardBorder,
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500, color: uiTokens.textSecondary }}>
                  Bis
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: uiTokens.radiusCard,
                    border: uiTokens.cardBorder,
                    fontSize: 14,
                  }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500, color: uiTokens.textSecondary }}>
                Notiz (optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="z. B. Familienurlaub"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: uiTokens.radiusCard,
                  border: uiTokens.cardBorder,
                  fontSize: 14,
                }}
              />
            </div>
            <div>
              <Button disabled={submitting || !startDate || !endDate} type="submit">
                {submitting ? "Wird eingereicht…" : "Antrag einreichen"}
              </Button>
            </div>
          </form>
        </Section>

        {/* List */}
        <Section title="Meine Anträge">
          {loading ? (
            <p style={{ fontSize: 14, color: uiTokens.textMuted }}>Laden…</p>
          ) : absences.length === 0 ? (
            <p style={{ fontSize: 14, color: uiTokens.textMuted }}>Keine Anträge vorhanden.</p>
          ) : (
            <div style={{ display: "grid", gap: uiTokens.cardGap }}>
              {absences.map((a) => (
                <Card key={a.id}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: uiTokens.textPrimary }}>
                        {TYPE_LABELS[a.absence_type] || a.absence_type} –{" "}
                        {formatDate(a.start_date)} bis {formatDate(a.end_date)}
                        <span style={{ marginLeft: 8, fontSize: 12, color: uiTokens.textMuted }}>
                          ({a.workdays} Arbeitstage)
                        </span>
                      </div>
                      {a.note && (
                        <div style={{ fontSize: 13, color: uiTokens.textMuted }}>{a.note}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge tone={STATUS_TONES[a.status]}>
                        {STATUS_LABELS[a.status]}
                      </Badge>
                      {a.status === "pending" && (
                        <button
                          onClick={() => handleDelete(a.id)}
                          style={{ fontSize: 13, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                        >
                          Löschen
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}
