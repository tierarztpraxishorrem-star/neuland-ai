"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { uiTokens, Card, Section } from "../../../../../components/ui/System";

type Employee = Record<string, string | number | boolean | null | undefined>;

type Tab = "personal" | "contract" | "finance";

const TABS: { key: Tab; label: string }[] = [
  { key: "personal", label: "Persönlich" },
  { key: "contract", label: "Vertrag" },
  { key: "finance", label: "Finanzen" },
];

const FIELD_LABELS: Record<string, string> = {
  first_name: "Vorname",
  last_name: "Nachname",
  birth_name: "Geburtsname",
  date_of_birth: "Geburtsdatum",
  birth_place: "Geburtsort",
  birth_country: "Geburtsland",
  gender: "Geschlecht",
  nationality: "Staatsangehörigkeit",
  marital_status: "Familienstand",
  phone: "Telefon",
  email_private: "Private E-Mail",
  address_street: "Straße",
  address_number: "Hausnummer",
  address_zip: "PLZ",
  address_city: "Ort",
  personnel_number: "Personalnummer",
  department: "Abteilung",
  position_title: "Position",
  contract_type: "Vertragsart",
  contract_start: "Vertragsbeginn",
  contract_end: "Vertragsende",
  probation_end: "Probezeit bis",
  weekly_hours: "Wochenstunden (aktuell)",
  weekly_hours_target: "Wochenstunden (Soll)",
  work_days_per_week: "Arbeitstage/Woche",
  vacation_days_per_year: "Urlaubstage/Jahr",
  employment_status: "Status",
  role: "Rolle",
  iban: "IBAN",
  bic: "BIC",
  tax_id: "Steuer-ID",
  tax_class: "Steuerklasse",
  social_security_number: "Sozialversicherungsnummer",
  health_insurance: "Krankenkasse",
  confession: "Konfession",
};

const TAB_FIELDS: Record<Tab, string[]> = {
  personal: [
    "first_name", "last_name", "birth_name", "date_of_birth", "birth_place",
    "birth_country", "gender", "nationality", "marital_status", "phone",
    "email_private", "address_street", "address_number", "address_zip", "address_city",
  ],
  contract: [
    "personnel_number", "department", "position_title", "contract_type",
    "contract_start", "contract_end", "probation_end", "weekly_hours",
    "weekly_hours_target", "work_days_per_week", "vacation_days_per_year",
    "employment_status", "role",
  ],
  finance: [
    "iban", "bic", "tax_id", "tax_class", "social_security_number",
    "health_insurance", "confession",
  ],
};

const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  gender: [
    { value: "male", label: "Männlich" },
    { value: "female", label: "Weiblich" },
    { value: "diverse", label: "Divers" },
  ],
  marital_status: [
    { value: "single", label: "Ledig" },
    { value: "married", label: "Verheiratet" },
    { value: "divorced", label: "Geschieden" },
    { value: "widowed", label: "Verwitwet" },
    { value: "registered_partnership", label: "Eingetragene Partnerschaft" },
  ],
  contract_type: [
    { value: "vollzeit", label: "Vollzeit" },
    { value: "teilzeit", label: "Teilzeit" },
    { value: "minijob", label: "Minijob" },
    { value: "azubi", label: "Auszubildende/r" },
    { value: "praktikant", label: "Praktikant/in" },
    { value: "werkstudent", label: "Werkstudent/in" },
  ],
  employment_status: [
    { value: "active", label: "Aktiv" },
    { value: "inactive", label: "Inaktiv" },
    { value: "onboarding", label: "Onboarding" },
    { value: "offboarding", label: "Offboarding" },
    { value: "terminated", label: "Ausgeschieden" },
  ],
  role: [
    { value: "member", label: "Mitarbeiter" },
    { value: "groupleader", label: "Teamleiter" },
    { value: "admin", label: "Admin" },
  ],
  tax_class: [
    { value: "1", label: "Klasse I" },
    { value: "2", label: "Klasse II" },
    { value: "3", label: "Klasse III" },
    { value: "4", label: "Klasse IV" },
    { value: "5", label: "Klasse V" },
    { value: "6", label: "Klasse VI" },
  ],
};

