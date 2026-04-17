"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../../components/ui/System";

type OvertimeEntry = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  minutes: number;
  reason: string;
  status: string;
  usage_type: string;
};

const STATUS_LABELS: Record<string, string> = { pending: "Ausstehend", approved: "Genehmigt", rejected: "Abgelehnt", cancelled: "Storniert" };
const STATUS_TONE: Record<string, "success" | "accent" | "danger" | undefined> = { approved: "success", pending: "accent", rejected: "danger", cancelled: "danger" };

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function AdminOvertimePage() {
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ admin: "true" });
      if (filter) params.set("status", filter);
      const res = await fetchWithAuth(`/api/hr/overtime?${params}`);
      if (!res) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleDecision = async (id: string, status: string) => {
    try {
      const res = await fetchWithAuth(`/api/hr/overtime/${id}`, {
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

  const handleUsageType = async (id: string, usage_type: string) => {
    try {
      const res = await fetchWithAuth(`/api/hr/overtime/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usage_type }),
      });
      if (!res) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Überstundenverwaltung</h1>

        <Card style={{ display: "flex", gap: 8 }}>
          {["pending", "approved", "rejected", ""].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: filter === s ? 600 : 400,
                background: filter === s ? uiTokens.brand : "#f3f4f6", color: filter === s ? "#fff" : uiTokens.textSecondary,
                border: "1px solid #e5e7eb", cursor: "pointer",
              }}>
              {s ? STATUS_LABELS[s] : "Alle"}
            </button>
          ))}
        </Card>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}
        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && (
          <Section title={`${entries.length} Einträge`}>
            {entries.map((e) => (
              <Card key={e.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{e.employee_name}</div>
                    <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2 }}>
                      {new Date(e.date).toLocaleDateString("de-DE")} — {formatMinutes(e.minutes)}
                    </div>
                    <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2 }}>{e.reason}</div>
                  </div>
                  <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABELS[e.status] || e.status}</Badge>
                </div>
                {e.status === "pending" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={() => handleDecision(e.id, "approved")} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "#16a34a", color: "#fff", border: "none", cursor: "pointer" }}>Genehmigen</button>
                    <button onClick={() => handleDecision(e.id, "rejected")} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "#dc2626", color: "#fff", border: "none", cursor: "pointer" }}>Ablehnen</button>
                  </div>
                )}
                {e.status === "approved" && e.usage_type === "open" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={() => handleUsageType(e.id, "time_off")} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer" }}>Freizeitausgleich</button>
                    <button onClick={() => handleUsageType(e.id, "payout")} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer" }}>Auszahlung</button>
                  </div>
                )}
              </Card>
            ))}
            {entries.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Einträge.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
