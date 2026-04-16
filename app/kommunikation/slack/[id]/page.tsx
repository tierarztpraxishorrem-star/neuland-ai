"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { uiTokens } from "@/components/ui/System";

type SlackMessage = {
  ts: string;
  user?: string;
  bot_id?: string;
  text: string;
  thread_ts?: string;
  reply_count?: number;
  files?: {
    id: string;
    name: string;
    url_private: string;
    mimetype: string;
    thumb_360?: string;
  }[];
  reactions?: { name: string; count: number; users: string[] }[];
};

type ChannelInfo = {
  id: string;
  name: string;
  topic: { value: string };
  purpose: { value: string };
  num_members: number;
  is_private: boolean;
};

type UserMap = Record<string, { name: string; avatar: string }>;

async function fetchWithAuth(url: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht angemeldet.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

function formatSlackTs(ts: string) {
  const date = new Date(parseFloat(ts) * 1000);
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSlackDate(ts: string) {
  const date = new Date(parseFloat(ts) * 1000);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Basic Slack mrkdwn → HTML
function renderSlackText(text: string, userMap: UserMap): string {
  let html = text;
  // User mentions: <@U123> → @Name
  html = html.replace(/<@(U[A-Z0-9]+)>/g, (_, id) => {
    const u = userMap[id];
    return `<span style="border-radius:4px;background:#f3e8ff;padding:0 4px;color:#7c3aed;font-size:12px;font-weight:500">@${u?.name || id}</span>`;
  });
  // Channel links: <#C123|name> → #name
  html = html.replace(/<#([A-Z0-9]+)\|([^>]+)>/g, (_, _id, name) => {
    return `<span style="color:${uiTokens.brand}">#${name}</span>`;
  });
  // URLs: <url|label> or <url>
  html = html.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, `<a href="$1" target="_blank" rel="noopener noreferrer" style="color:${uiTokens.brand};text-decoration:underline">$2</a>`);
  html = html.replace(/<(https?:\/\/[^>]+)>/g, `<a href="$1" target="_blank" rel="noopener noreferrer" style="color:${uiTokens.brand};text-decoration:underline">$1</a>`);
  // Bold: *text*
  html = html.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  // Italic: _text_
  html = html.replace(/(?<!\w)_([^_]+)_(?!\w)/g, "<em>$1</em>");
  // Code: `text`
  html = html.replace(/`([^`]+)`/g, '<code style="border-radius:4px;background:#f3f4f6;padding:0 4px;font-size:12px">$1</code>');
  // Newlines
  html = html.replace(/\n/g, "<br/>");
  return html;
}

export default function SlackChannelPage() {
  const params = useParams();
  const channelId = params.id as string;

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [userMap, setUserMap] = useState<UserMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Thread
  const [threadTs, setThreadTs] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<SlackMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // Compose
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth(
        `/api/slack/channels/${channelId}/messages`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setChannel(data.channel || null);
      setMessages((data.messages || []).reverse()); // API returns newest-first
      setUserMap(data.userMap || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  const loadThread = useCallback(
    async (ts: string) => {
      setThreadLoading(true);
      try {
        const res = await fetchWithAuth(
          `/api/slack/channels/${channelId}/messages?thread_ts=${ts}`
        );
        const data = await res.json();
        if (res.ok) setThreadMessages(data.messages || []);
      } catch {
        // ignore
      } finally {
        setThreadLoading(false);
      }
    },
    [channelId]
  );

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 15000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (threadTs) loadThread(threadTs);
  }, [threadTs, loadThread]);

  async function handleSend() {
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/slack/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          text: draft.trim(),
          thread_ts: threadTs || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Senden.");
      setDraft("");
      if (threadTs) {
        await loadThread(threadTs);
      }
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSending(false);
    }
  }

  async function handleReaction(ts: string, emoji: string) {
    try {
      await fetchWithAuth("/api/slack/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "react",
          channel_id: channelId,
          timestamp: ts,
          emoji,
        }),
      });
      await loadMessages();
    } catch {
      // ignore
    }
  }

  // Group messages by date
  const grouped: { date: string; msgs: SlackMessage[] }[] = [];
  for (const m of messages) {
    const d = formatSlackDate(m.ts);
    if (grouped.length === 0 || grouped[grouped.length - 1].date !== d) {
      grouped.push({ date: d, msgs: [m] });
    } else {
      grouped[grouped.length - 1].msgs.push(m);
    }
  }

  const channelLabel = channel
    ? `${channel.is_private ? "🔒" : "#"} ${channel.name}`
    : "Channel";

  const quickEmojis = ["👍", "✅", "👀", "❤️", "🎉"];

  function MessageBubble({
    msg,
    isThread = false,
  }: {
    msg: SlackMessage;
    isThread?: boolean;
  }) {
    const sender = msg.user ? userMap[msg.user] : null;
    const [showReactions, setShowReactions] = useState(false);
    const [hovered, setHovered] = useState(false);

    return (
      <div
        style={{ marginBottom: 12, display: "flex", gap: 10 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Avatar */}
        {sender?.avatar ? (
          <img
            src={sender.avatar}
            alt=""
            style={{ marginTop: 2, width: 32, height: 32, flexShrink: 0, borderRadius: 6 }}
          />
        ) : (
          <div style={{ marginTop: 2, width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "#e5e7eb", fontSize: 12, fontWeight: 700, color: uiTokens.textMuted }}>
            {msg.bot_id ? "🤖" : "?"}
          </div>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Sender name + time */}
          <div style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: uiTokens.textPrimary }}>
              {sender?.name || msg.bot_id || "Unbekannt"}
            </span>
            <span style={{ fontSize: 10, color: uiTokens.textMuted }}>
              {formatSlackTs(msg.ts)}
            </span>
          </div>

          {/* Message body */}
          <div
            style={{ fontSize: 14, lineHeight: 1.6, color: uiTokens.textPrimary }}
            dangerouslySetInnerHTML={{
              __html: renderSlackText(msg.text || "", userMap),
            }}
          />

          {/* Attachments */}
          {msg.files && msg.files.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {msg.files.map((f) =>
                f.mimetype?.startsWith("image/") && f.thumb_360 ? (
                  <img
                    key={f.id}
                    src={f.thumb_360}
                    alt={f.name}
                    style={{ maxHeight: 192, borderRadius: 8, border: uiTokens.cardBorder }}
                  />
                ) : (
                  <a
                    key={f.id}
                    href={f.url_private}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 4, borderRadius: 8, border: uiTokens.cardBorder, background: "#f9fafb", padding: "4px 8px", fontSize: 12, color: uiTokens.brand, textDecoration: "none" }}
                  >
                    📎 {f.name}
                  </a>
                )
              )}
            </div>
          )}

          {/* Existing reactions */}
          {msg.reactions && msg.reactions.length > 0 && (
            <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {msg.reactions.map((r) => (
                <button
                  key={r.name}
                  onClick={() => handleReaction(msg.ts, r.name)}
                  style={{ borderRadius: 999, border: uiTokens.cardBorder, background: "#f9fafb", padding: "2px 8px", fontSize: 12, cursor: "pointer" }}
                >
                  :{r.name}: {r.count}
                </button>
              ))}
            </div>
          )}

          {/* Action bar (on hover) */}
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
            {/* Quick reactions */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowReactions(!showReactions)}
                style={{ borderRadius: 6, border: uiTokens.cardBorder, background: "#fff", padding: "2px 6px", fontSize: 12, color: uiTokens.textMuted, cursor: "pointer" }}
              >
                😀
              </button>
              {showReactions && (
                <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 4, display: "flex", gap: 2, borderRadius: 12, border: uiTokens.cardBorder, background: "#fff", padding: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                  {quickEmojis.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        const emojiMap: Record<string, string> = {
                          "👍": "thumbsup",
                          "✅": "white_check_mark",
                          "👀": "eyes",
                          "❤️": "heart",
                          "🎉": "tada",
                        };
                        handleReaction(msg.ts, emojiMap[e] || "thumbsup");
                        setShowReactions(false);
                      }}
                      style={{ borderRadius: 6, padding: "2px 4px", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Thread button */}
            {!isThread && (
              <button
                onClick={() => setThreadTs(msg.ts)}
                style={{ borderRadius: 6, border: uiTokens.cardBorder, background: "#fff", padding: "2px 6px", fontSize: 10, color: uiTokens.textMuted, cursor: "pointer" }}
              >
                💬 {msg.reply_count ? `${msg.reply_count} Antworten` : "Antworten"}
              </button>
            )}
          </div>

          {/* Thread indicator */}
          {!isThread && msg.reply_count && msg.reply_count > 0 && (
            <button
              onClick={() => setThreadTs(msg.ts)}
              style={{ marginTop: 4, fontSize: 12, color: uiTokens.brand, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
            >
              💬 {msg.reply_count} Antwort{msg.reply_count === 1 ? "" : "en"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: uiTokens.cardBorder, background: "#fff", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/kommunikation/slack"
            style={{ borderRadius: 8, padding: 4, color: uiTokens.textMuted, textDecoration: "none" }}
          >
            ← Zurück
          </Link>
          <div>
            <div style={{ fontWeight: 500, color: uiTokens.textPrimary }}>{channelLabel}</div>
            {channel?.topic?.value && (
              <div style={{ maxWidth: 448, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: uiTokens.textMuted }}>
                {channel.topic.value}
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: uiTokens.textMuted }}>
          {channel?.num_members} Mitglieder
        </div>
      </div>

      {/* Main content: Messages + optional Thread */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Channel messages */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto", background: "#fff", padding: "12px 16px" }}>
            {loading ? (
              <div style={{ padding: "48px 0", textAlign: "center", fontSize: 14, color: uiTokens.textMuted }}>
                Laden…
              </div>
            ) : (
              <>
                {grouped.map((group) => (
                  <div key={group.date}>
                    <div style={{ margin: "16px 0", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, borderTop: uiTokens.cardBorder }} />
                      <span style={{ fontSize: 10, fontWeight: 500, color: uiTokens.textMuted }}>
                        {group.date}
                      </span>
                      <div style={{ flex: 1, borderTop: uiTokens.cardBorder }} />
                    </div>
                    {group.msgs.map((m) => (
                      <MessageBubble key={m.ts} msg={m} />
                    ))}
                  </div>
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ borderTop: "1px solid #fca5a5", background: "#fef2f2", padding: "8px 16px", fontSize: 12, color: "#b91c1c" }}>
              {error}
            </div>
          )}

          {/* Compose */}
          <div style={{ borderTop: uiTokens.cardBorder, background: "#fff", padding: 12 }}>
            {threadTs && (
              <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8, borderRadius: 8, background: "#f5f3ff", padding: "6px 12px", fontSize: 12, color: "#7c3aed" }}>
                <span>Antwort im Thread</span>
                <button
                  onClick={() => { setThreadTs(null); setThreadMessages([]); }}
                  style={{ marginLeft: "auto", color: "#a78bfa", background: "none", border: "none", cursor: "pointer" }}
                >
                  ✕ Thread schließen
                </button>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  threadTs
                    ? "Thread-Antwort eingeben…"
                    : `Nachricht an ${channelLabel}…`
                }
                rows={2}
                style={{ flex: 1, resize: "none", borderRadius: uiTokens.radiusCard, border: uiTokens.cardBorder, padding: "8px 12px", fontSize: 14 }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                style={{
                  flexShrink: 0, borderRadius: uiTokens.radiusCard, background: "#7c3aed",
                  padding: "8px 16px", fontSize: 14, fontWeight: 500, color: "#fff",
                  border: "none", cursor: "pointer", opacity: sending || !draft.trim() ? 0.5 : 1,
                }}
              >
                {sending ? "…" : "Senden"}
              </button>
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: uiTokens.textMuted }}>
              Enter = Senden · Shift+Enter = Zeilenumbruch
            </div>
          </div>
        </div>

        {/* Thread side panel */}
        {threadTs && (
          <div style={{ width: 320, flexShrink: 0, overflow: "hidden", borderLeft: uiTokens.cardBorder, background: "#f9fafb", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: uiTokens.cardBorder, background: "#fff", padding: "12px 16px" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>💬 Thread</h3>
              <button
                onClick={() => { setThreadTs(null); setThreadMessages([]); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: uiTokens.textMuted, fontSize: 16 }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {threadLoading ? (
                <div style={{ padding: "16px 0", textAlign: "center", fontSize: 12, color: uiTokens.textMuted }}>
                  Laden…
                </div>
              ) : (
                threadMessages.map((m) => (
                  <MessageBubble key={m.ts} msg={m} isThread />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
