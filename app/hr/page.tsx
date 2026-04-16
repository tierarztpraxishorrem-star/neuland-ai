"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../lib/toast";
import { uiTokens, Card, Button, Section } from "../../components/ui/System";

type Session = {
  id: string;
  started_at: string;
  ended_at: string | null;
};

type DebugSystemStateResponse = {
  work_sessions?: Session[];
};

type StartStopResponse = {
  ok?: boolean;
  session?: Session;
  error?: string;
  warning?: string;
};

type ActionState = "start" | "stop" | null;

function formatDateTime(value: string) {
  return new Date(value).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string, endedAt: string | null) {
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt ?? new Date().toISOString()).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return "-";
  }

  const diffMinutes = Math.floor((endMs - startMs) / 60000);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (hours <= 0) return `${minutes}min`;
  return `${hours}h ${minutes}min`;
}

function formatElapsedClock(startedAt: string, nowMs: number) {
  const startMs = new Date(startedAt).getTime();
  if (Number.isNaN(startMs) || nowMs < startMs) return "00:00:00";

  const diffSeconds = Math.floor((nowMs - startMs) / 1000);
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function sanitizeSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Session => {
      if (!item || typeof item !== "object") return false;
      const row = item as Session;
      return (
        typeof row.id === "string" &&
        typeof row.started_at === "string" &&
        (typeof row.ended_at === "string" || row.ended_at === null)
      );
    })
    .filter((session) => !Number.isNaN(new Date(session.started_at).getTime()));
}

function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function getClampedDurationMs(
  startedAt: string,
  endedAt: string | null,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt ?? new Date().toISOString()).getTime();

  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return 0;

  const effectiveStart = Math.max(start, rangeStartMs);
  const effectiveEnd = Math.min(end, rangeEndMs);

  if (effectiveEnd <= effectiveStart) return 0;

  return effectiveEnd - effectiveStart;
}

