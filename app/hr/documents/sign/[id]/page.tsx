"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { uiTokens, Card } from "../../../../../components/ui/System";

type Signature = {
  id: string;
  document_id: string;
  status: string;
  requested_at: string;
  expires_at: string | null;
  hr_documents: {
    id: string;
    title: string;
    category: string;
    file_path: string;
  } | null;
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function SignDocumentPage() {
  const { id: documentId } = useParams<{ id: string }>();
  const router = useRouter();
  const [signature, setSignature] = useState<Signature | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/hr/documents/pending-signatures");
      if (!res) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const found = (data.signatures || []).find(
        (s: Signature) => s.document_id === documentId
      );
      setSignature(found || null);
      if (!found) setError("Keine offene Signatur-Anfrage für dieses Dokument gefunden.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (action: "sign" | "reject") => {
    if (action === "sign" && !confirmed) {
      setError("Bitte bestätigen Sie die Zustimmung.");
      return;
    }
    setActing(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/hr/documents/${documentId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res) throw new Error("Nicht angemeldet.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(action === "sign" ? "Dokument erfolgreich signiert." : "Signatur abgelehnt.");
      setTimeout(() => router.push("/hr/documents"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setActing(false);
    }
  };

  const doc = signature?.hr_documents;

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(600px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <button onClick={() => router.push("/hr/documents")} style={{ background: "none", border: "none", color: uiTokens.brand, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 4 }}>
            &larr; Zurück zu Dokumenten
          </button>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Dokument signieren</h1>
        </div>

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}
        {error && <Card style={{ background: "#fef2f2", border: "1px solid #fecaca" }}><div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div></Card>}
        {success && <Card style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}><div style={{ color: "#16a34a", fontSize: 14 }}>{success}</div></Card>}

        {signature && doc && !success && (
          <>
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{doc.title}</div>
              <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 4 }}>
                Kategorie: {doc.category} | Angefragt am: {new Date(signature.requested_at).toLocaleDateString("de-DE")}
                {signature.expires_at && <span> | Gültig bis: {new Date(signature.expires_at).toLocaleDateString("de-DE")}</span>}
              </div>
            </Card>

            <Card style={{ border: `2px solid ${uiTokens.brand}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Digitale Zustimmung</div>
              <div style={{ fontSize: 13, color: uiTokens.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>
                Mit der Signatur bestätigen Sie, dass Sie das oben genannte Dokument gelesen haben
                und mit dem Inhalt einverstanden sind. Diese Zustimmung wird mit Zeitstempel und
                technischen Daten protokolliert.
              </div>

              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 14, marginBottom: 16 }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); setError(null); }} />
                Ich habe das Dokument gelesen und stimme zu.
              </label>

              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => handleAction("sign")} disabled={acting || !confirmed}
                  style={{
                    padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                    background: confirmed ? "#16a34a" : "#d1d5db", color: "#fff", border: "none",
                    cursor: confirmed ? "pointer" : "not-allowed", opacity: acting ? 0.6 : 1,
                  }}>
                  {acting ? "Wird signiert..." : "Signieren"}
                </button>
                <button onClick={() => handleAction("reject")} disabled={acting}
                  style={{
                    padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 500,
                    background: "#fff", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer",
                    opacity: acting ? 0.6 : 1,
                  }}>
                  Ablehnen
                </button>
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
