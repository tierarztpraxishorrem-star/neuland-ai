"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../../components/ui/System";

type Correction = {
  id: string;
  employee_id: string;
  employee_name: string;
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

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

function fmtDt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminTimeCorrectionPage() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/hr/time-corrections?admin=true");
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

  const handleDecision = async (id: string, status: string) => {
    try {
      const res = await fetchWithAuth(`/api/hr/time-corrections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  };

  const pending = corrections.filter((c) => c.status === "pending");
  const handled = corrections.filter((c) => c.status !== "pending");

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Zeitkorrekturen</h1>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}
        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && pending.length > 0 && (
          <Section title={`Offene Anfragen (${pending.length})`}>
            {pending.map((c) => (
              <Card key={c.id} style={{ padding: 16, border: "1px solid #fde68a", background: "#fffbeb" }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{c.employee_name}</div>
                <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 4 }}>
                  Original: {fmtDt(c.original_started_at)} – {fmtDt(c.original_ended_at)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                  Beantragt: {fmtDt(c.requested_started_at)} – {fmtDt(c.requested_ended_at)}
                </div>
                <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 4 }}>{c.reason}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => handleDecision(c.id, "approved")} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "#16a34a", color: "#fff", border: "none", cursor: "pointer" }}>Genehmigen</button>
                  <button onClick={() => handleDecision(c.id, "rejected")} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "#dc2626", color: "#fff", border: "none", cursor: "pointer" }}>Ablehnen</button>
                </div>
              </Card>
            ))}
          </Section>
        )}

        {!loading && (
          <Section title="Bearbeitete Anfragen">
            {handled.map((c) => (
              <Card key={c.id} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.employee_name}</div>
                  <div style={{ fontSize: 12, color: uiTokens.textSecondary, marginTop: 2 }}>
                    {fmtDt(c.requested_started_at)} – {fmtDt(c.requested_ended_at)}
                  </div>
                  <div style={{ fontSize: 12, color: uiTokens.textSecondary }}>{c.reason}</div>
                </div>
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABELS[c.status]}</Badge>
              </Card>
            ))}
            {handled.length === 0 && pending.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Korrekturanfragen.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