function formatHours(ms: number) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}min`;
}

async function fetchWithAuth(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(path, {
    ...init,
    headers,
  });
}

export default function HrPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentSessionStart, setCurrentSessionStart] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const controller = new AbortController();

    const loadStatus = async () => {
      setLoading(true);
      setError(null);
      setWarning(null);

      try {
        const res = await fetchWithAuth("/api/debug/system-state", {
          method: "GET",
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as DebugSystemStateResponse & { error?: string };

        if (!res.ok) {
          throw new Error(data.error || "Status konnte nicht geladen werden.");
        }

        const allSessions = sanitizeSessions(data.work_sessions)
          .sort(
              (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
            );

        const openSession = allSessions.find((session) => session.ended_at === null) ?? null;

        setSessions(allSessions.slice(0, 20));
        setIsRunning(Boolean(openSession));
        setCurrentSessionStart(openSession?.started_at ?? null);
        setNow(Date.now());
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadStatus();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!isRunning || !currentSessionStart) return;

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning, currentSessionStart]);

  const runningClock = useMemo(() => {
    if (!isRunning || !currentSessionStart) return "00:00:00";
    return formatElapsedClock(currentSessionStart, now);
  }, [isRunning, currentSessionStart, now]);

  const runningDurationMs = useMemo(() => {
    if (!isRunning || !currentSessionStart) return 0;
    const start = new Date(currentSessionStart).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.max(0, now - start);
  }, [isRunning, currentSessionStart, now]);

  const showStopReminder = isRunning && runningDurationMs >= 8 * 60 * 60 * 1000;

  const todayMs = useMemo(() => {
    const nowDate = new Date(now);

    const startOfDay = new Date(nowDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(nowDate);
    endOfDay.setHours(23, 59, 59, 999);

    return sessions.reduce((sum, s) => {
      return sum + getClampedDurationMs(s.started_at, s.ended_at, startOfDay, endOfDay);
    }, 0);
  }, [sessions, now]);

  const weekMs = useMemo(() => {
    const nowDate = new Date(now);
    const weekStart = getWeekStart(nowDate);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return sessions.reduce((sum, s) => {
      return sum + getClampedDurationMs(s.started_at, s.ended_at, weekStart, weekEnd);
    }, 0);
  }, [sessions, now]);

  async function handleStart() {
    setActionState("start");
    setError(null);
    setWarning(null);

    try {
      const res = await fetchWithAuth("/api/hr/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "ui" }),
      });

      const data = (await res.json().catch(() => ({}))) as StartStopResponse;

      if (!res.ok || !data.session) {
        throw new Error(data.error || "Arbeitszeit konnte nicht gestartet werden.");
      }

      setIsRunning(true);
      setCurrentSessionStart(data.session.started_at);
      setNow(Date.now());
      setSessions((prev) => {
        const withoutDuplicate = prev.filter((session) => session.id !== data.session!.id);
        return [data.session!, ...withoutDuplicate].slice(0, 20);
      });

      if (data.warning) {
        setWarning(data.warning);
      }
      showToast({ message: "Arbeitszeit gestartet", type: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler beim Start.");
      showToast({ message: "Fehler beim Stempeln", type: "error" });
    } finally {
      setActionState(null);
    }
  }

  async function handleStop() {
    setActionState("stop");
    setError(null);
    setWarning(null);

    try {
      const res = await fetchWithAuth("/api/hr/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = (await res.json().catch(() => ({}))) as StartStopResponse;

      if (!res.ok || !data.session) {
        throw new Error(data.error || "Arbeitszeit konnte nicht gestoppt werden.");
      }

      setIsRunning(false);
      setCurrentSessionStart(null);
      setSessions((prev) => {
        const withoutDuplicate = prev.filter((session) => session.id !== data.session!.id);
        return [data.session!, ...withoutDuplicate].slice(0, 20);
      });

      if (data.warning) {
        setWarning(data.warning);
      }
      showToast({ message: "Arbeitszeit beendet", type: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler beim Stop.");
      showToast({ message: "Fehler beim Stempeln", type: "error" });
    } finally {
      setActionState(null);
    }
  }

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isRunning) return;
      event.preventDefault();
      event.returnValue = "Deine Arbeitszeit laeuft noch. Wirklich verlassen?";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isRunning]);

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding, fontFamily: "inherit" }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>HR Zeiterfassung</h1>
          <p style={{ marginTop: 6, fontSize: 14, color: uiTokens.textSecondary }}>Starte und beende deinen Arbeitstag mit einem Klick.</p>
        </div>

        <Card style={{ background: "linear-gradient(180deg, #ffffff 0%, #f8fafb 100%)" }}>
          <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>Status</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600, color: isRunning ? "#16a34a" : uiTokens.textMuted }}>
            {isRunning ? "läuft" : "nicht gestartet"}
          </div>

          {isRunning && currentSessionStart ? (
            <div style={{ marginTop: 12, borderRadius: 12, border: "1px solid #bbf7d0", background: "#f0fdf4", padding: "10px 14px" }}>
              <div style={{ fontSize: 13, color: "#166534" }}>Aktiv seit</div>
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "0.02em", color: "#166534" }}>{runningClock}</div>
            </div>
          ) : null}

          {showStopReminder ? (
            <div style={{ marginTop: 12, borderRadius: 12, border: "1px solid #fde68a", background: "#fffbeb", padding: "12px 14px" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#92400e" }}>Du arbeitest seit über 8 Stunden – möchtest du deinen Tag beenden?</div>
              <Button variant="primary" size="sm" style={{ marginTop: 8, background: "#d97706" }} onClick={handleStop} disabled={loading || actionState !== null || !isRunning}>
                {actionState === "stop" ? "Stoppt..." : "Arbeitszeit stoppen"}
              </Button>
            </div>
          ) : null}

          {error ? <div style={{ marginTop: 12, fontSize: 13, color: "#dc2626" }}>{error}</div> : null}
          {warning ? <div style={{ marginTop: 12, fontSize: 13, color: "#d97706" }}>Hinweis: {warning}</div> : null}

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" size="lg" style={{ background: "#16a34a", minWidth: 180 }} onClick={handleStart} disabled={loading || actionState !== null || isRunning}>
              {actionState === "start" ? "Startet..." : "Arbeitszeit starten"}
            </Button>
            <Button variant="secondary" size="lg" style={{ minWidth: 180 }} onClick={handleStop} disabled={loading || actionState !== null || !isRunning}>
              {actionState === "stop" ? "Stoppt..." : "Arbeitszeit stoppen"}
            </Button>
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Card>
            <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>Heute gearbeitet</div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 600 }}>{formatHours(todayMs)}</div>
          </Card>
          <Card>
            <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>Diese Woche</div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 600 }}>{formatHours(weekMs)}</div>
          </Card>
        </div>

        <Section title="Letzte Sessions">
          {loading ? <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade Sessions...</div> : null}
          {!loading && sessions.length === 0 ? <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Noch keine Sessions vorhanden.</div> : null}
          {sessions.map((session) => (
            <Card key={session.id} style={{ padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 14 }}>
                <div><span style={{ fontWeight: 600 }}>Start:</span> {formatDateTime(session.started_at)}</div>
                <div><span style={{ fontWeight: 600 }}>Ende:</span> {session.ended_at ? formatDateTime(session.ended_at) : "offen"}</div>
                <div><span style={{ fontWeight: 600 }}>Dauer:</span> {formatDuration(session.started_at, session.ended_at)}</div>
              </div>
            </Card>
          ))}
        </Section>
      </div>
    </main>
  );
}
