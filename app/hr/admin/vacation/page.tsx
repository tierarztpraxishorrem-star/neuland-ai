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

export default function AdminVacationPage() {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

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
          {(["pending", "all"] as const).map((t) => (
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
              {t === "pending" ? "Offene Anträge" : "Alle Anträge"}
            </button>
          ))}
        </div>

        {/* List */}
        <Card>
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
        </Card>
      </div>
    </main>
  );
}
