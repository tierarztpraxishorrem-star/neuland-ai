"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Section } from "../../../components/ui/System";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/hr/notifications?limit=100");
      if (!res) return;
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    await fetchWithAuth(`/api/hr/notifications/${id}`, { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await fetchWithAuth("/api/hr/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(700px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Benachrichtigungen</h1>
            {unreadCount > 0 && <p style={{ fontSize: 14, color: uiTokens.textSecondary, marginTop: 4 }}>{unreadCount} ungelesen</p>}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer" }}>
              Alle als gelesen markieren
            </button>
          )}
        </div>

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && (
          <Section title="">
            {notifications.map((n) => (
              <Card
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                style={{
                  padding: 14, cursor: n.is_read ? "default" : "pointer",
                  background: n.is_read ? "#fff" : "#f0f9ff",
                  borderLeft: n.is_read ? undefined : `3px solid ${uiTokens.brand}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: 14 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: uiTokens.textMuted }}>
                    {new Date(n.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {n.body && <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 4 }}>{n.body}</div>}
                {n.link && <a href={n.link} style={{ fontSize: 12, color: uiTokens.brand, marginTop: 4, display: "inline-block" }}>Öffnen &rarr;</a>}
              </Card>
            ))}
            {notifications.length === 0 && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Benachrichtigungen.</div>}
          </Section>
        )}
      </div>
    </main>
  );
}
