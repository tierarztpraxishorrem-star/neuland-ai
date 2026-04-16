"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { uiTokens, Card, Badge } from "@/components/ui/System";

type SlackChannel = {
  id: string;
  name: string;
  topic: { value: string };
  purpose: { value: string };
  num_members: number;
  is_member: boolean;
  is_private: boolean;
  unread_count_display: number;
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

export default function SlackInboxPage() {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "joined">("joined");

  const loadChannels = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth("/api/slack/channels");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setChannels(data.channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
    const interval = setInterval(loadChannels, 30000);
    return () => clearInterval(interval);
  }, [loadChannels]);

  const filtered =
    filter === "joined"
      ? channels.filter((c) => c.is_member)
      : channels;

  const totalUnread = channels.reduce(
    (sum, c) => sum + (c.unread_count_display || 0),
    0
  );

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(700px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Link href="/kommunikation" style={{ borderRadius: 8, padding: 4, color: uiTokens.textMuted, textDecoration: "none" }}>
                ← Zurück
              </Link>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>💬 Slack</h1>
              {totalUnread > 0 && (
                <Badge tone="danger">{totalUnread}</Badge>
              )}
            </div>
            <p style={{ marginTop: 4, fontSize: 14, color: uiTokens.textSecondary }}>
              Team-Kommunikation direkt in Neuland AI
            </p>
          </div>
          <button
            onClick={loadChannels}
            style={{ borderRadius: uiTokens.radiusCard, border: uiTokens.cardBorder, padding: "6px 12px", fontSize: 12, cursor: "pointer", background: "#fff" }}
          >
            ↻ Aktualisieren
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, borderRadius: uiTokens.radiusCard, background: "#f3f4f6", padding: 4 }}>
          {(["joined", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1, borderRadius: 12, padding: "6px 12px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer",
                background: filter === f ? "#fff" : "transparent",
                boxShadow: filter === f ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                color: filter === f ? uiTokens.brand : uiTokens.textSecondary,
              }}
            >
              {f === "joined" ? "Meine Channels" : "Alle Channels"}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ borderRadius: uiTokens.radiusCard, border: "1px solid #fca5a5", background: "#fef2f2", padding: "12px 16px", fontSize: 14, color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {/* Channel list */}
        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", fontSize: 14, color: uiTokens.textMuted }}>
            Lade Slack-Channels…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", fontSize: 14, color: uiTokens.textMuted }}>
            {filter === "joined"
              ? "Du bist noch keinem Channel beigetreten."
              : "Keine Channels gefunden."}
          </div>
        ) : (
          <Card style={{ padding: 0 }}>
            {filtered.map((ch, i) => (
              <Link
                key={ch.id}
                href={`/kommunikation/slack/${ch.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  textDecoration: "none", color: "inherit",
                  borderTop: i > 0 ? uiTokens.cardBorder : "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* Channel icon */}
                <div style={{ width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "#f3e8ff", fontSize: 18 }}>
                  {ch.is_private ? "🔒" : "#"}
                </div>

                {/* Channel info */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 500, color: uiTokens.textPrimary }}>
                      {ch.is_private ? "🔒 " : "# "}
                      {ch.name}
                    </span>
                    {!ch.is_member && (
                      <span style={{ borderRadius: 999, background: "#f3f4f6", padding: "2px 8px", fontSize: 10, color: uiTokens.textMuted }}>
                        Nicht beigetreten
                      </span>
                    )}
                  </div>
                  {(ch.topic?.value || ch.purpose?.value) && (
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: uiTokens.textSecondary }}>
                      {ch.topic?.value || ch.purpose?.value}
                    </div>
                  )}
                  <div style={{ marginTop: 2, fontSize: 10, color: uiTokens.textMuted }}>
                    {ch.num_members} Mitglieder
                  </div>
                </div>

                {/* Unread badge */}
                {ch.unread_count_display > 0 && (
                  <Badge tone="danger">{ch.unread_count_display}</Badge>
                )}
              </Link>
            ))}
          </Card>
        )}
      </div>
    </main>
  );
}
