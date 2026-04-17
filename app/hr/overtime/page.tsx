"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../components/ui/System";

type OvertimeEntry = {
  id: string;
  date: string;
  minutes: number;
  reason: string;
  status: string;
  usage_type: string;
  created_at: string;
};

type Balance = {
  total_approved_minutes: number;
  used_time_off_minutes: number;
  used_payout_minutes: number;
  balance_minutes: number;
};

const STATUS_LABELS: Record<string, string> = { pending: "Ausstehend", approved: "Genehmigt", rejected: "Abgelehnt", cancelled: "Storniert" };
const STATUS_TONE: Record<string, "success" | "accent" | "danger" | undefined> = { approved: "success", pending: "accent", rejected: "danger", cancelled: "danger" };
const USAGE_LABELS: Record<string, string> = { open: "Offen", time_off: "Freizeitausgleich", payout: "Auszahlung" };

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

export default function OvertimePage() {
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: "", hours: "", mins: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/hr/overtime");
      if (!res) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntries(data.entries || []);
      setBalance(data.balance || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalMinutes = (Number(form.hours) || 0) * 60 + (Number(form.mins) || 0);

  const handleSubmit = async () => {
    if (!form.date || totalMinutes <= 0 || !form.reason.trim()) {
      setError("Datum, Dauer und Begründung sind erforderlich."); return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/hr/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.date, minutes: totalMinutes, reason: form.reason }),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowForm(false);
      setForm({ date: "", hours: "", mins: "", reason: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Überstunden</h1>
          <button onClick={() => setShowForm(!showForm)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer" }}>
            + Überstunden einreichen
          </button>
        </div>

        {balance && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            <Card><div style={{ fontSize: 12, color: uiTokens.textSecondary }}>Genehmigt</div><div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{formatMinutes(balance.total_approved_minutes)}</div></Card>
            <Card><div style={{ fontSize: 12, color: uiTokens.textSecondary }}>Freizeitausgleich</div><div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{formatMinutes(balance.used_time_off_minutes)}</div></Card>
            <Card><div style={{ fontSize: 12, color: uiTokens.textSecondary }}>Auszahlung</div><div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{formatMinutes(balance.used_payout_minutes)}</div></Card>
            <Card style={{ border: "2px solid " + uiTokens.brand }}><div style={{ fontSize: 12, color: uiTokens.textSecondary }}>Guthaben</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: uiTokens.brand }}>{formatMinutes(balance.balance_minutes)}</div></Card>
          </div>
        )}

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}

        {showForm && (
          <Card style={{ border: `2px solid ${uiTokens.brand}` }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Überstunden einreichen</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Datum *</label>
                <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Stunden</label>
                <input type="number" min="0" max="23" placeholder="0" value={form.hours} onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Minuten</label>
                <input type="number" min="0" max="59" step="5" placeholder="0" value={form.mins} onChange={(e) => setForm((p) => ({ ...p, mins: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>
            {totalMinutes > 0 && (
              <div style={{ fontSize: 13, color: uiTokens.brand, marginTop: 4, fontWeight: 500 }}>
                = {formatMinutes(totalMinutes)}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Begründung *</label>
              <textarea value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} rows={2}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer" }}>Abbrechen</button>
              <button onClick={handleSubmit} disabled={saving} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Wird eingereicht..." : "Einreichen"}
              </button>
            </div>
          </Card>
        )}

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && (
          <Section title="Meine Überstunden">
            {entries.map((e) => (
              <Card key={e.id} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{new Date(e.date).toLocaleDateString("de-DE")} — {formatMinutes(e.minutes)}</div>
                  <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2 }}>{e.reason}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {e.status === "approved" && <span style={{ fontSize: 12, color: uiTokens.textMuted }}>{USAGE_LABELS[e.usage_type]}</span>}
                  <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABELS[e.status] || e.status}</Badge>
                </div>
              </Card>
            ))}
            {entries.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Überstunden-Einträge.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
