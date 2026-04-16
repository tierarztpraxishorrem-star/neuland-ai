"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Section } from "../../../components/ui/System";

type OnboardingTask = {
  id: string;
  title: string;
  done: boolean;
  due_on?: string | null;
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

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function OnboardingPage() {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth("/api/hr/onboarding");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleToggle(task: OnboardingTask) {
    setToggling(task.id);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/hr/onboarding/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !task.done }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Aktualisieren.");
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setToggling(null);
    }
  }

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.done).length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding, fontFamily: "inherit" }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Onboarding</h1>
        </div>

        {error && (
          <Card style={{ border: "1px solid #fecaca", background: "#fff1f2" }}>
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          </Card>
        )}

        {loading ? (
          <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Laden…</div>
        ) : totalTasks === 0 ? (
          <Card>
            <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Onboarding-Aufgaben vorhanden.</div>
          </Card>
        ) : (
          <>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>Fortschritt</span>
                <span style={{ color: uiTokens.textSecondary }}>{doneTasks} von {totalTasks} erledigt ({progress}%)</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 999, background: "#22c55e", width: `${progress}%`, transition: "width 0.3s" }} />
              </div>
            </Card>

            <Section title="Aufgaben">
              {tasks.map((task) => (
                <Card
                  key={task.id}
                  style={{
                    padding: 14,
                    opacity: task.done ? 0.6 : 1,
                    cursor: "pointer",
                  }}
                  onClick={() => handleToggle(task)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      border: task.done ? "2px solid #22c55e" : uiTokens.cardBorder,
                      background: task.done ? "#22c55e" : "#fff",
                      display: "grid", placeItems: "center", color: "#fff", fontSize: 12,
                    }}>
                      {task.done ? "✓" : ""}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: task.done ? 400 : 600, textDecoration: task.done ? "line-through" : "none", color: task.done ? uiTokens.textMuted : uiTokens.textPrimary }}>
                        {task.title}
                      </span>
                      {task.due_on && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: uiTokens.textMuted }}>Fällig: {formatDate(task.due_on)}</span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </Section>
          </>
        )}
      </div>
    </main>
  );
}
