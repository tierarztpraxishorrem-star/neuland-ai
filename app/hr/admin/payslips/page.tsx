"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import {
  uiTokens,
  Card,
  Section,
  Button,
  Input,
  SelectInput,
} from "../../../../components/ui/System";

type Payslip = {
  id: string;
  employee_id: string;
  title: string;
  month: number;
  year: number;
  file_path: string;
  file_size: number | null;
  created_at: string;
};

type Employee = {
  id: string;
  user_id: string;
  role: string;
  employment_status: string;
  display_name: string | null;
  email: string;
  auth_full_name: string | null;
};

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function fetchWithAuth(url: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht angemeldet.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

function employeeLabel(e: Employee) {
  return e.display_name || e.auth_full_name || e.email || e.id.slice(0, 8);
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

export default function AdminPayslipsPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());

  const [showUpload, setShowUpload] = useState(false);
  const [uploadEmployee, setUploadEmployee] = useState<string>("");
  const [uploadMonth, setUploadMonth] = useState<number>(new Date().getMonth() + 1);
  const [uploadYear, setUploadYear] = useState<number>(new Date().getFullYear());
  const [uploadTitle, setUploadTitle] = useState<string>("");
  const [uploadTitleDirty, setUploadTitleDirty] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const employeeMap = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    const years = new Set<number>([current]);
    for (const p of payslips) years.add(p.year);
    return [...years].sort((a, b) => b - a);
  }, [payslips]);

  const autoTitle = useMemo(
    () => `Gehaltsabrechnung ${MONTH_NAMES[uploadMonth - 1]} ${uploadYear}`,
    [uploadMonth, uploadYear]
  );

  useEffect(() => {
    if (!uploadTitleDirty) setUploadTitle(autoTitle);
  }, [autoTitle, uploadTitleDirty]);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/admin/employees");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mitarbeiter konnten nicht geladen werden.");
      setEmployees(data.employees || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }, []);

  const loadPayslips = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const params = new URLSearchParams({ year: String(filterYear) });
      if (filterEmployee !== "all") params.set("employee_id", filterEmployee);
      const res = await fetchWithAuth(`/api/hr/payslips?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setPayslips(data.payslips || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [filterEmployee, filterYear]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadPayslips();
  }, [loadPayslips]);

  function resetUploadForm() {
    setUploadEmployee("");
    setUploadMonth(new Date().getMonth() + 1);
    setUploadYear(new Date().getFullYear());
    setUploadTitle("");
    setUploadTitleDirty(false);
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!uploadEmployee) {
      setError("Bitte Mitarbeiter auswählen.");
      return;
    }
    if (!uploadFile) {
      setError("Bitte PDF auswählen.");
      return;
    }
    if (uploadFile.type !== "application/pdf") {
      setError("Nur PDF-Dateien sind erlaubt.");
      return;
    }
    if (uploadFile.size > MAX_FILE_SIZE) {
      setError("Datei überschreitet 10 MB.");
      return;
    }

    try {
      setUploading(true);
      const form = new FormData();
      form.append("employee_id", uploadEmployee);
      form.append("title", uploadTitle.trim() || autoTitle);
      form.append("month", String(uploadMonth));
      form.append("year", String(uploadYear));
      form.append("file", uploadFile);

      const res = await fetchWithAuth("/api/hr/payslips", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen.");

      setInfo("Gehaltsabrechnung hochgeladen.");
      resetUploadForm();
      setShowUpload(false);
      await loadPayslips();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Diese Gehaltsabrechnung wirklich löschen?")) return;
    try {
      setDeletingId(id);
      setError(null);
      const res = await fetchWithAuth(`/api/hr/payslips/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen.");
      setPayslips((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDownload(id: string) {
    try {
      setDownloadingId(id);
      const res = await fetchWithAuth(`/api/hr/payslips/${id}`);
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Download-Link konnte nicht erstellt werden.");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding, fontFamily: "inherit" }}>
      <div style={{ width: "min(960px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Lohnunterlagen verwalten</h1>
            <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 4 }}>
              Gehaltsabrechnungen pro Mitarbeiter hochladen
            </div>
          </div>
          <Button variant="primary" onClick={() => setShowUpload((s) => !s)}>
            {showUpload ? "Abbrechen" : "+ Hochladen"}
          </Button>
        </div>

        {error && (
          <Card style={{ border: "1px solid #fecaca", background: "#fff1f2" }}>
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          </Card>
        )}
        {info && (
          <Card style={{ border: "1px solid #bbf7d0", background: "#f0fdf4" }}>
            <div style={{ fontSize: 13, color: "#166534" }}>{info}</div>
          </Card>
        )}

        {showUpload && (
          <Section title="Neue Gehaltsabrechnung">
            <form onSubmit={handleUpload} style={{ display: "grid", gap: 12 }}>
              <SelectInput
                label="Mitarbeiter"
                value={uploadEmployee}
                onChange={(e) => setUploadEmployee(e.target.value)}
                required
              >
                <option value="">– auswählen –</option>
                {employees
                  .filter((e) => e.employment_status === "active")
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {employeeLabel(e)}
                    </option>
                  ))}
              </SelectInput>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <SelectInput
                  label="Monat"
                  value={String(uploadMonth)}
                  onChange={(e) => setUploadMonth(Number(e.target.value))}
                  required
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </SelectInput>
                <Input
                  label="Jahr"
                  type="number"
                  min={2000}
                  max={2100}
                  value={uploadYear}
                  onChange={(e) => setUploadYear(Number(e.target.value))}
                  required
                />
              </div>

              <Input
                label="Titel"
                value={uploadTitle}
                onChange={(e) => {
                  setUploadTitle(e.target.value);
                  setUploadTitleDirty(true);
                }}
                placeholder={autoTitle}
                required
              />

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: uiTokens.textSecondary }}>PDF-Datei (max. 10 MB)</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  required
                  style={{ fontSize: 13 }}
                />
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <Button type="submit" variant="primary" disabled={uploading}>
                  {uploading ? "Lädt hoch…" : "Hochladen"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { resetUploadForm(); setShowUpload(false); }}>
                  Abbrechen
                </Button>
              </div>
            </form>
          </Section>
        )}

        <Card style={{ padding: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 200 }}>
              <SelectInput
                label="Mitarbeiter"
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
              >
                <option value="all">Alle</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {employeeLabel(e)}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div style={{ minWidth: 120 }}>
              <SelectInput
                label="Jahr"
                value={String(filterYear)}
                onChange={(e) => setFilterYear(Number(e.target.value))}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </SelectInput>
            </div>
          </div>
        </Card>

        <Section title="Hochgeladene Abrechnungen">
          {loading ? (
            <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Laden…</div>
          ) : payslips.length === 0 ? (
            <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>
              Keine Abrechnungen für den Filter vorhanden.
            </div>
          ) : (
            payslips.map((p) => {
              const emp = employeeMap.get(p.employee_id);
              return (
                <Card key={p.id} style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {emp ? employeeLabel(emp) : "–"}
                        <span style={{ color: uiTokens.textSecondary, fontWeight: 400 }}>
                          {" · "}{MONTH_NAMES[p.month - 1]} {p.year}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: uiTokens.textSecondary, marginTop: 2 }}>
                        {p.title}
                        {" · "}Hochgeladen {formatDate(p.created_at)}
                        {p.file_size ? ` · ${formatSize(p.file_size)}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={downloadingId === p.id}
                        onClick={() => handleDownload(p.id)}
                      >
                        {downloadingId === p.id ? "Öffne…" : "Download"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === p.id}
                        onClick={() => handleDelete(p.id)}
                        style={{ color: "#b91c1c" }}
                      >
                        {deletingId === p.id ? "Lösche…" : "Löschen"}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </Section>
      </div>
    </main>
  );
}
