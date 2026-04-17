"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uiTokens, Card, Section, Button, Badge } from "@/components/ui/System";

type Absence = {
  id: string;
  employee_id: string;
  employee_name: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  note?: string | null;
  status: string;
  workdays: number;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  special: "Sonderurlaub",
  overtime: "Überstundenabbau",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ausstehend",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
};

const STATUS_TONES: Record<string, "accent" | "success" | "danger"> = {
  pending: "accent",
  approved: "success",
  rejected: "danger",
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht angemeldet.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type EntitlementEdit = { employee_id: string; name: string; days_total: number; days_carry: number };

export default function AdminVacationPage() {
  const [tab, setTab] = useState<"pending" | "all" | "entitlements">("pending");
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementEdit[]>([]);
  const [entYear, setEntYear] = useState(new Date().getFullYear());
  const [entLoading, setEntLoading] = useState(false);
  const [entSaving, setEntSaving] = useState<string | null>(null);

  const loadAbsences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Use admin absences endpoint with status filter
      const statusParam = tab === "pending" ? "&status=pending" : "";
      const res = await fetchWithAuth(
        `/api/hr/absences?admin=true${statusParam}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setAbsences(data.absences || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    loadAbsences();
  }, [loadAbsences]);

  async function handleAction(id: string, status: "approved" | "rejected") {
    setActing(id);
    try {
      const res = await fetchWithAuth(`/api/hr/vacation/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler.");
      await loadAbsences();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setActing(null);
    }
  }

  const loadEntitlements = useCallback(async () => {
    setEntLoading(true);
    try {
      // Load all employees
      const empRes = await fetchWithAuth("/api/hr/employees?status=active");
      if (!empRes.ok) return;
      const empData = await empRes.json();
      const emps = empData.employees || [];

      // Load entitlements from supabase directly
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${session.access_token}` } }, auth: { persistSession: false },
      });
      const { data: ents } = await sb.from("vacation_entitlements").select("employee_id, days_total, days_carry").eq("year", entYear);
      const entMap = new Map((ents || []).map((e: { employee_id: string; days_total: number; days_carry: number }) => [e.employee_id, e]));

      setEntitlements(emps.map((e: { id: string; first_name?: string; last_name?: string; display_name?: string; vacation_days_per_year?: number }) => ({
        employee_id: e.id,
        name: e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : e.display_name || e.id.slice(0, 8),
        days_total: (entMap.get(e.id) as { days_total: number } | undefined)?.days_total ?? e.vacation_days_per_year ?? 30,
        days_carry: (entMap.get(e.id) as { days_carry: number } | undefined)?.days_carry ?? 0,
      })));
    } catch { /* silent */ }
    finally { setEntLoading(false); }
  }, [entYear]);

  useEffect(() => {
    if (tab === "entitlements") loadEntitlements();
  }, [tab, loadEntitlements]);

  const saveEntitlement = async (ent: EntitlementEdit) => {
    setEntSaving(ent.employee_id);
    try {
      const res = await fetchWithAuth("/api/hr/vacation/entitlement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: ent.employee_id, year: entYear, days_total: ent.days_total, days_carry: ent.days_carry }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setEntSaving(null);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>
          Urlaubsverwaltung
        </h1>

        {error && (
          <div style={{ padding: 12, borderRadius: uiTokens.radiusCard, border: "1px solid #fca5a5", background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderRadius: uiTokens.radiusCard, background: "#f3f4f6", padding: 4 }}>
          {(["pending", "all", "entitlements"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 16px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                background: tab === t ? "#fff" : "transparent",
                boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                color: tab === t ? uiTokens.textPrimary : uiTokens.textSecondary,
              }}
            >
              {t === "pending" ? "Offene Anträge" : t === "all" ? "Alle Anträge" : "Kontingente"}
            </button>
          ))}
        </div>

        {/* Entitlements tab */}
        {tab === "entitlements" && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Urlaubskontingente {entYear}</div>
              <select value={entYear} onChange={(e) => setEntYear(Number(e.target.value))}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff" }}>
                {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {entLoading ? <p style={{ fontSize: 14, color: uiTokens.textMuted }}>Lade...</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: uiTokens.textMuted }}>Mitarbeiter</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: uiTokens.textMuted, width: 100 }}>Urlaubstage</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: uiTokens.textMuted, width: 100 }}>Übertrag</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: uiTokens.textMuted, width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {entitlements.map((ent) => (
                    <tr key={ent.employee_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 12px", fontWeight: 500 }}>{ent.name}</td>
                      <td style={{ padding: "6px 12px", textAlign: "center" }}>
                        <input type="number" value={ent.days_total} min={0} max={60}
                          onChange={(e) => setEntitlements((prev) => prev.map((x) => x.employee_id === ent.employee_id ? { ...x, days_total: Number(e.target.value) } : x))}
                          style={{ width: 60, padding: "2px 6px", borderRadius: 4, border: "1px solid #e5e7eb", fontSize: 13, textAlign: "center" }} />
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "center" }}>
                        <input type="number" value={ent.days_carry} min={0} max={30}
                          onChange={(e) => setEntitlements((prev) => prev.map((x) => x.employee_id === ent.employee_id ? { ...x, days_carry: Number(e.target.value) } : x))}
                          style={{ width: 60, padding: "2px 6px", borderRadius: 4, border: "1px solid #e5e7eb", fontSize: 13, textAlign: "center" }} />
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "center" }}>
                        <button onClick={() => saveEntitlement(ent)} disabled={entSaving === ent.employee_id}
                          style={{ padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: uiTokens.brand, color: "#fff", border: "none", cursor: "pointer", opacity: entSaving === ent.employee_id ? 0.6 : 1 }}>
                          {entSaving === ent.employee_id ? "..." : "Speichern"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {/* List */}
        {tab !== "entitlements" && <Card>
          {loading ? (
            <p style={{ fontSize: 14, color: uiTokens.textMuted }}>Laden…</p>
          ) : absences.length === 0 ? (
            <p style={{ fontSize: 14, color: uiTokens.textMuted }}>
              {tab === "pending"
                ? "Keine offenen Anträge."
                : "Keine Anträge vorhanden."}
            </p>
          ) : (
            <div style={{ display: "grid", gap: uiTokens.cardGap }}>
              {absences.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: uiTokens.cardBorder,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: uiTokens.textPrimary }}>
                        {a.employee_name || "Mitarbeiter"}
                      </div>
                      <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>
                        {TYPE_LABELS[a.absence_type] || a.absence_type} –{" "}
                        {formatDate(a.start_date)} bis {formatDate(a.end_date)}
                        <span style={{ marginLeft: 8, fontSize: 12, color: uiTokens.textMuted }}>
                          ({a.workdays} Arbeitstage)
                        </span>
                      </div>
                      {a.note && (
                        <div style={{ fontSize: 13, color: uiTokens.textMuted }}>{a.note}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <Badge tone={STATUS_TONES[a.status] || "accent"}>
                        {STATUS_LABELS[a.status] || a.status}
                      </Badge>
                      {a.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleAction(a.id, "approved")}
                            disabled={acting === a.id}
                            style={{ background: "#16a34a", borderColor: "#16a34a" }}
                          >
                            Genehmigen
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAction(a.id, "rejected")}
                            disabled={acting === a.id}
                            style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
                          >
                            Ablehnen
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>}
      </div>
    </main>
  );
}
