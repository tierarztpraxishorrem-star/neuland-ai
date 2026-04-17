"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { uiTokens, Card, Section } from "../../../../../components/ui/System";

type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "date" | "number" | "select";
  options?: { value: string; label: string }[];
  section: "personal" | "contract" | "finance";
};

const FIELDS: FieldDef[] = [
  // Personal
  { key: "first_name", label: "Vorname", required: true, section: "personal" },
  { key: "last_name", label: "Nachname", required: true, section: "personal" },
  { key: "date_of_birth", label: "Geburtsdatum", type: "date", section: "personal" },
  { key: "gender", label: "Geschlecht", type: "select", section: "personal", options: [
    { value: "male", label: "Männlich" }, { value: "female", label: "Weiblich" }, { value: "diverse", label: "Divers" },
  ]},
  { key: "phone", label: "Telefon", section: "personal" },
  { key: "email_private", label: "Private E-Mail", section: "personal" },
  { key: "address_street", label: "Straße", section: "personal" },
  { key: "address_number", label: "Hausnummer", section: "personal" },
  { key: "address_zip", label: "PLZ", section: "personal" },
  { key: "address_city", label: "Ort", section: "personal" },
  { key: "nationality", label: "Staatsangehörigkeit", section: "personal" },
  // Contract
  { key: "personnel_number", label: "Personalnummer", section: "contract" },
  { key: "department", label: "Abteilung", section: "contract" },
  { key: "position_title", label: "Position", section: "contract" },
  { key: "contract_type", label: "Vertragsart", type: "select", section: "contract", options: [
    { value: "vollzeit", label: "Vollzeit" }, { value: "teilzeit", label: "Teilzeit" },
    { value: "minijob", label: "Minijob" }, { value: "azubi", label: "Auszubildende/r" },
    { value: "praktikant", label: "Praktikant/in" }, { value: "werkstudent", label: "Werkstudent/in" },
  ]},
  { key: "contract_start", label: "Vertragsbeginn", type: "date", section: "contract" },
  { key: "contract_end", label: "Vertragsende", type: "date", section: "contract" },
  { key: "weekly_hours_target", label: "Wochenstunden (Soll)", type: "number", section: "contract" },
  { key: "work_days_per_week", label: "Arbeitstage/Woche", type: "number", section: "contract" },
  { key: "vacation_days_per_year", label: "Urlaubstage/Jahr", type: "number", section: "contract" },
  { key: "role", label: "Rolle", type: "select", section: "contract", options: [
    { value: "member", label: "Mitarbeiter" }, { value: "groupleader", label: "Teamleiter" }, { value: "admin", label: "Admin" },
  ]},
  // Finance
  { key: "iban", label: "IBAN", section: "finance" },
  { key: "bic", label: "BIC", section: "finance" },
  { key: "tax_id", label: "Steuer-ID", section: "finance" },
  { key: "tax_class", label: "Steuerklasse", type: "select", section: "finance", options: [
    { value: "1", label: "I" }, { value: "2", label: "II" }, { value: "3", label: "III" },
    { value: "4", label: "IV" }, { value: "5", label: "V" }, { value: "6", label: "VI" },
  ]},
  { key: "social_security_number", label: "Sozialversicherungsnr.", section: "finance" },
  { key: "health_insurance", label: "Krankenkasse", section: "finance" },
];

const SECTION_LABELS: Record<string, string> = {
  personal: "Persönliche Daten",
  contract: "Vertragsdaten",
  finance: "Finanzdaten",
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function NewEmployeePage() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      setError("Vor- und Nachname sind Pflichtfelder.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/hr/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Anlegen.");
      router.push(`/hr/admin/employees/${data.employee.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  };

  const sections = ["personal", "contract", "finance"] as const;

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <button
            onClick={() => router.push("/hr/admin/employees")}
            style={{ background: "none", border: "none", color: uiTokens.brand, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 4 }}
          >
            &larr; Zurück zur Liste
          </button>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>
            Neuer Mitarbeiter
          </h1>
        </div>

        {error && (
          <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
            <div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div>
          </Card>
        )}

        <form onSubmit={handleSubmit}>
          {sections.map((section) => {
            const sectionFields = FIELDS.filter((f) => f.section === section);
            return (
              <Section key={section} title={SECTION_LABELS[section]}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 24 }}>
                  {sectionFields.map((field) => (
                    <Card key={field.key} style={{ padding: 14 }}>
                      <label style={{ fontSize: 12, color: uiTokens.textMuted, marginBottom: 4, display: "block" }}>
                        {field.label}{field.required ? " *" : ""}
                      </label>
                      {field.type === "select" && field.options ? (
                        <select
                          value={form[field.key] || ""}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          style={{
                            width: "100%", padding: "6px 8px", borderRadius: 6,
                            border: "1px solid #e5e7eb", fontSize: 14, background: "#fff",
                          }}
                        >
                          <option value="">-- Auswählen --</option>
                          {field.options.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type || "text"}
                          value={form[field.key] || ""}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          required={field.required}
                          style={{
                            width: "100%", padding: "6px 8px", borderRadius: 6,
                            border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box",
                          }}
                        />
                      )}
                    </Card>
                  ))}
                </div>
              </Section>
            );
          })}

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
            <button
              type="button"
              onClick={() => router.push("/hr/admin/employees")}
              style={{
                padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500,
                background: "#fff", color: uiTokens.textSecondary, border: "1px solid #e5e7eb", cursor: "pointer",
              }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Wird angelegt..." : "Mitarbeiter anlegen"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
