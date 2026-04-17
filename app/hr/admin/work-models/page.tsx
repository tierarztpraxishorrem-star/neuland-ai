"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../../components/ui/System";

type WorkModel = {
  id: string;
  name: string;
  type: string;
  weekly_hours: number;
  daily_hours_target: number | null;
  work_days: number[];
  break_rules: { after_hours: number; break_minutes: number }[];
  night_shift: boolean;
  weekend_work: boolean;
  holiday_work: boolean;
  is_active: boolean;
};

type FormData = {
  name: string;
  type: string;
  weekly_hours: string;
  daily_hours_target: string;
  work_days: number[];
  night_shift: boolean;
  weekend_work: boolean;
  holiday_work: boolean;
};

const WEEKDAYS = [
  { value: 1, label: "Mo" }, { value: 2, label: "Di" }, { value: 3, label: "Mi" },
  { value: 4, label: "Do" }, { value: 5, label: "Fr" }, { value: 6, label: "Sa" }, { value: 7, label: "So" },
];

const TYPE_LABELS: Record<string, string> = {
  vollzeit: "Vollzeit", teilzeit: "Teilzeit", minijob: "Minijob",
  azubi: "Azubi", schicht: "Schicht", custom: "Benutzerdefiniert",
};

const emptyForm: FormData = {
  name: "", type: "vollzeit", weekly_hours: "40", daily_hours_target: "8",
  work_days: [1, 2, 3, 4, 5], night_shift: false, weekend_work: false, holiday_work: false,
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function WorkModelsPage() {
  const [models, setModels] = useState<WorkModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/hr/work-models?active=false");
      if (!res) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setModels(data.models || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (m: WorkModel) => {
    setEditId(m.id);
    setForm({
      name: m.name,
      type: m.type,
      weekly_hours: String(m.weekly_hours),
      daily_hours_target: m.daily_hours_target ? String(m.daily_hours_target) : "",
      work_days: Array.isArray(m.work_days) ? m.work_days : [1, 2, 3, 4, 5],
      night_shift: m.night_shift,
      weekend_work: m.weekend_work,
      holiday_work: m.holiday_work,
    });
    setShowForm(true);
  };

  const openNew = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };

  const toggleWorkDay = (day: number) => {
    setForm((p) => ({
      ...p,
      work_days: p.work_days.includes(day)
        ? p.work_days.filter((d) => d !== day)
        : [...p.work_days, day].sort(),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Modellname ist erforderlich."); return; }
    setSaving(true);
    setError(null);
    try {
      const url = editId ? `/api/hr/work-models/${editId}` : "/api/hr/work-models";
      const method = editId ? "PATCH" : "POST";
      const payload = {
        name: form.name,
        type: form.type,
        weekly_hours: Number(form.weekly_hours),
        daily_hours_target: form.daily_hours_target ? Number(form.daily_hours_target) : null,
        work_days: form.work_days,
        night_shift: form.night_shift,
        weekend_work: form.weekend_work,
        holiday_work: form.holiday_work,
      };
      const res = await fetchWithAuth(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: WorkModel) => {
    try {
      const res = await fetchWithAuth(`/api/hr/work-models/${m.id}`, {
        method: m.is_active ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: m.is_active ? undefined : JSON.stringify({ is_active: true }),
      });
      if (!res) return;
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  };

  const formatWorkDays = (days: number[]) =>
    (Array.isArray(days) ? days : []).map((d) => WEEKDAYS.find((w) => w.value === d)?.label || "?").join(", ");

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Arbeitszeitmodelle</h1>
            <p style={{ marginTop: 4, fontSize: 14, color: uiTokens.textSecondary }}>{models.filter((m) => m.is_active).length} aktive Modelle</p>
          </div>
          <button onClick={openNew} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer" }}>
            + Neues Modell
          </button>
        </div>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}

        {showForm && (
          <Card style={{ border: `2px solid ${uiTokens.brand}` }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{editId ? "Modell bearbeiten" : "Neues Arbeitszeitmodell"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Name *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Typ *</label>
                <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, background: "#fff" }}>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Wochenstunden *</label>
                <input type="number" step="0.5" value={form.weekly_hours} onChange={(e) => setForm((p) => ({ ...p, weekly_hours: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Tagesstunden (Soll)</label>
                <input type="number" step="0.5" value={form.daily_hours_target} onChange={(e) => setForm((p) => ({ ...p, daily_hours_target: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 8 }}>Arbeitstage</label>
              <div style={{ display: "flex", gap: 6 }}>
                {WEEKDAYS.map((wd) => (
                  <button key={wd.value} type="button" onClick={() => toggleWorkDay(wd.value)}
                    style={{
                      padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer",
                      background: form.work_days.includes(wd.value) ? uiTokens.brand : "#f3f4f6",
                      color: form.work_days.includes(wd.value) ? "#fff" : uiTokens.textSecondary,
                      border: "1px solid #e5e7eb",
                    }}>
                    {wd.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
              {([["night_shift", "Nachtarbeit"], ["weekend_work", "Wochenendarbeit"], ["holiday_work", "Feiertagsarbeit"]] as const).map(([key, label]) => (
                <label key={key} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer" }}>Abbrechen</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Speichere..." : "Speichern"}
              </button>
            </div>
          </Card>
        )}

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && (
          <Section title="Modelle">
            {models.map((m) => (
              <Card key={m.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", opacity: m.is_active ? 1 : 0.6 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{m.name}</div>
                  <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2, display: "flex", gap: 12 }}>
                    <span>{TYPE_LABELS[m.type] || m.type}</span>
                    <span>{m.weekly_hours}h/Woche</span>
                    {m.daily_hours_target && <span>{m.daily_hours_target}h/Tag</span>}
                    <span>{formatWorkDays(m.work_days)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge tone={m.is_active ? "success" : "danger"}>{m.is_active ? "Aktiv" : "Inaktiv"}</Badge>
                  <button onClick={() => openEdit(m)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer" }}>Bearbeiten</button>
                  <button onClick={() => toggleActive(m)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, background: m.is_active ? "#fef2f2" : "#f0fdf4", color: m.is_active ? "#dc2626" : "#16a34a", border: "1px solid #e5e7eb", cursor: "pointer" }}>
                    {m.is_active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </div>
              </Card>
            ))}
            {models.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Noch keine Arbeitszeitmodelle angelegt.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
