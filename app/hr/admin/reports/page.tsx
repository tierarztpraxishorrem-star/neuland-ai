"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section } from "../../../../components/ui/System";

type Overview = {
  total_employees: number;
  pending_absences: number;
  pending_overtime: number;
  pending_corrections: number;
  expiring_qualifications: number;
};

type ReportRow = Record<string, unknown>;

type ReportType = "overview" | "overtime" | "absences";

async function fetchWithAuth(url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("overview");
  const [year, setYear] = useState(new Date().getFullYear());
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: reportType, year: String(year) });
      const res = await fetchWithAuth(`/api/hr/reports?${params}`);
      if (!res) return;
      const data = await res.json();
      if (res.ok) {
        if (reportType === "overview") {
          setOverview(data.overview);
        } else {
          const rows = data.report || [];
          setReportData(rows);
          // Extract unique departments
          const depts = [...new Set(rows.map((r: ReportRow) => r.department).filter(Boolean))] as string[];
          setDepartments(depts.sort());
        }
      }
    } finally {
      setLoading(false);
    }
  }, [reportType, year]);

  useEffect(() => { load(); }, [load]);

  const filteredData = deptFilter
    ? reportData.filter((r) => r.department === deptFilter)
    : reportData;

  const exportCSV = () => {
    if (filteredData.length === 0) return;
    const headers = Object.keys(filteredData[0]);
    const csv = [
      headers.join(";"),
      ...filteredData.map((r) => headers.map((h) => String(r[h] ?? "")).join(";")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hr-report-${reportType}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(1000px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>HR Reports</h1>

        <Card style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {(["overview", "overtime", "absences"] as const).map((t) => (
            <button key={t} onClick={() => setReportType(t)}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: reportType === t ? 600 : 400,
                background: reportType === t ? uiTokens.brand : "#f3f4f6", color: reportType === t ? "#fff" : uiTokens.textSecondary,
                border: "1px solid #e5e7eb", cursor: "pointer",
              }}>
              {{ overview: "Übersicht", overtime: "Überstunden", absences: "Abwesenheiten" }[t]}
            </button>
          ))}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff", marginLeft: "auto" }}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {reportType !== "overview" && departments.length > 0 && (
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff" }}>
              <option value="">Alle Abteilungen</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {reportType !== "overview" && reportData.length > 0 && (
            <button onClick={exportCSV} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer" }}>
              CSV Export
            </button>
          )}
        </Card>

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && reportType === "overview" && overview && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
            <Card><div style={{ fontSize: 12, color: uiTokens.textSecondary }}>Aktive Mitarbeiter</div><div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: uiTokens.brand }}>{overview.total_employees}</div></Card>
            <Card><div style={{ fontSize: 12, color: uiTokens.textSecondary }}>Offene Abwesenheitsanträge</div><div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: overview.pending_absences > 0 ? "#d97706" : uiTokens.textPrimary }}>{overview.pending_absences}</div></Card>
            <Card><div style={{ fontSize: 12, color: uiTokens.textSecondary }}>Offene Überstundenanträge</div><div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: overview.pending_overtime > 0 ? "#d97706" : uiTokens.textPrimary }}>{overview.pending_overtime}</div></Card>
            <Card><div style={{ fontSize: 12, color: uiTokens.textSecondary }}>Offene Zeitkorrekturen</div><div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{overview.pending_corrections}</div></Card>
            <Card><div style={{ fontSize: 12, color: uiTokens.textSecondary }}>Ablaufende Qualifikationen</div><div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: overview.expiring_qualifications > 0 ? "#dc2626" : uiTokens.textPrimary }}>{overview.expiring_qualifications}</div></Card>
          </div>
        )}

        {!loading && reportType === "overtime" && (
          <Section title={`Überstunden-Report ${year}`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: uiTokens.textMuted }}>Mitarbeiter</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: uiTokens.textMuted }}>Abteilung</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: uiTokens.textMuted }}>Gesamt</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: uiTokens.textMuted }}>Genehmigt</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: uiTokens.textMuted }}>Ausstehend</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: uiTokens.textMuted }}>Guthaben</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{r.name as string}</td>
                      <td style={{ padding: "8px 12px", color: uiTokens.textSecondary }}>{(r.department as string) || "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{formatMinutes(Number(r.total_minutes))}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{formatMinutes(Number(r.approved_minutes))}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: Number(r.pending_minutes) > 0 ? "#d97706" : undefined }}>{formatMinutes(Number(r.pending_minutes))}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: uiTokens.brand }}>{formatMinutes(Number(r.balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredData.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary, marginTop: 8 }}>Keine Daten für diesen Zeitraum{deptFilter ? ` und Abteilung "${deptFilter}"` : ""}.</div>}
          </Section>
        )}

        {!loading && reportType === "absences" && (
          <Section title={`Abwesenheits-Statistik ${year}`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: uiTokens.textMuted }}>Mitarbeiter</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: uiTokens.textMuted }}>Abteilung</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: uiTokens.textMuted }}>Urlaub</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: uiTokens.textMuted }}>Krankheit</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: uiTokens.textMuted }}>Schule</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: uiTokens.textMuted }}>Sonstige</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: uiTokens.textMuted }}>Gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{r.name as string}</td>
                      <td style={{ padding: "8px 12px", color: uiTokens.textSecondary }}>{(r.department as string) || "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{r.vacation_days as number} T</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: Number(r.sick_days) > 10 ? "#dc2626" : undefined }}>{r.sick_days as number} T</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{r.school_days as number} T</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{r.other_days as number} T</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{r.total_days as number} T</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredData.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary, marginTop: 8 }}>Keine Daten für diesen Zeitraum{deptFilter ? ` und Abteilung "${deptFilter}"` : ""}.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
