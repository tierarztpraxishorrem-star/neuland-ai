"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../../components/ui/System";

type Qualification = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  is_required_for_scheduling: boolean;
  counts: { active: number; expired: number; pending: number };
};

const CATEGORY_LABELS: Record<string, string> = {
  certification: "Zertifikat", license: "Lizenz/Berechtigung", training: "Fortbildung", skill: "Fähigkeit",
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function QualificationsPage() {
  const [quals, setQuals] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "certification", description: "", is_required_for_scheduling: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/hr/qualifications");
      if (!res) return;
      const data = await res.json();
      if (res.ok) setQuals(data.qualifications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) { setError("Name ist erforderlich."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetchWithAuth("/api/hr/qualifications", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowForm(false);
      setForm({ name: "", category: "certification", description: "", is_required_for_scheduling: false });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setSaving(false); }
  };

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Qualifikationen</h1>
            <p style={{ fontSize: 14, color: uiTokens.textSecondary, marginTop: 4 }}>{quals.length} Qualifikationstypen</p>
          </div>
          <button onClick={() => setShowForm(true)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer" }}>+ Neue Qualifikation</button>
        </div>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}

        {showForm && (
          <Card style={{ border: `2px solid ${uiTokens.brand}` }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Neue Qualifikation</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Name *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Kategorie</label>
                <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, background: "#fff" }}>
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Beschreibung</label>
              <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.is_required_for_scheduling} onChange={(e) => setForm((p) => ({ ...p, is_required_for_scheduling: e.target.checked }))} />
              Für Dienstplanung erforderlich
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer" }}>Abbrechen</button>
              <button onClick={handleCreate} disabled={saving} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Erstelle..." : "Erstellen"}
              </button>
            </div>
          </Card>
        )}

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && (
          <Section title="Qualifikationstypen">
            {quals.map((q) => (
              <Card key={q.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{q.name}</div>
                  <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2, display: "flex", gap: 12 }}>
                    <span>{CATEGORY_LABELS[q.category] || q.category}</span>
                    {q.description && <span>{q.description}</span>}
                    {q.is_required_for_scheduling && <span style={{ color: uiTokens.brand, fontWeight: 500 }}>Dienstplan-relevant</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#16a34a" }}>{q.counts.active} aktiv</span>
                  {q.counts.expired > 0 && <Badge tone="danger">{q.counts.expired} abgelaufen</Badge>}
                  {q.counts.pending > 0 && <Badge tone="accent">{q.counts.pending} Erneuerung</Badge>}
                </div>
              </Card>
            ))}
            {quals.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Noch keine Qualifikationen definiert.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
