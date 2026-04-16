"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { uiTokens, Card, Badge } from "@/components/ui/System";

type Contact = {
  id: string;
  phone: string;
  display_name: string | null;
};

type Conversation = {
  id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contact: Contact;
  assignee: { id: string; display_name: string | null } | null;
};

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  waiting: "Wartet",
  resolved: "Erledigt",
  closed: "Geschlossen",
};

const STATUS_TONES: Record<string, "danger" | "accent" | "success" | "default"> = {
  open: "danger",
  waiting: "accent",
  resolved: "success",
  closed: "default",
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

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days === 1 ? "" : "en"}`;
}

export default function WhatsAppInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "resolved" | "all">(
    "active"
  );

  const loadConversations = useCallback(async () => {
    try {
      setError(null);
      const statusParam =
        filter === "active"
          ? "open,waiting"
          : filter === "resolved"
            ? "resolved,closed"
            : "open,waiting,resolved,closed";
      const res = await fetchWithAuth(
        `/api/whatsapp/conversations?status=${statusParam}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setConversations(data.conversations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadConversations();
    // Poll every 15s for new messages
    const interval = setInterval(loadConversations, 15000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  const totalUnread = conversations.reduce(
    (sum, c) => sum + c.unread_count,
    0
  );

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>WhatsApp Inbox</h1>
            {totalUnread > 0 && (
              <span style={{
                borderRadius: 999, background: "#ef4444", color: "#fff",
                padding: "2px 10px", fontSize: 12, fontWeight: 700,
              }}>
                {totalUnread}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, borderRadius: uiTokens.radiusCard, border: "1px solid #fca5a5", background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, borderRadius: uiTokens.radiusCard, background: "#f3f4f6", padding: 4 }}>
          {(["active", "resolved", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "8px 16px", borderRadius: 12, fontSize: 14, fontWeight: 500,
                border: "none", cursor: "pointer",
                background: filter === f ? "#fff" : "transparent",
                boxShadow: filter === f ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                color: filter === f ? uiTokens.textPrimary : uiTokens.textSecondary,
              }}
            >
              {f === "active" ? "Aktiv" : f === "resolved" ? "Erledigt" : "Alle"}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <Card style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 16, fontSize: 14, color: uiTokens.textMuted }}>Laden…</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: 16, fontSize: 14, color: uiTokens.textMuted }}>Keine Konversationen.</div>
          ) : (
            <div>
              {conversations.map((conv, idx) => (
                <Link
                  key={conv.id}
                  href={`/kommunikation/whatsapp/${conv.id}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", textDecoration: "none", color: "inherit",
                    borderTop: idx > 0 ? "1px solid #f3f4f6" : "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", background: "#dcfce7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, flexShrink: 0,
                  }}>
                    💬
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: uiTokens.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {conv.contact?.display_name || conv.contact?.phone || "Unbekannt"}
                      </span>
                      <span style={{ fontSize: 12, color: uiTokens.textMuted, flexShrink: 0 }}>
                        {timeAgo(conv.last_message_at)}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, color: uiTokens.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {conv.last_message_preview || "—"}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, paddingLeft: 8 }}>
                        <Badge tone={STATUS_TONES[conv.status] || "accent"}>
                          {STATUS_LABELS[conv.status] || conv.status}
                        </Badge>
                        {conv.unread_count > 0 && (
                          <span style={{
                            width: 20, height: 20, borderRadius: "50%", background: "#22c55e",
                            color: "#fff", fontSize: 10, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                    {conv.assignee?.display_name && (
                      <div style={{ fontSize: 11, color: uiTokens.textMuted }}>
                        Zugewiesen: {conv.assignee.display_name}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
