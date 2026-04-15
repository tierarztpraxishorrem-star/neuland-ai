"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-800",
  waiting: "bg-amber-100 text-amber-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
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
    <div className="mx-auto max-w-[900px] space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">WhatsApp Inbox</h1>
          {totalUnread > 0 && (
            <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
              {totalUnread}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {(["active", "resolved", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              filter === f
                ? "bg-white shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            {f === "active"
              ? "Aktiv"
              : f === "resolved"
                ? "Erledigt"
                : "Alle"}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div className="rounded-lg border border-black/10 bg-white">
        {loading ? (
          <div className="p-4 text-sm text-gray-500">Laden…</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            Keine Konversationen.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/kommunikation/whatsapp/${conv.id}`}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50"
              >
                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-lg">
                  💬
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-medium">
                      {conv.contact?.display_name || conv.contact?.phone || "Unbekannt"}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">
                      {timeAgo(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="truncate text-xs text-gray-500">
                      {conv.last_message_preview || "—"}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5 pl-2">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[conv.status] || ""}`}
                      >
                        {STATUS_LABELS[conv.status] || conv.status}
                      </span>
                      {conv.unread_count > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                  {conv.assignee?.display_name && (
                    <div className="text-[10px] text-gray-400">
                      Zugewiesen: {conv.assignee.display_name}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
