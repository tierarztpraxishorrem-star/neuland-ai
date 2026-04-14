"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../lib/toast";

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
    <main className="mx-auto w-full max-w-[800px] px-4 py-10">
      <h1 className="text-2xl font-semibold">HR Zeiterfassung</h1>
      <p className="mt-2 text-sm text-black/60">Starte und beende deinen Arbeitstag mit einem Klick.</p>

      <div className="mt-6 rounded-xl border border-black/10 bg-gradient-to-b from-white to-gray-50 p-5 shadow-sm">
        <p className="text-sm text-black/60">Status</p>
        <p className={`mt-1 text-lg font-semibold ${isRunning ? "text-green-600" : "text-gray-500"}`}>
          {isRunning ? "läuft" : "nicht gestartet"}
        </p>

        {isRunning && currentSessionStart ? (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
            <p className="text-sm text-green-700">Aktiv seit</p>
            <p className="text-2xl font-semibold tracking-wide text-green-700">{runningClock}</p>
          </div>
        ) : null}

        {showStopReminder ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-sm font-medium text-amber-800">
              Du arbeitest seit ueber 8 Stunden - moechtest du deinen Tag beenden?
            </p>
            <button
              type="button"
              onClick={handleStop}
              disabled={loading || actionState !== null || !isRunning}
              className="mt-2 inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionState === "stop" ? "Stoppt..." : "Arbeitszeit stoppen"}
            </button>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {warning ? <p className="mt-3 text-sm text-amber-700">Hinweis: {warning}</p> : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleStart}
            disabled={loading || actionState !== null || isRunning}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-green-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionState === "start" ? "Startet..." : "Arbeitszeit starten"}
          </button>

          <button
            type="button"
            onClick={handleStop}
            disabled={loading || actionState !== null || !isRunning}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-gray-700 px-6 py-3 text-base font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionState === "stop" ? "Stoppt..." : "Arbeitszeit stoppen"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-sm text-black/60">Heute gearbeitet</p>
          <p className="mt-1 text-xl font-semibold text-black">{formatHours(todayMs)}</p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-sm text-black/60">Diese Woche</p>
          <p className="mt-1 text-xl font-semibold text-black">{formatHours(weekMs)}</p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Letzte Sessions</h2>

        {loading ? <p className="mt-3 text-sm text-black/60">Lade Sessions...</p> : null}

        {!loading && sessions.length === 0 ? (
          <p className="mt-3 text-sm text-black/60">Noch keine Sessions vorhanden.</p>
        ) : null}

        <div className="mt-4 space-y-3">
          {sessions.map((session) => (
            <article key={session.id} className="rounded-lg border border-black/10 bg-white p-4">
              <p className="text-sm">
                <span className="font-medium">Start:</span> {formatDateTime(session.started_at)}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-medium">Ende:</span>{" "}
                {session.ended_at ? formatDateTime(session.ended_at) : "offen"}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-medium">Dauer:</span> {formatDuration(session.started_at, session.ended_at)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
