"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../../components/ui/System";

type Location = {
  id: string;
  name: string;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

type FormData = {
  name: string;
  address_street: string;
  address_zip: string;
  address_city: string;
  phone: string;
  email: string;
};

const emptyForm: FormData = { name: "", address_street: "", address_zip: "", address_city: "", phone: "", email: "" };

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/hr/locations");
      if (!res) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLocations(data.locations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (loc: Location) => {
    setEditId(loc.id);
    setForm({
      name: loc.name,
      address_street: loc.address_street || "",
      address_zip: loc.address_zip || "",
      address_city: loc.address_city || "",
      phone: loc.phone || "",
      email: loc.email || "",
    });
    setShowForm(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name ist erforderlich."); return; }
    setSaving(true);
    setError(null);
    try {
      const url = editId ? `/api/hr/locations/${editId}` : "/api/hr/locations";
      const method = editId ? "PATCH" : "POST";
      const res = await fetchWithAuth(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  const toggleActive = async (loc: Location) => {
    try {
      const res = await fetchWithAuth(`/api/hr/locations/${loc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !loc.is_active }),
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
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Standorte</h1>
            <p style={{ marginTop: 4, fontSize: 14, color: uiTokens.textSecondary }}>{locations.length} Standorte</p>
          </div>
          <button
            onClick={openNew}
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer" }}
          >
            + Neuer Standort
          </button>
        </div>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}

        {showForm && (
          <Card style={{ border: `2px solid ${uiTokens.brand}` }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{editId ? "Standort bearbeiten" : "Neuer Standort"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {([
                ["name", "Name *"],
                ["address_street", "Straße"],
                ["address_zip", "PLZ"],
                ["address_city", "Ort"],
                ["phone", "Telefon"],
                ["email", "E-Mail"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: uiTokens.textMuted, display: "block", marginBottom: 4 }}>{label}</label>
                  <input
                    value={form[key]}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box" }}
                  />
                </div>
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
          <Section title="Standortliste">
            {locations.map((loc) => (
              <Card key={loc.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{loc.name}</div>
                  <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2 }}>
                    {[loc.address_street, loc.address_zip, loc.address_city].filter(Boolean).join(", ") || "Keine Adresse"}
                    {loc.phone && <span style={{ marginLeft: 12 }}>{loc.phone}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge tone={loc.is_active ? "success" : "danger"}>{loc.is_active ? "Aktiv" : "Inaktiv"}</Badge>
                  <button onClick={() => openEdit(loc)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer" }}>Bearbeiten</button>
                  <button onClick={() => toggleActive(loc)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, background: loc.is_active ? "#fef2f2" : "#f0fdf4", color: loc.is_active ? "#dc2626" : "#16a34a", border: "1px solid #e5e7eb", cursor: "pointer" }}>
                    {loc.is_active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </div>
              </Card>
            ))}
            {locations.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Noch keine Standorte angelegt.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
