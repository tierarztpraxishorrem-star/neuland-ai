"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Section, Button, Badge, Input, SelectInput } from "../../../components/ui/System";

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

const STATUS_COLORS: Record<AbsenceStatus, { tone: 'default' | 'accent' | 'success' | 'danger' }> = {
  pending: { tone: 'accent' },
  approved: { tone: 'success' },
  rejected: { tone: 'danger' },
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
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding, fontFamily: "inherit" }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Abwesenheiten</h1>
        </div>

        {error && (
          <Card style={{ border: "1px solid #fecaca", background: "#fff1f2" }}>
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          </Card>
        )}

        <Section title="Neuer Antrag">
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <SelectInput label="Typ" value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
                {(Object.keys(TYPE_LABELS) as AbsenceType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </SelectInput>
              <div />
              <Input label="Von" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
              <Input label="Bis" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
            </div>
            <Input label="Notiz (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Familienurlaub" />
            <div>
              <Button variant="primary" type="submit" disabled={submitting || !startsOn || !endsOn}>
                {submitting ? "Wird eingereicht…" : "Antrag einreichen"}
              </Button>
            </div>
          </form>
        </Section>

        <Section title="Meine Abwesenheiten">
          {loading ? <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Laden…</div> : absences.length === 0 ? (
            <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Abwesenheiten vorhanden.</div>
          ) : (
            absences.map((a) => (
              <Card key={a.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{TYPE_LABELS[a.type] || a.type}</div>
                    <div style={{ fontSize: 12, color: uiTokens.textSecondary, marginTop: 2 }}>
                      {formatDate(a.starts_on)} – {formatDate(a.ends_on)}
                      {a.note && <span style={{ marginLeft: 8, fontStyle: "italic" }}>{a.note}</span>}
                    </div>
                  </div>
                  <Badge tone={STATUS_COLORS[a.status]?.tone || 'default'}>{STATUS_LABELS[a.status] || a.status}</Badge>
                </div>
              </Card>
            ))
          )}
        </Section>
      </div>
    </main>
  );
}
