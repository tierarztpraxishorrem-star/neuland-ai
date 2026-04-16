"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { uiTokens, Card, Button, Input, TextAreaInput } from "@/components/ui/System";

type Template = {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht angemeldet.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function MailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Template editor
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  // Signature editor
  const [signature, setSignature] = useState("");
  const [signatureInitial, setSignatureInitial] = useState("");
  const [signatureSaving, setSignatureSaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const [tRes, sRes] = await Promise.all([
        fetchWithAuth("/api/mail/templates"),
        fetchWithAuth("/api/mail/signature"),
      ]);
      const tData = await tRes.json();
      if (!tRes.ok) throw new Error(tData.error || "Vorlagen konnten nicht geladen werden.");
      setTemplates(tData.templates || []);
      const sData = await sRes.json();
      if (sRes.ok) {
        setSignature(sData.signature || "");
        setSignatureInitial(sData.signature || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  function startNew() {
    setEditing({ id: "", name: "", subject: null, body: "", created_at: "", updated_at: "" });
    setName("");
    setSubject("");
    setBody("");
  }

  function startEdit(t: Template) {
    setEditing(t);
    setName(t.name);
    setSubject(t.subject || "");
    setBody(t.body);
  }

  async function handleSave() {
    setError(null);
    setInfo(null);
    if (!name.trim()) { setError("Name fehlt."); return; }
    if (!body.trim()) { setError("Inhalt fehlt."); return; }
    try {
      setSaving(true);
      const isNew = !editing?.id;
      const url = isNew ? "/api/mail/templates" : `/api/mail/templates/${editing!.id}`;
      const res = await fetchWithAuth(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject: subject || null, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen.");
      setInfo(isNew ? "✅ Vorlage angelegt." : "✅ Vorlage aktualisiert.");
      setEditing(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`Vorlage "${t.name}" wirklich löschen?`)) return;
    try {
      const res = await fetchWithAuth(`/api/mail/templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Löschen fehlgeschlagen.");
      }
      setInfo("🗑 Vorlage gelöscht.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  async function saveSignature() {
    setError(null);
    setInfo(null);
    try {
      setSignatureSaving(true);
      const res = await fetchWithAuth("/api/mail/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signatur konnte nicht gespeichert werden.");
      setSignatureInitial(signature);
      setInfo("✅ Signatur gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSignatureSaving(false);
    }
  }

  const signatureDirty = signature !== signatureInitial;

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <Link href="/kommunikation/mail" style={{ color: uiTokens.textSecondary, fontSize: 13, textDecoration: "none" }}>
            ← Zurück zum Posteingang
          </Link>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: uiTokens.brand, margin: "8px 0 0 0" }}>
            ✏️ Vorlagen &amp; Signatur
          </h1>
        </div>

        {error && (
          <Card style={{ border: "1px solid #fca5a5", background: "#fef2f2" }}>
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          </Card>
        )}
        {info && (
          <Card style={{ border: "1px solid #bbf7d0", background: "#f0fdf4" }}>
            <div style={{ fontSize: 13, color: "#166534" }}>{info}</div>
          </Card>
        )}

        {/* Signatur */}
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: uiTokens.textPrimary }}>
            📝 Signatur
          </div>
          <div style={{ fontSize: 12, color: uiTokens.textSecondary, marginBottom: 8 }}>
            Wird automatisch ans Ende jeder neuen Mail und Antwort angehängt. Nur Admins können ändern.
          </div>
          <TextAreaInput
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            style={{ minHeight: 140, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            placeholder={`Freundliche Grüße\n\nTierarztpraxis Horrem\nEmpfang\nTel: ...`}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={saveSignature} disabled={!signatureDirty || signatureSaving}>
              {signatureSaving ? "Speichert…" : "Signatur speichern"}
            </Button>
            {signatureDirty && (
              <Button variant="ghost" onClick={() => setSignature(signatureInitial)} disabled={signatureSaving}>
                Zurücksetzen
              </Button>
            )}
          </div>
        </Card>

        {/* Templates list */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: uiTokens.textPrimary }}>
              📄 Vorlagen ({templates.length})
            </div>
            <Button variant="primary" size="sm" onClick={startNew} disabled={!!editing}>+ Neue Vorlage</Button>
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>Laden…</div>
          ) : templates.length === 0 && !editing ? (
            <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>
              Noch keine Vorlagen. Lege z.B. Vorlagen für &bdquo;Terminbestätigung&ldquo;, &bdquo;Abwesenheit&ldquo; oder &bdquo;Rückfrage zum Tier&ldquo; an.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {templates.map((t) => (
                <div key={t.id} style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "#f8fafc",
                  border: uiTokens.cardBorder,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: uiTokens.textPrimary }}>{t.name}</div>
                    {t.subject && (
                      <div style={{ fontSize: 12, color: uiTokens.textSecondary, marginTop: 2 }}>
                        Betreff: {t.subject}
                      </div>
                    )}
                    <div style={{
                      fontSize: 12,
                      color: uiTokens.textSecondary,
                      marginTop: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {t.body.slice(0, 200)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Button variant="secondary" size="sm" onClick={() => startEdit(t)}>✎</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(t)} style={{ color: "#b91c1c" }}>🗑</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Editor */}
        {editing && (
          <Card>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: uiTokens.textPrimary }}>
              {editing.id ? "Vorlage bearbeiten" : "Neue Vorlage"}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <Input label="Name (intern)" value={name} onChange={(e) => setName(e.target.value)} required placeholder="z.B. Terminbestätigung" />
              <Input label="Betreff (optional)" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Wird in Compose vorausgefüllt" />
              <TextAreaInput label="Inhalt" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 200 }} required />
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Speichert…" : "Speichern"}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Abbrechen</Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