const DATE_FIELDS = new Set(["date_of_birth", "contract_start", "contract_end", "probation_end"]);

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("personal");
  const [editMode, setEditMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/hr/employees/${id}`);
      if (!res) { setError("Nicht angemeldet."); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler.");
      setEmployee(data.employee);
      setEditData({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (field: string, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
    setSuccess(null);
  };

  const handleSave = async () => {
    if (Object.keys(editData).length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/hr/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Speichern.");
      setEmployee(data.employee);
      setEditData({});
      setEditMode(false);
      setSuccess("Änderungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  };

  const getValue = (field: string): string => {
    if (field in editData) return editData[field];
    const val = employee?.[field];
    if (val === null || val === undefined) return "";
    return String(val);
  };

  const hasChanges = Object.keys(editData).length > 0;

  if (loading) {
    return (
      <main style={{ padding: uiTokens.pagePadding, background: uiTokens.pageBackground, minHeight: "100vh" }}>
        <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <button
              onClick={() => router.push("/hr/admin/employees")}
              style={{ background: "none", border: "none", color: uiTokens.brand, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 4 }}
            >
              &larr; Zurück zur Liste
            </button>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>
              {employee?.first_name && employee?.last_name
                ? `${employee.first_name} ${employee.last_name}`
                : (employee?.display_name as string) || "Mitarbeiter"}
            </h1>
            {employee?.personnel_number && (
              <p style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2 }}>
                Personalnummer: {employee.personnel_number as string}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                style={{
                  padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                  background: "#f3f4f6", color: uiTokens.textPrimary, border: "1px solid #e5e7eb", cursor: "pointer",
                }}
              >
                Bearbeiten
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setEditMode(false); setEditData({}); }}
                  style={{
                    padding: "8px 16px", borderRadius: 8, fontSize: 14,
                    background: "#fff", color: uiTokens.textSecondary, border: "1px solid #e5e7eb", cursor: "pointer",
                  }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  style={{
                    padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                    background: hasChanges ? uiTokens.brand : "#d1d5db", color: "#fff", border: "none", cursor: hasChanges ? "pointer" : "default",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "Speichere..." : "Speichern"}
                </button>
              </>
            )}
          </div>
        </div>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}
        {success && <Card style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}><div style={{ color: "#16a34a", fontSize: 14 }}>{success}</div></Card>}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e5e7eb" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 20px", fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? uiTokens.brand : uiTokens.textSecondary,
                borderBottom: tab === t.key ? `2px solid ${uiTokens.brand}` : "2px solid transparent",
                marginBottom: -2, background: "none", border: "none",
                borderBottomStyle: "solid", borderBottomWidth: 2,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <Section title={TABS.find((t) => t.key === tab)?.label || ""}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {TAB_FIELDS[tab].map((field) => {
              const val = getValue(field);
              const options = SELECT_OPTIONS[field];
              const isDate = DATE_FIELDS.has(field);
              const isHidden = val === undefined;

              if (isHidden) {
                return (
                  <Card key={field} style={{ padding: 14, opacity: 0.5 }}>
                    <div style={{ fontSize: 12, color: uiTokens.textMuted, marginBottom: 4 }}>
                      {FIELD_LABELS[field] || field}
                    </div>
                    <div style={{ fontSize: 13, color: uiTokens.textSecondary, fontStyle: "italic" }}>
                      Keine Berechtigung
                    </div>
                  </Card>
                );
              }

              // Read-only display
              if (!editMode) {
                const displayVal = options
                  ? options.find((o) => o.value === val)?.label || val || "—"
                  : isDate && val ? new Date(val + "T00:00:00").toLocaleDateString("de-DE") : val || "—";
                return (
                  <Card key={field} style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: uiTokens.textMuted, marginBottom: 4 }}>
                      {FIELD_LABELS[field] || field}
                    </div>
                    <div style={{ fontSize: 14, color: val ? uiTokens.textPrimary : uiTokens.textMuted }}>
                      {displayVal}
                    </div>
                  </Card>
                );
              }

              // Edit mode
              return (
                <Card key={field} style={{ padding: 14, border: field in editData ? `1px solid ${uiTokens.brand}` : undefined }}>
                  <label style={{ fontSize: 12, color: uiTokens.textMuted, marginBottom: 4, display: "block" }}>
                    {FIELD_LABELS[field] || field}
                  </label>
                  {options ? (
                    <select
                      value={val}
                      onChange={(e) => handleChange(field, e.target.value)}
                      style={{
                        width: "100%", padding: "6px 8px", borderRadius: 6,
                        border: "1px solid #e5e7eb", fontSize: 14, background: "#fff",
                      }}
                    >
                      <option value="">-- Nicht angegeben --</option>
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={isDate ? "date" : field === "tax_class" || field === "work_days_per_week" || field === "vacation_days_per_year" ? "number" : "text"}
                      value={val}
                      onChange={(e) => handleChange(field, e.target.value)}
                      style={{
                        width: "100%", padding: "6px 8px", borderRadius: 6,
                        border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box",
                      }}
                    />
                  )}
                </Card>
              );
            })}
          </div>
        </Section>
      </div>
    </main>
  );
}
