"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Section, Button, SelectInput } from "../../../components/ui/System";

type Payslip = {
  id: string;
  employee_id: string;
  title: string;
  month: number;
  year: number;
  file_path: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
};

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

async function fetchWithAuth(url: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht angemeldet.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PayslipsPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    const years = new Set<number>([current]);
    for (const p of payslips) years.add(p.year);
    return [...years].sort((a, b) => b - a);
  }, [payslips]);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetchWithAuth(`/api/hr/payslips?year=${year}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setPayslips(data.payslips || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDownload(id: string) {
    try {
      setDownloadingId(id);
      const res = await fetchWithAuth(`/api/hr/payslips/${id}`);
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Download-Link konnte nicht erstellt werden.");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download fehlgeschlagen");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding, fontFamily: "inherit" }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Meine Lohnunterlagen</h1>
          <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 4 }}>
            Gehaltsabrechnungen zum Download
          </div>
        </div>

        {error && (
          <Card style={{ border: "1px solid #fecaca", background: "#fff1f2" }}>
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          </Card>
        )}

        <Card style={{ padding: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ fontSize: 13, color: uiTokens.textSecondary }}>Jahr:</label>
            <div style={{ minWidth: 120 }}>
              <SelectInput
                fullWidth={false}
                value={String(year)}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </SelectInput>
            </div>
          </div>
        </Card>

        <Section title={`Lohnunterlagen ${year}`}>
          {loading ? (
            <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Laden…</div>
          ) : payslips.length === 0 ? (
            <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>
              Noch keine Lohnunterlagen vorhanden.
            </div>
          ) : (
            payslips.map((p) => (
              <Card key={p.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: uiTokens.textSecondary, marginTop: 2 }}>
                      {MONTH_NAMES[p.month - 1]} {p.year}
                      {" · "}Hochgeladen: {formatDate(p.created_at)}
                      {p.file_size ? ` · ${formatSize(p.file_size)}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={downloadingId === p.id}
                    onClick={() => handleDownload(p.id)}
                  >
                    {downloadingId === p.id ? "Öffne…" : "Download"}
                  </Button>
                </div>
              </Card>
            ))
          )}
        </Section>
      </div>
    </main>
  );
}
