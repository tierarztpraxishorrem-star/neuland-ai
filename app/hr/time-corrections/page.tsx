"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../components/ui/System";

type Correction = {
  id: string;
  work_session_id: string;
  original_started_at: string;
  original_ended_at: string | null;
  requested_started_at: string;
  requested_ended_at: string | null;
  reason: string;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = { pending: "Ausstehend", approved: "Genehmigt", rejected: "Abgelehnt" };
const STATUS_TONE: Record<string, "success" | "accent" | "danger" | undefined> = { approved: "success", pending: "accent", rejected: "danger" };

async function fetchWithAuth(url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
}

function fmtDt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TimeCorrectionPage() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/hr/time-corrections");
      if (!res) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCorrections(data.corrections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Meine Zeitkorrekturen</h1>
        <p style={{ fontSize: 14, color: uiTokens.textSecondary, margin: 0 }}>
          Korrekturanfragen können über die Zeiterfassungs-Seite erstellt werden.
        </p>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}
        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && (
          <Section title="Korrekturanfragen">
            {corrections.map((c) => (
              <Card key={c.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>
                      Original: {fmtDt(c.original_started_at)} – {fmtDt(c.original_ended_at)}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                      Beantragt: {fmtDt(c.requested_started_at)} – {fmtDt(c.requested_ended_at)}
                    </div>
                    <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 4 }}>{c.reason}</div>
                  </div>
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABELS[c.status] || c.status}</Badge>
                </div>
              </Card>
            ))}
            {corrections.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Korrekturanfragen.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
