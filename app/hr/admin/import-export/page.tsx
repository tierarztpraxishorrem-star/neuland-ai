"use client";

import { useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Section } from "../../../../components/ui/System";

type ImportResult = { row: number; status: string; name: string; error?: string };

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function ImportExportPage() {
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDryRun, setIsDryRun] = useState(true);

  const handleExport = async (type: string) => {
    setError(null);
    try {
      const url = type === "datev"
        ? `/api/hr/export/datev?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`
        : `/api/hr/export/employees`;
      const res = await fetchWithAuth(url);
      if (!res) throw new Error("Nicht angemeldet.");
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = res.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") || `export.csv`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export-Fehler");
    }
  };

  const handleImport = async () => {
    if (!csvText.trim()) { setError("Bitte CSV-Daten eingeben."); return; }
    setImporting(true); setError(null); setImportResults(null);
    try {
      const res = await fetchWithAuth("/api/hr/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, dry_run: isDryRun }),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import-Fehler");
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(reader.result as string);
    reader.readAsText(file, "utf-8");
  };

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Import / Export</h1>

        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}

        {/* Export Section */}
        <Section title="Export">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card style={{ padding: 20, cursor: "pointer" }} onClick={() => handleExport("datev")}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>DATEV-Export</div>
              <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 4 }}>
                Stammdaten aller aktiven Mitarbeiter im DATEV-kompatiblen CSV-Format.
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: uiTokens.brand, fontWeight: 500 }}>Herunterladen &rarr;</div>
            </Card>
            <Card style={{ padding: 20, cursor: "pointer" }} onClick={() => handleExport("employees")}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Mitarbeiter-Export</div>
              <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 4 }}>
                Vollständiger CSV-Export aller Mitarbeiterdaten.
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: uiTokens.brand, fontWeight: 500 }}>Herunterladen &rarr;</div>
            </Card>
          </div>
        </Section>

        {/* Import Section */}
        <Section title="Massen-Import">
          <Card>
            <div style={{ fontSize: 14, color: uiTokens.textSecondary, marginBottom: 12 }}>
              CSV-Datei mit Spalten: Personalnummer, Vorname, Nachname, Geburtsdatum, Geschlecht,
              Straße, Hausnummer, PLZ, Ort, Telefon, E-Mail privat, Vertragsart, Vertragsbeginn,
              Vertragsende, Wochenstunden, Arbeitstage/Woche, Urlaubstage/Jahr, Abteilung, Position.
              Trennzeichen: Semikolon.
            </div>

            <div style={{ marginBottom: 12 }}>
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload}
                style={{ fontSize: 13 }} />
            </div>

            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Oder CSV hier einfügen..."
              rows={6}
              style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box", resize: "vertical" }}
            />

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={isDryRun} onChange={(e) => setIsDryRun(e.target.checked)} />
                Testlauf (keine Änderungen)
              </label>
              <button onClick={handleImport} disabled={importing}
                style={{
                  marginLeft: "auto", padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                  background: isDryRun ? "#f3f4f6" : uiTokens.brand, color: isDryRun ? uiTokens.textPrimary : "#fff",
                  border: isDryRun ? "1px solid #e5e7eb" : "none", cursor: "pointer", opacity: importing ? 0.6 : 1,
                }}>
                {importing ? "Wird verarbeitet..." : isDryRun ? "Testlauf starten" : "Importieren"}
              </button>
            </div>
          </Card>

          {importResults && (
            <Card style={{ marginTop: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Ergebnis: {importResults.filter((r) => r.status === "created" || r.status === "dry_run").length} OK,
                {" "}{importResults.filter((r) => r.status === "error").length} Fehler
              </div>
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {importResults.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ color: uiTokens.textMuted, minWidth: 50 }}>Z.{r.row}</span>
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                    <span style={{
                      marginLeft: "auto",
                      color: r.status === "error" ? "#dc2626" : r.status === "created" ? "#16a34a" : uiTokens.textSecondary,
                    }}>
                      {r.status === "created" ? "Erstellt" : r.status === "dry_run" ? "OK (Testlauf)" : r.error || "Fehler"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Section>
      </div>
    </main>
  );
}
