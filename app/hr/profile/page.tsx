"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Section } from "../../../components/ui/System";

type Employee = Record<string, string | number | boolean | null | undefined>;

const SELF_EDITABLE = new Set(["phone", "email_private", "address_street", "address_number", "address_zip", "address_city", "marital_status"]);

const DISPLAY_FIELDS = [
  { key: "first_name", label: "Vorname" },
  { key: "last_name", label: "Nachname" },
  { key: "date_of_birth", label: "Geburtsdatum", date: true },
  { key: "gender", label: "Geschlecht", options: { male: "Männlich", female: "Weiblich", diverse: "Divers" } },
  { key: "nationality", label: "Staatsangehörigkeit" },
  { key: "marital_status", label: "Familienstand", options: { single: "Ledig", married: "Verheiratet", divorced: "Geschieden", widowed: "Verwitwet", registered_partnership: "Eingetragene Partnerschaft" } },
  { key: "phone", label: "Telefon" },
  { key: "email_private", label: "Private E-Mail" },
  { key: "address_street", label: "Straße" },
  { key: "address_number", label: "Hausnummer" },
  { key: "address_zip", label: "PLZ" },
  { key: "address_city", label: "Ort" },
  { key: "personnel_number", label: "Personalnummer" },
  { key: "department", label: "Abteilung" },
  { key: "position_title", label: "Position" },
  { key: "contract_type", label: "Vertragsart", options: { vollzeit: "Vollzeit", teilzeit: "Teilzeit", minijob: "Minijob", azubi: "Azubi" } },
  { key: "contract_start", label: "Vertragsbeginn", date: true },
  { key: "weekly_hours_target", label: "Wochenstunden (Soll)" },
  { key: "vacation_days_per_year", label: "Urlaubstage/Jahr" },
] as const;

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function ProfilePage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // First get our employee ID
      const listRes = await fetchWithAuth("/api/hr/employees?status=active");
      if (!listRes) return;
      // Use the start endpoint to get our employee
      const startRes = await fetchWithAuth("/api/hr/start", { method: "OPTIONS" });
      // Actually, we need to get our own employee ID. Let's use a different approach:
      // Call GET on employees with our own user context - but that requires admin.
      // Instead, use the overtime endpoint which returns our employee data
      const otRes = await fetchWithAuth("/api/hr/overtime");
      if (!otRes) return;

      // We need to find ourselves. Let's check the Supabase directly for our employee record
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { createClient } = await import("@supabase/supabase-js");
      const userSb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${session.access_token}` } }, auth: { persistSession: false } }
      );

      const { data: membership } = await userSb.from("practice_memberships").select("practice_id").limit(1).maybeSingle();
      if (!membership) return;

      const { data: emp } = await userSb
        .from("employees")
        .select("*")
        .eq("practice_id", membership.practice_id)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (emp) {
        setEmployee(emp as Employee);
        setEmployeeId(emp.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!employeeId || Object.keys(editData).length === 0) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/hr/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmployee(data.employee);
      setEditData({});
      setEditMode(false);
      setSuccess("Änderungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  };

  const getValue = (key: string) => {
    if (key in editData) return editData[key];
    const v = employee?.[key];
    return v === null || v === undefined ? "" : String(v);
  };

  const hasChanges = Object.keys(editData).length > 0;

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(700px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Mein Profil</h1>
            {employee?.department && <p style={{ fontSize: 14, color: uiTokens.textSecondary, marginTop: 4 }}>{employee.department as string} — {employee.position_title as string || ""}</p>}
          </div>
          {!editMode ? (
            <button onClick={() => setEditMode(true)}
              style={{ padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer" }}>
              Kontaktdaten ändern
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setEditMode(false); setEditData({}); }}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 14, background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer" }}>Abbrechen</button>
              <button onClick={handleSave} disabled={saving || !hasChanges}
                style={{ padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: hasChanges ? uiTokens.brand : "#d1d5db", color: "#fff", border: "none", cursor: hasChanges ? "pointer" : "default" }}>
                {saving ? "Speichere..." : "Speichern"}
              </button>
            </div>
          )}
        </div>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}
        {success && <Card style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}><div style={{ color: "#16a34a", fontSize: 14 }}>{success}</div></Card>}
        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && employee && (
          <Section title="">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {DISPLAY_FIELDS.map((field) => {
                const val = getValue(field.key);
                const canEdit = SELF_EDITABLE.has(field.key) && editMode;
                const opts = "options" in field ? field.options : null;

                if (!canEdit) {
                  const isDateField = "date" in field && field.date;
                  const display = opts ? (opts as Record<string, string>)[val] || val || "—" : isDateField && val ? new Date(val + "T00:00:00").toLocaleDateString("de-DE") : val || "—";
                  return (
                    <Card key={field.key} style={{ padding: 14 }}>
                      <div style={{ fontSize: 12, color: uiTokens.textMuted, marginBottom: 4 }}>{field.label}</div>
                      <div style={{ fontSize: 14, color: val ? uiTokens.textPrimary : uiTokens.textMuted }}>{display}</div>
                    </Card>
                  );
                }

                return (
                  <Card key={field.key} style={{ padding: 14, border: field.key in editData ? `1px solid ${uiTokens.brand}` : undefined }}>
                    <label style={{ fontSize: 12, color: uiTokens.textMuted, marginBottom: 4, display: "block" }}>{field.label}</label>
                    {opts ? (
                      <select value={val} onChange={(e) => setEditData((p) => ({ ...p, [field.key]: e.target.value }))}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, background: "#fff" }}>
                        <option value="">—</option>
                        {Object.entries(opts as Record<string, string>).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={val} onChange={(e) => setEditData((p) => ({ ...p, [field.key]: e.target.value }))}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }} />
                    )}
                  </Card>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: uiTokens.textMuted, marginTop: 16, fontStyle: "italic" }}>
              Kontaktdaten (Telefon, E-Mail, Adresse, Familienstand) können Sie selbst ändern. Für alle anderen Felder wenden Sie sich bitte an die Personalabteilung.
            </div>
          </Section>
        )}
      </div>
    </main>
  );
}
