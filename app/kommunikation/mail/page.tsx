"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { uiTokens, Card, Button, Input, SelectInput, TextAreaInput, Badge } from "@/components/ui/System";

type MailMessage = {
  id: string;
  subject: string;
  bodyPreview: string;
  from?: { name?: string; address: string };
  toRecipients: Array<{ name?: string; address: string }>;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance?: "low" | "normal" | "high";
};

type Folder = "inbox" | "sentitems" | "drafts" | "archive";

const FOLDER_LABELS: Record<Folder, string> = {
  inbox: "Posteingang",
  sentitems: "Gesendet",
  drafts: "Entwürfe",
  archive: "Archiv",
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

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function senderLabel(m: MailMessage): string {
  if (m.from?.name) return m.from.name;
  if (m.from?.address) return m.from.address;
  return "Unbekannt";
}

export default function MailInboxPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [search, setSearch] = useState("");
  const [showCompose, setShowCompose] = useState(false);

  // Compose form
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeInfo, setComposeInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({ folder, limit: "50" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetchWithAuth(`/api/mail/messages?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [folder, search]);

  useEffect(() => {
    load();
    // Poll every 30s (nur Inbox)
    if (folder === "inbox") {
      const interval = setInterval(load, 30000);
      return () => clearInterval(interval);
    }
  }, [load, folder]);

  const unreadCount = messages.filter((m) => !m.isRead && folder === "inbox").length;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setComposeInfo(null);
    setError(null);
    if (!composeTo.trim()) {
      setError("Empfänger fehlt.");
      return;
    }
    if (!composeSubject.trim()) {
      setError("Betreff fehlt.");
      return;
    }
    if (!composeBody.trim()) {
      setError("Inhalt fehlt.");
      return;
    }
    try {
      setComposeSending(true);
      const res = await fetchWithAuth("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          cc: composeCc,
          subject: composeSubject,
          body: composeBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Versand fehlgeschlagen.");
      setComposeInfo("✅ Gesendet.");
      setComposeTo("");
      setComposeCc("");
      setComposeSubject("");
      setComposeBody("");
      setTimeout(() => { setShowCompose(false); setComposeInfo(null); }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setComposeSending(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(960px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>
              📧 E-Mail
            </h1>
            {unreadCount > 0 && folder === "inbox" && (
              <span style={{
                borderRadius: 999, background: "#ef4444", color: "#fff",
                padding: "2px 10px", fontSize: 12, fontWeight: 700,
              }}>
                {unreadCount} neu
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={() => load()}>🔄 Aktualisieren</Button>
            <Button variant="primary" onClick={() => setShowCompose((v) => !v)}>
              {showCompose ? "Abbrechen" : "✏️ Neue Mail"}
            </Button>
          </div>
        </div>

        {error && (
          <Card style={{ border: "1px solid #fca5a5", background: "#fef2f2" }}>
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          </Card>
        )}

        {showCompose && (
          <Card>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: uiTokens.textPrimary }}>
              Neue E-Mail
            </div>
            <form onSubmit={handleSend} style={{ display: "grid", gap: 10 }}>
              <Input
                label="An"
                placeholder="empfaenger@beispiel.de (mehrere mit Komma trennen)"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                required
              />
              <Input
                label="CC (optional)"
                placeholder="cc@beispiel.de"
                value={composeCc}
                onChange={(e) => setComposeCc(e.target.value)}
              />
              <Input
                label="Betreff"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                required
              />
              <TextAreaInput
                label="Nachricht"
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                style={{ minHeight: 200 }}
                required
              />
              {composeInfo && (
                <div style={{ fontSize: 12, color: "#166534" }}>{composeInfo}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Button type="submit" variant="primary" disabled={composeSending}>
                  {composeSending ? "Sendet…" : "Senden"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCompose(false)} disabled={composeSending}>
                  Verwerfen
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card style={{ padding: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ minWidth: 160 }}>
              <SelectInput
                value={folder}
                onChange={(e) => setFolder(e.target.value as Folder)}
              >
                {(Object.keys(FOLDER_LABELS) as Folder[]).map((f) => (
                  <option key={f} value={f}>{FOLDER_LABELS[f]}</option>
                ))}
              </SelectInput>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <Input
                placeholder="🔍 Suchen (Absender, Betreff, Inhalt)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); load(); } }}
              />
            </div>
            {search && (
              <Button variant="ghost" onClick={() => { setSearch(""); setTimeout(load, 0); }}>
                ✕
              </Button>
            )}
          </div>
        </Card>

        {loading ? (
          <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Laden…</div>
        ) : messages.length === 0 ? (
          <Card style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>
              Keine E-Mails in diesem Ordner.
            </div>
          </Card>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {messages.map((m) => (
              <Card
                key={m.id}
                onClick={() => router.push(`/kommunikation/mail/${encodeURIComponent(m.id)}`)}
                style={{
                  padding: 14,
                  cursor: "pointer",
                  borderLeft: !m.isRead ? `4px solid ${uiTokens.brand}` : undefined,
                  background: !m.isRead ? "#f0fdfa" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: m.isRead ? 500 : 700,
                      color: uiTokens.textPrimary,
                      marginBottom: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {senderLabel(m)}
                      {m.hasAttachments && <span style={{ marginLeft: 6 }}>📎</span>}
                      {m.importance === "high" && <span style={{ marginLeft: 6 }}>❗</span>}
                    </div>
                    <div style={{
                      fontSize: 13,
                      fontWeight: m.isRead ? 400 : 600,
                      color: uiTokens.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {m.subject}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: uiTokens.textSecondary,
                      marginTop: 3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {m.bodyPreview}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ fontSize: 11, color: uiTokens.textSecondary, whiteSpace: "nowrap" }}>
                      {formatDate(m.receivedDateTime)}
                    </div>
                    {!m.isRead && folder === "inbox" && <Badge tone="accent">NEU</Badge>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div>
          <Link href="/kommunikation" style={{ color: uiTokens.textSecondary, fontSize: 13, textDecoration: "none" }}>
            ← Zurück zur Kommunikations-Übersicht
          </Link>
        </div>
      </div>
    </main>
  );
}
