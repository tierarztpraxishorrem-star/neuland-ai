"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  media_type: string | null;
  status: string;
  ai_suggested: boolean;
  ai_suggestion_original: string | null;
  created_at: string;
  sender: { id: string; display_name: string | null } | null;
};

type Contact = {
  id: string;
  phone: string;
  display_name: string | null;
};

type ConvInfo = {
  id: string;
  status: string;
  assigned_to: string | null;
  contact: Contact;
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

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;

  const [conv, setConv] = useState<ConvInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compose
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth(
        `/api/whatsapp/conversations/${conversationId}/messages`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setConv(data.conversation || null);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(aiSuggested = false, originalSuggestion?: string) {
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          body: draft.trim(),
          ai_suggested: aiSuggested,
          ai_suggestion_original: originalSuggestion || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Senden.");
      setDraft("");
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSending(false);
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/whatsapp/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler.");
      if (data.suggestion) {
        setDraft(data.suggestion);
        textareaRef.current?.focus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleStatusChange(status: string) {
    try {
      await fetchWithAuth("/api/whatsapp/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conversationId, status }),
      });
      await loadMessages();
    } catch {
      // ignore
    }
  }

  // Group messages by date
  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const m of messages) {
    const d = formatDate(m.created_at);
    if (grouped.length === 0 || grouped[grouped.length - 1].date !== d) {
      grouped.push({ date: d, msgs: [m] });
    } else {
      grouped[grouped.length - 1].msgs.push(m);
    }
  }

  const contactName =
    conv?.contact?.display_name || conv?.contact?.phone || "Kontakt";

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/kommunikation/whatsapp"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
          >
            ← Zurück
          </Link>
          <div>
            <div className="font-medium">{contactName}</div>
            <div className="text-xs text-gray-400">
              {conv?.contact?.phone}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conv?.status === "open" || conv?.status === "waiting" ? (
            <button
              onClick={() => handleStatusChange("resolved")}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
            >
              ✓ Erledigt
            </button>
          ) : (
            <button
              onClick={() => handleStatusChange("open")}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
            >
              Wieder öffnen
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-[#ece5dd] p-4">
        {loading ? (
          <div className="text-center text-sm text-gray-500">Laden…</div>
        ) : (
          <>
            {grouped.map((group) => (
              <div key={group.date}>
                <div className="my-3 text-center">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-medium text-gray-500 shadow-sm">
                    {group.date}
                  </span>
                </div>
                {group.msgs.map((m) => (
                  <div
                    key={m.id}
                    className={`mb-2 flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${
                        m.direction === "outbound"
                          ? "bg-[#dcf8c6]"
                          : "bg-white"
                      }`}
                    >
                      {m.media_type && !m.body && (
                        <div className="mb-1 text-xs italic text-gray-400">
                          📎 {m.media_type}
                        </div>
                      )}
                      {m.body && (
                        <div className="whitespace-pre-wrap text-sm">
                          {m.body}
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        {m.ai_suggested && (
                          <span className="text-[9px] text-purple-500">
                            KI
                          </span>
                        )}
                        {m.sender?.display_name && (
                          <span className="text-[9px] text-gray-400">
                            {m.sender.display_name}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {formatTime(m.created_at)}
                        </span>
                        {m.direction === "outbound" && (
                          <span className="text-[10px]">
                            {m.status === "read"
                              ? "✓✓"
                              : m.status === "delivered"
                                ? "✓✓"
                                : m.status === "sent"
                                  ? "✓"
                                  : m.status === "failed"
                                    ? "✗"
                                    : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Compose */}
      <div className="border-t bg-white p-3">
        <div className="flex items-end gap-2">
          <button
            onClick={handleSuggest}
            disabled={suggesting}
            className="shrink-0 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
            title="KI-Vorschlag generieren"
          >
            {suggesting ? "⏳" : "✨ KI"}
          </button>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(false);
              }
            }}
            placeholder="Nachricht eingeben…"
            rows={2}
            className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
          <button
            onClick={() => handleSend(false)}
            disabled={sending || !draft.trim()}
            className="shrink-0 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {sending ? "…" : "Senden"}
          </button>
        </div>
        <div className="mt-1 text-[10px] text-gray-400">
          Enter = Senden · Shift+Enter = Zeilenumbruch · ✨ KI = Antwortvorschlag
        </div>
      </div>
    </div>
  );
}
