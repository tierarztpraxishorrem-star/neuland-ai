"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../../components/ui/System";

type Employee = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  personnel_number: string | null;
  department: string | null;
  position_title: string | null;
  contract_type: string | null;
  employment_status: string;
  phone: string | null;
  email_private: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Aktiv",
  inactive: "Inaktiv",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  terminated: "Ausgeschieden",
};

const STATUS_TONE: Record<string, "success" | "accent" | "danger" | undefined> = {
  active: "success",
  onboarding: "accent",
  offboarding: "accent",
  inactive: "danger",
  terminated: "danger",
};

const CONTRACT_LABELS: Record<string, string> = {
  vollzeit: "Vollzeit",
  teilzeit: "Teilzeit",
  minijob: "Minijob",
  azubi: "Auszubildende/r",
  praktikant: "Praktikant/in",
  werkstudent: "Werkstudent/in",
};

async function fetchWithAuth(url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
}

export default function EmployeeListPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("q", search.trim());

      const res = await fetchWithAuth(`/api/hr/employees?${params}`);
      if (!res) { setError("Nicht angemeldet."); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setEmployees(data.employees || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const timeout = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [load, search]);

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(1000px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Mitarbeiterverwaltung</h1>
            <p style={{ marginTop: 4, fontSize: 14, color: uiTokens.textSecondary }}>
              {employees.length} Mitarbeiter{statusFilter ? ` (${STATUS_LABELS[statusFilter] || statusFilter})` : ""}
            </p>
          </div>
          <Link
            href="/hr/admin/employees/new"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: uiTokens.brand, color: "#fff", textDecoration: "none",
            }}
          >
            + Neuer Mitarbeiter
          </Link>
        </div>

        {/* Filter bar */}
        <Card style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Suche nach Name, Personalnummer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8,
              border: "1px solid #e5e7eb", fontSize: 14, outline: "none",
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb",
              fontSize: 14, background: "#fff",
            }}
          >
            <option value="">Alle Status</option>
            <option value="active">Aktiv</option>
            <option value="onboarding">Onboarding</option>
            <option value="offboarding">Offboarding</option>
            <option value="inactive">Inaktiv</option>
            <option value="terminated">Ausgeschieden</option>
          </select>
        </Card>

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}
        {error && <div style={{ fontSize: 14, color: "#dc2626" }}>{error}</div>}

        {!loading && !error && (
          <Section title="Mitarbeiter">
            {employees.length === 0 && (
              <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>
                Keine Mitarbeiter gefunden.
              </div>
            )}
            {employees.map((emp) => (
              <Link
                key={emp.id}
                href={`/hr/admin/employees/${emp.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Card style={{ padding: 16, cursor: "pointer", transition: "box-shadow 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: uiTokens.textPrimary }}>
                      {emp.first_name && emp.last_name
                        ? `${emp.last_name}, ${emp.first_name}`
                        : emp.display_name || `Mitarbeiter ${emp.id.slice(0, 6)}`}
                    </div>
                    <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {emp.personnel_number && <span>#{emp.personnel_number}</span>}
                      {emp.department && <span>{emp.department}</span>}
                      {emp.position_title && <span>{emp.position_title}</span>}
                      {emp.contract_type && <span>{CONTRACT_LABELS[emp.contract_type] || emp.contract_type}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge tone={STATUS_TONE[emp.employment_status]}>
                      {STATUS_LABELS[emp.employment_status] || emp.employment_status}
                    </Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </Section>
        )}
      </div>
    </main>
  );
}
