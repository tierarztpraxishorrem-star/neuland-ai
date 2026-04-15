"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

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
    <div className="mx-auto max-w-[800px] space-y-6 p-4">
      <h1 className="text-2xl font-bold">Dokumente</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white p-1">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === cat
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {cat === "all" ? "Alle" : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        {loading ? (
          <p className="text-sm text-gray-500">Laden…</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Dokumente vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 p-3"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">{doc.title}</div>
                  <div className="text-xs text-gray-500">
                    {CATEGORY_LABELS[doc.category] || doc.category} –{" "}
                    {formatDateTime(doc.uploaded_at)}
                  </div>
                </div>
                {doc.download_url && (
                  <a
                    href={doc.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Herunterladen
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
