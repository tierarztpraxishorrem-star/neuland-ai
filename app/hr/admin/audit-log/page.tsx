"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section } from "../../../../components/ui/System";

type AuditEntry = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  insert: "Erstellt", update: "Geändert", delete: "Gelöscht",
  approve: "Genehmigt", reject: "Abgelehnt", start: "Gestartet", stop: "Gestoppt",
};

async function fetchWithAuth(url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
      if (entityTypeFilter) params.set("entity_type", entityTypeFilter);
      const res = await fetchWithAuth(`/api/hr/admin/audit-log?${params}`);
      if (!res) return;
      const data = await res.json();
      if (res.ok) {
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [entityTypeFilter, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(1000px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Audit-Log</h1>

        <Card style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select value={entityTypeFilter} onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(0); }}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff" }}>
            <option value="">Alle Typen</option>
            <option value="employee">Mitarbeiter</option>
            <option value="absence">Abwesenheit</option>
            <option value="overtime">Überstunden</option>
            <option value="shift">Schicht</option>
            <option value="work_session">Zeiterfassung</option>
            <option value="document">Dokument</option>
          </select>
          <span style={{ fontSize: 13, color: uiTokens.textSecondary }}>{total} Einträge</span>
        </Card>

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && (
          <Section title="">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: uiTokens.textMuted, fontWeight: 600 }}>Zeitpunkt</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: uiTokens.textMuted, fontWeight: 600 }}>Aktion</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: uiTokens.textMuted, fontWeight: 600 }}>Typ</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: uiTokens.textMuted, fontWeight: 600 }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        {new Date(e.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "8px 12px" }}>{ACTION_LABELS[e.action] || e.action}</td>
                      <td style={{ padding: "8px 12px" }}>{e.entity_type}</td>
                      <td style={{ padding: "8px 12px", color: uiTokens.textSecondary, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.metadata ? (
                          e.metadata.field
                            ? `${e.metadata.field}: ${e.metadata.old_value || "—"} → ${e.metadata.new_value || "—"}`
                            : JSON.stringify(e.metadata).slice(0, 100)
                        ) : e.entity_id?.slice(0, 8) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                  style={{ padding: "4px 12px", borderRadius: 6, fontSize: 13, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.4 : 1 }}>
                  Zurück
                </button>
                <span style={{ fontSize: 13, color: uiTokens.textSecondary, lineHeight: "28px" }}>Seite {page + 1} von {totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
                  style={{ padding: "4px 12px", borderRadius: 6, fontSize: 13, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: page >= totalPages - 1 ? "default" : "pointer", opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
                  Weiter
                </button>
              </div>
            )}

            {entries.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary, marginTop: 8 }}>Keine Audit-Log-Einträge.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
