"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../../components/ui/System";

type OffboardingTask = { id: string; title: string; category: string; done: boolean };
type OffboardingProcess = {
  id: string;
  employee_id: string;
  employee_name: string;
  status: string;
  last_working_day: string | null;
  remaining_vacation_days: number | null;
  overtime_balance_minutes: number | null;
  notes: string | null;
  created_at: string;
  offboarding_tasks: OffboardingTask[];
};

type Employee = { id: string; display_name: string | null; first_name: string | null; last_name: string | null; employment_status: string };

const STATUS_LABELS: Record<string, string> = { active: "Aktiv", completed: "Abgeschlossen", cancelled: "Abgebrochen" };
const STATUS_TONE: Record<string, "success" | "accent" | "danger" | undefined> = { active: "accent", completed: "success", cancelled: "danger" };

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function OffboardingPage() {
  const [processes, setProcesses] = useState<OffboardingProcess[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ employee_id: "", last_working_day: "", exit_reason: "" });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [procRes, empRes] = await Promise.all([
        fetchWithAuth("/api/hr/offboarding"),
        fetchWithAuth("/api/hr/employees?status=active"),
      ]);
      if (procRes?.ok) { const d = await procRes.json(); setProcesses(d.processes || []); }
      if (empRes?.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newForm.employee_id) { setError("Bitte Mitarbeiter auswählen."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetchWithAuth("/api/hr/offboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowNew(false); setNewForm({ employee_id: "", last_working_day: "", exit_reason: "" });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setSaving(false); }
  };

  const toggleTask = async (processId: string, taskId: string, done: boolean) => {
    await fetchWithAuth(`/api/hr/offboarding/${processId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, done }),
    });
    load();
  };

  const completeProcess = async (id: string) => {
    await fetchWithAuth(`/api/hr/offboarding/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    load();
  };

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Offboarding</h1>
          <button onClick={() => setShowNew(true)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer" }}>+ Offboarding starten</button>
        </div>

        <Card style={{ display: "flex", gap: 8 }}>
          {(["active", "completed", "cancelled", ""] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: statusFilter === s ? 600 : 400,
                background: statusFilter === s ? uiTokens.brand : "#f3f4f6", color: statusFilter === s ? "#fff" : uiTokens.textSecondary,
                border: "1px solid #e5e7eb", cursor: "pointer",
              }}>
              {s ? STATUS_LABELS[s] : "Alle"}
            </button>
          ))}
        </Card>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}

        {showNew && (
          <Card style={{ border: `2px solid ${uiTokens.brand}` }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Offboarding einleiten</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Mitarbeiter *</label>
                <select value={newForm.employee_id} onChange={(e) => setNewForm((p) => ({ ...p, employee_id: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, background: "#fff" }}>
                  <option value="">Auswählen...</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : e.display_name || e.id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Letzter Arbeitstag</label>
                <input type="date" value={newForm.last_working_day} onChange={(e) => setNewForm((p) => ({ ...p, last_working_day: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>Austrittsgrund</label>
              <input value={newForm.exit_reason} onChange={(e) => setNewForm((p) => ({ ...p, exit_reason: e.target.value }))}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setShowNew(false)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer" }}>Abbrechen</button>
              <button onClick={handleCreate} disabled={saving} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Wird erstellt..." : "Offboarding starten"}
              </button>
            </div>
          </Card>
        )}

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && (
          <Section title={`${(statusFilter ? processes.filter((p) => p.status === statusFilter) : processes).length} Offboarding-Prozesse`}>
            {(statusFilter ? processes.filter((p) => p.status === statusFilter) : processes).map((p) => {
              const tasks = p.offboarding_tasks || [];
              const doneCount = tasks.filter((t) => t.done).length;
              const isExpanded = expandedId === p.id;
              return (
                <Card key={p.id} style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{p.employee_name}</div>
                      <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2, display: "flex", gap: 12 }}>
                        {p.last_working_day && <span>Letzter Tag: {new Date(p.last_working_day).toLocaleDateString("de-DE")}</span>}
                        <span>Resturlaub: {p.remaining_vacation_days ?? "?"} Tage</span>
                        <span>Überstunden: {p.overtime_balance_minutes ? `${Math.floor(p.overtime_balance_minutes / 60)}h ${p.overtime_balance_minutes % 60}min` : "0"}</span>
                        <span>{doneCount}/{tasks.length} erledigt</span>
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Checkliste</div>
                      {tasks.map((t) => (
                        <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13, cursor: "pointer" }}>
                          <input type="checkbox" checked={t.done} onChange={() => toggleTask(p.id, t.id, !t.done)} />
                          <span style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? uiTokens.textMuted : uiTokens.textPrimary }}>{t.title}</span>
                          <span style={{ fontSize: 11, color: uiTokens.textMuted }}>({t.category})</span>
                        </label>
                      ))}
                      {p.status === "active" && doneCount === tasks.length && tasks.length > 0 && (
                        <button onClick={() => completeProcess(p.id)} style={{ marginTop: 12, padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "#16a34a", color: "#fff", border: "none", cursor: "pointer" }}>
                          Offboarding abschließen
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
            {processes.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Offboarding-Prozesse.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
