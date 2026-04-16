"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { uiTokens, Card, Button, TextAreaInput, Badge } from "@/components/ui/System";
import { MAIL_CATEGORIES, categoryStyle } from "@/lib/mailCategories";

type MailAddress = { name?: string; address: string };

type MailMessageFull = {
  id: string;
  subject: string;
  from?: MailAddress;
  toRecipients: MailAddress[];
  ccRecipients?: MailAddress[];
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance?: "low" | "normal" | "high";
  bodyContentType: "text" | "html";
  body: string;
  webLink?: string;
  categories?: string[];
};

type Attachment = {
  id: string;
  name: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
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

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFull(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addrLabel(a?: MailAddress): string {
  if (!a) return "";
  if (a.name) return `${a.name} <${a.address}>`;
  return a.address;
}

function sanitizeHtmlBody(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/on\w+\s*=\s*(["']).*?\1/gi, "")
    .replace(/javascript:/gi, "");
}

export default function MailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const messageId = decodeURIComponent(String(params?.id || ""));

  const [message, setMessage] = useState<MailMessageFull | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyAll, setReplyAll] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyInfo, setReplyInfo] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");

  const [categorySaving, setCategorySaving] = useState(false);

  const load = useCallback(async () => {
    if (!messageId) return;
    try {
      setError(null);
      const res = await fetchWithAuth(`/api/mail/messages/${encodeURIComponent(messageId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setMessage(data.message);
      setAttachments(data.attachments || []);
      // Mark as read if unread
      if (data.message && !data.message.isRead) {
        fetchWithAuth(`/api/mail/messages/${encodeURIComponent(messageId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isRead: true }),
        }).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [messageId]);

  useEffect(() => {
    load();
  }, [load]);

  const sanitizedBody = useMemo(() => {
    if (!message) return "";
    if (message.bodyContentType === "html") return sanitizeHtmlBody(message.body);
    return message.body;
  }, [message]);

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    setReplyInfo(null);
    setError(null);
    if (!replyBody.trim()) {
      setError("Antworttext fehlt.");
      return;
    }
    try {
      setReplySending(true);
      const res = await fetchWithAuth(`/api/mail/messages/${encodeURIComponent(messageId)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody, replyAll }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Versand fehlgeschlagen.");
      setReplyInfo("✅ Antwort gesendet.");
      setReplyBody("");
      setTimeout(() => { setReplyOpen(false); setReplyInfo(null); }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setReplySending(false);
    }
  }

  async function toggleCategory(cat: string) {
    if (!message) return;
    const current = new Set(message.categories || []);
    if (current.has(cat)) current.delete(cat);
    else current.add(cat);
    const next = Array.from(current);

    // optimistic update
    setMessage({ ...message, categories: next });
    setCategorySaving(true);
    try {
      const res = await fetchWithAuth(`/api/mail/messages/${encodeURIComponent(messageId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Kategorie konnte nicht gespeichert werden.");
      }
    } catch (err) {
      // revert
      setMessage({ ...message, categories: message.categories || [] });
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleAiDraft() {
    setError(null);
    setAiLoading(true);
    try {
      const res = await fetchWithAuth("/api/mail/draft-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          instruction: aiInstruction || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "KI-Entwurf fehlgeschlagen.");
      setReplyBody(data.draft || "");
      setReplyOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
        <div style={{ maxWidth: 900, margin: "0 auto", color: uiTokens.textSecondary }}>Laden…</div>
      </main>
    );
  }

  if (error && !message) {
    return (
      <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 16 }}>
          <Card style={{ border: "1px solid #fca5a5", background: "#fef2f2" }}>
            <div style={{ color: "#b91c1c", fontSize: 14 }}>{error}</div>
          </Card>
          <div><Button variant="secondary" onClick={() => router.back()}>← Zurück</Button></div>
        </div>
      </main>
    );
  }

  if (!message) return null;

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <Link href="/kommunikation/mail" style={{ color: uiTokens.textSecondary, fontSize: 13, textDecoration: "none" }}>
            ← Zurück zum Posteingang
          </Link>
        </div>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: uiTokens.textPrimary, wordBreak: "break-word" }}>
                {message.subject}
              </h1>
              <div style={{ marginTop: 10, fontSize: 13, color: uiTokens.textSecondary, display: "grid", gap: 4 }}>
                <div>
                  <strong style={{ color: uiTokens.textPrimary }}>Von:</strong> {addrLabel(message.from)}
                </div>
                <div>
                  <strong style={{ color: uiTokens.textPrimary }}>An:</strong>{" "}
                  {message.toRecipients.map(addrLabel).join(", ") || "–"}
                </div>
                {message.ccRecipients && message.ccRecipients.length > 0 && (
                  <div>
                    <strong style={{ color: uiTokens.textPrimary }}>CC:</strong>{" "}
                    {message.ccRecipients.map(addrLabel).join(", ")}
                  </div>
                )}
                <div>{formatFull(message.receivedDateTime)}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              {message.importance === "high" && <Badge tone="danger">Hohe Priorität</Badge>}
              {message.webLink && (
                <a href={message.webLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <Button variant="ghost" size="sm">In Outlook öffnen ↗</Button>
                </a>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "#f8fafc", border: uiTokens.cardBorder }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: uiTokens.textSecondary, marginBottom: 6 }}>
              Bearbeitungs-Status {categorySaving && <span style={{ fontWeight: 400 }}>· speichert…</span>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MAIL_CATEGORIES.map((cat) => {
                const s = categoryStyle(cat);
                const active = (message.categories || []).includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    disabled={categorySaving}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      border: `1px solid ${active ? s.border : "#e5e7eb"}`,
                      background: active ? s.bg : "#fff",
                      color: active ? s.fg : uiTokens.textSecondary,
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      cursor: categorySaving ? "wait" : "pointer",
                    }}
                  >
                    {active ? "✓ " : ""}{cat}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: uiTokens.textSecondary, marginTop: 6 }}>
              Kategorien werden in Outlook und Neuland AI synchron angezeigt.
            </div>
          </div>

          {attachments.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#f8fafc", border: uiTokens.cardBorder }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: uiTokens.textSecondary, marginBottom: 6 }}>
                📎 Anhänge ({attachments.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {attachments.filter((a) => !a.isInline).map((a) => (
                  <a
                    key={a.id}
                    href={`/api/mail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(a.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      fontSize: 12,
                      color: uiTokens.textPrimary,
                      textDecoration: "none",
                    }}
                  >
                    📄 {a.name} {formatSize(a.size) && <span style={{ color: uiTokens.textSecondary }}>({formatSize(a.size)})</span>}
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          {message.bodyContentType === "html" ? (
            <div
              style={{ fontSize: 14, lineHeight: 1.6, color: uiTokens.textPrimary, maxWidth: "100%", overflow: "auto" }}
              dangerouslySetInnerHTML={{ __html: sanitizedBody }}
            />
          ) : (
            <pre style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: uiTokens.textPrimary,
              fontFamily: "inherit",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
            }}>
              {sanitizedBody}
            </pre>
          )}
        </Card>

        {error && (
          <Card style={{ border: "1px solid #fca5a5", background: "#fef2f2" }}>
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          </Card>
        )}

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: uiTokens.textPrimary }}>Antworten</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button
                variant={!replyAll ? "primary" : "secondary"}
                size="sm"
                onClick={() => { setReplyAll(false); setReplyOpen(true); }}
              >
                ↩ Antworten
              </Button>
              {(message.ccRecipients?.length || message.toRecipients.length > 1) && (
                <Button
                  variant={replyAll ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => { setReplyAll(true); setReplyOpen(true); }}
                >
                  ↩↩ Allen antworten
                </Button>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Button variant="secondary" size="sm" onClick={handleAiDraft} disabled={aiLoading}>
                {aiLoading ? "Entwurf wird erstellt…" : "✨ KI-Entwurf"}
              </Button>
              <input
                type="text"
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="Optional: Zusätzliche Anweisung an die KI"
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: uiTokens.cardBorder,
                  fontSize: 13,
                  background: "#fff",
                  outline: "none",
                }}
              />
            </div>

            {replyOpen && (
              <form onSubmit={handleSendReply} style={{ display: "grid", gap: 10 }}>
                <TextAreaInput
                  label={replyAll ? "Antwort an alle Empfänger" : `Antwort an ${addrLabel(message.from)}`}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  style={{ minHeight: 200 }}
                />
                {replyInfo && (
                  <div style={{ fontSize: 12, color: "#166534" }}>{replyInfo}</div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <Button type="submit" variant="primary" disabled={replySending || !replyBody.trim()}>
                    {replySending ? "Sendet…" : "Senden"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setReplyOpen(false)} disabled={replySending}>
                    Schließen
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
