"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section } from "../../../../components/ui/System";

type TemplateTask = { title: string; category: string; due_offset_days: number };
type Template = {
  id: string;
  name: string;
  description: string | null;
  employee_group: string;
  tasks: TemplateTask[];
  is_active: boolean;
};

const GROUP_LABELS: Record<string, string> = {
  standard: "Standard", tfa: "TFA", tierarzt: "Tierarzt", azubi: "Auszubildende", verwaltung: "Verwaltung", custom: "Benutzerdefiniert",
};

const TASK_CATEGORIES = [
  { value: "documents", label: "Dokumente" },
  { value: "it", label: "IT / Zugänge" },
  { value: "training", label: "Einarbeitung" },
  { value: "equipment", label: "Ausstattung" },
  { value: "introduction", label: "Vorstellung" },
  { value: "other", label: "Sonstiges" },
];

const DEFAULT_TEMPLATES: Record<string, TemplateTask[]> = {
  standard: [
    { title: "Arbeitsvertrag unterschrieben", category: "documents", due_offset_days: 0 },
    { title: "Personalstammblatt ausgefüllt", category: "documents", due_offset_days: 5 },
    { title: "Mitgliedsbescheinigung Krankenkasse", category: "documents", due_offset_days: 10 },
    { title: "Geburtsurkunden Kinder + Steuer-ID", category: "documents", due_offset_days: 10 },
    { title: "Zugänge eingerichtet (E-Mail, System)", category: "it", due_offset_days: 0 },
    { title: "Arbeitskleidung bereitgestellt", category: "equipment", due_offset_days: 0 },
    { title: "Team-Vorstellung", category: "introduction", due_offset_days: 1 },
  ],
  tfa: [
    { title: "TFA-Urkunde / Helferbrief", category: "documents", due_offset_days: 10 },
    { title: "Röntgenbescheinigung", category: "documents", due_offset_days: 10 },
    { title: "Nachweis Fortbildungsstunden", category: "documents", due_offset_days: 10 },
  ],
  tierarzt: [
    { title: "Approbationsurkunde", category: "documents", due_offset_days: 10 },
    { title: "Röntgenbescheinigung", category: "documents", due_offset_days: 10 },
    { title: "Befreiung Rentenversicherung", category: "documents", due_offset_days: 10 },
    { title: "Mitgliedsbescheinigung Tierärztekammer", category: "documents", due_offset_days: 10 },
    { title: "Mitgliedsnummer Versorgungswerk", category: "documents", due_offset_days: 10 },
    { title: "Nachweis Fortbildungsstunden", category: "documents", due_offset_days: 10 },
  ],
  azubi: [
    { title: "Abschlusszeugnis", category: "documents", due_offset_days: 10 },
    { title: "Erstuntersuchung (JASchG §32, wenn <18)", category: "documents", due_offset_days: 10 },
    { title: "Berufsschultage erfassen", category: "other", due_offset_days: 5 },
  ],
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function AdminOnboardingPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", description: "", employee_group: "standard",
    tasks: [...(DEFAULT_TEMPLATES.standard || [])],
  });
  const [newTask, setNewTask] = useState({ title: "", category: "documents", due_offset_days: 5 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/hr/onboarding/templates");
      if (res?.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGroupChange = (group: string) => {
    const defaults = DEFAULT_TEMPLATES[group] || [];
    setForm((p) => ({ ...p, employee_group: group, tasks: [...defaults] }));
  };

  const addTask = () => {
    if (!newTask.title.trim()) return;
    setForm((p) => ({ ...p, tasks: [...p.tasks, { ...newTask, title: newTask.title.trim() }] }));
    setNewTask({ title: "", category: "documents", due_offset_days: 5 });
  };

  const removeTask = (idx: number) => {
    setForm((p) => ({ ...p, tasks: p.tasks.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name ist erforderlich."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetchWithAuth("/api/hr/onboarding/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowNew(false);
      setForm({ name: "", description: "", employee_group: "standard", tasks: [...(DEFAULT_TEMPLATES.standard || [])] });
      setSuccess("Vorlage erstellt.");
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setSaving(false); }
  };

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Onboarding-Vorlagen</h1>
          <button onClick={() => setShowNew(true)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer" }}>
            + Neue Vorlage
          </button>
        </div>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}
        {success && <Card style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}><div style={{ color: "#16a34a", fontSize: 14 }}>{success}</div></Card>}

        {showNew && (
          <Card style={{ border: `2px solid ${uiTokens.brand}` }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Neue Onboarding-Vorlage</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Name *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="z.B. Onboarding Tierarzt"
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Mitarbeitergruppe</label>
                <select value={form.employee_group} onChange={(e) => handleGroupChange(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, background: "#fff" }}>
                  {Object.entries(GROUP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Beschreibung</label>
              <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
            </div>

            {/* Task list */}
            <div style={{ marginTop: 16, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Aufgaben ({form.tasks.length})</div>
            {form.tasks.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
                <span style={{ flex: 1 }}>{t.title}</span>
                <span style={{ color: uiTokens.textMuted, fontSize: 12 }}>{TASK_CATEGORIES.find((c) => c.value === t.category)?.label}</span>
                <span style={{ color: uiTokens.textMuted, fontSize: 12 }}>{t.due_offset_days}d</span>
                <button onClick={() => removeTask(i)} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 11, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer" }}>x</button>
              </div>
            ))}

            {/* Add task */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, marginTop: 8, alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 11, color: uiTokens.textMuted }}>Neue Aufgabe</label>
                <input value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} placeholder="Aufgabe..."
                  style={{ width: "100%", padding: "4px 6px", borderRadius: 4, border: "1px solid #e5e7eb", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: uiTokens.textMuted }}>Kategorie</label>
                <select value={newTask.category} onChange={(e) => setNewTask((p) => ({ ...p, category: e.target.value }))}
                  style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff" }}>
                  {TASK_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: uiTokens.textMuted }}>Tage</label>
                <input type="number" value={newTask.due_offset_days} min={0} onChange={(e) => setNewTask((p) => ({ ...p, due_offset_days: Number(e.target.value) }))}
                  style={{ width: 50, padding: "4px 6px", borderRadius: 4, border: "1px solid #e5e7eb", fontSize: 13, textAlign: "center" }} />
              </div>
              <button onClick={addTask} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer" }}>+</button>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowNew(false)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer" }}>Abbrechen</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Erstelle..." : "Vorlage erstellen"}
              </button>
            </div>
          </Card>
        )}

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && (
          <Section title={`${templates.length} Vorlagen`}>
            {templates.map((t) => (
              <Card key={t.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                    <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2 }}>
                      {GROUP_LABELS[t.employee_group] || t.employee_group} — {(t.tasks || []).length} Aufgaben
                      {t.description && <span style={{ marginLeft: 8 }}>{t.description}</span>}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {templates.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Noch keine Vorlagen angelegt. Erstelle eine Vorlage für automatische Onboarding-Checklisten.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
