"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Section, Button } from "../../../components/ui/System";

type DocumentCategory =
  | "contract"
  | "payslip"
  | "certificate"
  | "training"
  | "other";

type Document = {
  id: string;
  employee_id: string;
  category: DocumentCategory;
  title: string;
  file_path: string;
  uploaded_at: string;
  download_url: string | null;
};

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contract: "Vertrag",
  payslip: "Gehaltsabrechnung",
  certificate: "Bescheinigung",
  training: "Weiterbildung",
  other: "Sonstiges",
};

const ALL_CATEGORIES: (DocumentCategory | "all")[] = [
  "all",
  "contract",
  "payslip",
  "certificate",
  "training",
  "other",
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState<DocumentCategory | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const categoryParam =
        activeTab !== "all" ? `?category=${activeTab}` : "";
      const res = await fetchWithAuth(`/api/hr/documents${categoryParam}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding, fontFamily: "inherit" }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Dokumente</h1>
        </div>

        {error && (
          <Card style={{ border: "1px solid #fecaca", background: "#fff1f2" }}>
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          </Card>
        )}

        <Card style={{ padding: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: activeTab === cat ? uiTokens.brand : "transparent",
                  color: activeTab === cat ? "#fff" : uiTokens.textSecondary,
                }}
              >
                {cat === "all" ? "Alle" : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </Card>

        <Section title="Meine Dokumente">
          {loading ? <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Laden…</div> : documents.length === 0 ? (
            <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Dokumente vorhanden.</div>
          ) : (
            documents.map((doc) => (
              <Card key={doc.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{doc.title}</div>
                    <div style={{ fontSize: 12, color: uiTokens.textSecondary, marginTop: 2 }}>
                      {CATEGORY_LABELS[doc.category] || doc.category} – {formatDateTime(doc.uploaded_at)}
                    </div>
                  </div>
                  {doc.download_url && (
                    <a href={doc.download_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                      <Button variant="primary" size="sm">Herunterladen</Button>
                    </a>
                  )}
                </div>
              </Card>
            ))
          )}
        </Section>
      </div>
    </main>
  );
}
