"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens } from "../../../components/ui/System";

type AdminStatsPayload = {
  practiceId: string;
  updatedAt: string;
  cases: {
    total: number;
    last7Days: number;
    last30Days: number;
    missingTitle: number;
    missingRequiredFields: number;
    estimatedTimeSavedMinutes: number;
    averageProcessingMinutes: number | null;
    perWeek: Array<{ week: string; count: number }>;
    perMonth: Array<{ month: string; count: number }>;
    byPractice: Array<{ practiceId: string; label: string; total: number; last30Days: number }>;
  };
  templates: {
    total: number;
    usage: Array<{ template: string; count: number; sharePercent: number }>;
  };
  invitations: {
    total: number;
    open: number;
    accepted: number;
    expired: number;
  };
  joinRequests: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  memberships: {
    total: number;
    owners: number;
    admins: number;
    members: number;
  };
  activityByRole: {
    owner: number;
    admin: number;
    member: number;
    unknown: number;
  };
  systemStability: {
    windowDays: number;
    dataAvailable: boolean;
    totalRequests: number;
    errorRequests: number;
    errorRatePercent: number | null;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
  };
};

export default function AdminStatisticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStatsPayload | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) {
          setError("Bitte einloggen, um Statistiken zu laden.");
          setStats(null);
          return;
        }

        const res = await fetch("/api/admin/stats", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const json = (await res.json()) as AdminStatsPayload & { error?: string };
        if (!res.ok) {
          throw new Error(json.error || "Statistiken konnten nicht geladen werden.");
        }

        setStats(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Statistiken konnten nicht geladen werden.");
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [reloadTick]);

  const topTemplate = useMemo(() => {
    if (!stats?.templates.usage.length) return null;
    return stats.templates.usage[0];
  }, [stats]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: uiTokens.pageBackground,
        padding: uiTokens.pagePadding,
        fontFamily: "inherit",
      }}
    >
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 32, color: uiTokens.brand, margin: 0, fontWeight: 700 }}>Admin Statistik</h1>
          <div style={{ marginTop: 6, fontSize: 14, color: uiTokens.textSecondary }}>
            Datenschutzfreundliche Kennzahlen ohne inhaltliches Chat-Insights-Tracking.
          </div>
        </div>

        <Link
          href="/admin"
          style={{
            alignSelf: "flex-start",
            background: "#0F6B74",
            color: "#fff",
            textDecoration: "none",
            borderRadius: 10,
            padding: "10px 14px",
            fontWeight: 600,
          }}
        >
          Zurück zu Admin
        </Link>
      </div>

      {loading ? <div>Lade Statistiken...</div> : null}
      {error ? (
        <div style={{ color: "#b91c1c", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadTick((v) => v + 1)}
            style={{
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#9f1239",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Erneut laden
          </button>
        </div>
      ) : null}

      {!loading && !error && stats ? (
        <>
          <section style={{ marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <StatCard label="Fälle gesamt" value={String(stats.cases.total)} />
            <StatCard label="Fälle letzte 7 Tage" value={String(stats.cases.last7Days)} />
            <StatCard label="Fälle letzte 30 Tage" value={String(stats.cases.last30Days)} />
            <StatCard label="Durchschn. Bearbeitungszeit/Fall" value={stats.cases.averageProcessingMinutes !== null ? `${stats.cases.averageProcessingMinutes} min` : "keine Daten"} />
            <StatCard label="Vorlagen gesamt" value={String(stats.templates.total)} />
            <StatCard label="Top-Vorlage" value={topTemplate ? `${topTemplate.template} (${topTemplate.count})` : "keine Daten"} />
            <StatCard label="Einladungen offen" value={String(stats.invitations.open)} />
            <StatCard label="Join-Requests offen" value={String(stats.joinRequests.pending)} />
            <StatCard label="Fälle mit fehlenden Pflichtfeldern" value={String(stats.cases.missingRequiredFields)} />
            <StatCard label="Eingesparte Zeit (Schätzung)" value={`${stats.cases.estimatedTimeSavedMinutes} min`} />
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Fälle pro Woche / Monat</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              <HorizontalBars
                title="Pro Woche"
                rows={stats.cases.perWeek.map((item) => ({ label: item.week, value: item.count }))}
              />
              <HorizontalBars
                title="Pro Monat"
                rows={stats.cases.perMonth.map((item) => ({ label: item.month, value: item.count }))}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <SimpleTable
                title="Je Praxis (im aktuellen Zugriff)"
                rows={stats.cases.byPractice.map((item) => [item.label, `${item.total} gesamt / ${item.last30Days} in 30d`])}
                col1="Praxis"
                col2="Fälle"
              />
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Nutzungsquote Vorlagen</h2>
            {stats.templates.usage.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: 14 }}>Noch keine Vorlagennutzung in den ausgewerteten Fällen.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {stats.templates.usage.map((item) => (
                  <div key={item.template} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.template}</div>
                    <div style={{ fontSize: 13, color: "#475569" }}>
                      Nutzung: {item.count} ({item.sharePercent.toFixed(1)}%)
                    </div>
                    <div style={{ marginTop: 6, height: 8, background: "#e2e8f0", borderRadius: 999 }}>
                      <div
                        style={{
                          width: `${Math.max(2, Math.min(100, item.sharePercent))}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "#0F6B74",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Nutzeraktivität je Rolle (30 Tage)</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <StatCard label="Owner" value={String(stats.activityByRole.owner)} compact />
              <StatCard label="Admin" value={String(stats.activityByRole.admin)} compact />
              <StatCard label="Member" value={String(stats.activityByRole.member)} compact />
              <StatCard label="Unbekannt" value={String(stats.activityByRole.unknown)} compact />
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Einladungen und Join-Requests</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <StatCard label="Einladungen erstellt" value={String(stats.invitations.total)} compact />
              <StatCard label="Einladungen angenommen" value={String(stats.invitations.accepted)} compact />
              <StatCard label="Einladungen abgelaufen" value={String(stats.invitations.expired)} compact />
              <StatCard label="Join-Requests gesamt" value={String(stats.joinRequests.total)} compact />
              <StatCard label="Join-Requests offen" value={String(stats.joinRequests.pending)} compact />
              <StatCard label="Join-Requests freigegeben" value={String(stats.joinRequests.approved)} compact />
              <StatCard label="Join-Requests abgelehnt" value={String(stats.joinRequests.rejected)} compact />
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Datenqualität</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <StatCard label="Fälle ohne Titel" value={String(stats.cases.missingTitle)} compact />
              <StatCard label="Fälle mit fehlenden Pflichtfeldern" value={String(stats.cases.missingRequiredFields)} compact />
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Systemstabilität</h2>
            {stats.systemStability.dataAvailable ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <StatCard label={`API Requests (${stats.systemStability.windowDays}d)`} value={String(stats.systemStability.totalRequests)} compact />
                <StatCard label="API Fehler" value={String(stats.systemStability.errorRequests)} compact />
                <StatCard label="API Fehlerrate" value={`${stats.systemStability.errorRatePercent ?? 0}%`} compact />
                <StatCard label="Antwortzeit p50" value={stats.systemStability.p50LatencyMs !== null ? `${Math.round(stats.systemStability.p50LatencyMs)} ms` : "-"} compact />
                <StatCard label="Antwortzeit p95" value={stats.systemStability.p95LatencyMs !== null ? `${Math.round(stats.systemStability.p95LatencyMs)} ms` : "-"} compact />
              </div>
            ) : (
              <div style={{ color: "#64748b", fontSize: 14 }}>
                API-Fehlerrate und Antwortzeiten sind noch nicht verfügbar (keine kompatible Log-Tabelle gefunden).
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function StatCard({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div
      style={{
        background: uiTokens.cardBackground,
        borderRadius: 14,
        border: uiTokens.cardBorder,
        padding: compact ? 14 : 18,
      }}
    >
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: compact ? 24 : 30, fontWeight: 700, color: "#0F6B74" }}>{value}</div>
    </div>
  );
}

function SimpleTable({ title, rows, col1, col2 }: { title: string; rows: string[][]; col1: string; col2: string }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div style={{ fontWeight: 700, padding: "10px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 12, color: "#64748b" }}>
            <th style={{ padding: "10px 12px" }}>{col1}</th>
            <th style={{ padding: "10px 12px" }}>{col2}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={{ padding: "10px 12px", color: "#64748b" }} colSpan={2}>Keine Daten</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row[0]}_${row[1]}`} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 12px", color: "#334155" }}>{row[0]}</td>
                <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 600 }}>{row[1]}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function HorizontalBars({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  const max = rows.reduce((m, r) => (r.value > m ? r.value : m), 0);

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div style={{ fontWeight: 700, padding: "10px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{title}</div>
      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        {rows.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>Keine Daten</div>
        ) : (
          rows.map((row) => {
            const width = max > 0 ? (row.value / max) * 100 : 0;
            return (
              <div key={`${title}_${row.label}`}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#334155", marginBottom: 4 }}>
                  <span>{row.label}</span>
                  <span style={{ fontWeight: 700 }}>{row.value}</span>
                </div>
                <div style={{ height: 10, background: "#e2e8f0", borderRadius: 999 }}>
                  <div
                    style={{
                      width: `${Math.max(2, width)}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: "linear-gradient(90deg, #0F6B74 0%, #14b8a6 100%)",
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const sectionStyle: CSSProperties = {
  marginBottom: 18,
  background: uiTokens.cardBackground,
  borderRadius: 16,
  border: uiTokens.cardBorder,
  padding: 18,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 20,
  marginTop: 0,
  marginBottom: 12,
};
