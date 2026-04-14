"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Session = {
  id: string;
  employee_id: string;
  started_at: string;
  ended_at: string | null;
};

type Employee = {
  id: string;
  user_id: string;
};

type ApiResponse = {
  employees?: Employee[];
  work_sessions?: Session[];
  error?: string;
};

function getClampedDurationMs(
  startedAt: string,
  endedAt: string | null,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt ?? new Date().toISOString()).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return 0;

  const effectiveStart = Math.max(start, rangeStart.getTime());
  const effectiveEnd = Math.min(end, rangeEnd.getTime());

  if (effectiveEnd <= effectiveStart) return 0;
  return effectiveEnd - effectiveStart;
}

function formatHours(ms: number) {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}min`;
}

function sanitizeEmployees(value: unknown): Employee[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is Employee => {
    if (!item || typeof item !== "object") return false;
    const row = item as Employee;
    return typeof row.id === "string" && typeof row.user_id === "string";
  });
}

function sanitizeSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Session => {
      if (!item || typeof item !== "object") return false;
      const row = item as Session;
      return (
        typeof row.id === "string" &&
        typeof row.employee_id === "string" &&
        typeof row.started_at === "string" &&
        (typeof row.ended_at === "string" || row.ended_at === null)
      );
    })
    .filter((session) => !Number.isNaN(new Date(session.started_at).getTime()));
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

export default function HrAdminPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetchWithAuth("/api/debug/system-state", { signal: controller.signal });
        const data = (await res.json().catch(() => ({}))) as ApiResponse;

        if (!res.ok) {
          throw new Error(data.error || "Dashboard konnte nicht geladen werden.");
        }

        if (controller.signal.aborted) return;

        setEmployees(sanitizeEmployees(data.employees));
        setSessions(
          sanitizeSessions(data.work_sessions).sort(
            (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
          ),
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const dayRange = useMemo(() => {
    const date = new Date(now);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }, [now]);

  const todayStats = useMemo(() => {
    const map: Record<string, number> = {};

    for (const s of sessions) {
      const ms = getClampedDurationMs(s.started_at, s.ended_at, dayRange.start, dayRange.end);
      if (ms <= 0) continue;
      map[s.employee_id] = (map[s.employee_id] || 0) + ms;
    }

    return map;
  }, [sessions, dayRange]);

  const runningEmployees = useMemo(() => {
    return new Set(sessions.filter((s) => s.ended_at === null).map((s) => s.employee_id));
  }, [sessions]);

  const missingStartEmployees = useMemo(() => {
    return new Set(
      employees
        .filter((emp) => {
          const hasTodayTime = sessions.some((session) => {
            if (session.employee_id !== emp.id) return false;
            return getClampedDurationMs(session.started_at, session.ended_at, dayRange.start, dayRange.end) > 0;
          });
          return !hasTodayTime;
        })
        .map((emp) => emp.id),
    );
  }, [employees, sessions, dayRange]);

  const missingStopEmployees = useMemo(() => {
    const nowMs = now;
    const maxOpenMs = 10 * 60 * 60 * 1000;

    return new Set(
      sessions
        .filter((session) => session.ended_at === null)
        .filter((session) => {
          const startedMs = new Date(session.started_at).getTime();
          if (Number.isNaN(startedMs)) return false;
          const isFromBeforeToday = startedMs < dayRange.start.getTime();
          const isOpenTooLong = nowMs - startedMs > maxOpenMs;
          return isFromBeforeToday || isOpenTooLong;
        })
        .map((session) => session.employee_id),
    );
  }, [sessions, dayRange, now]);

  const reminderCount = missingStartEmployees.size + missingStopEmployees.size;

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <h1 className="text-2xl font-semibold">HR Dashboard</h1>
      <p className="mt-2 text-sm text-black/60">Live-Uebersicht fuer Teamzeiten und fehlende Stempel.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <p className="text-sm text-black/60">Mitarbeiter</p>
          <p className="mt-1 text-xl font-semibold">{employees.length}</p>
        </div>
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <p className="text-sm text-black/60">Aktiv</p>
          <p className="mt-1 text-xl font-semibold text-green-600">{runningEmployees.size}</p>
        </div>
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <p className="text-sm text-black/60">Erinnerungen noetig</p>
          <p className="mt-1 text-xl font-semibold text-amber-600">{reminderCount}</p>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm">Lade...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && reminderCount > 0 ? (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Automatische Erinnerung</h2>
          {missingStopEmployees.size > 0 ? (
            <p className="mt-2 text-sm text-amber-900">
              {missingStopEmployees.size} Mitarbeiter haben vermutlich das Ausstempeln vergessen.
            </p>
          ) : null}
          {missingStartEmployees.size > 0 ? (
            <p className="mt-2 text-sm text-amber-900">
              {missingStartEmployees.size} Mitarbeiter haben heute noch keine Stempelung.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="mt-6 space-y-3">
        {employees.map((emp) => {
          const isRunning = runningEmployees.has(emp.id);
          const today = todayStats[emp.id] || 0;
          const forgotStop = missingStopEmployees.has(emp.id);
          const missingStart = missingStartEmployees.has(emp.id);

          return (
            <div
              key={emp.id}
              className="flex items-center justify-between rounded-lg border border-black/10 bg-white p-4"
            >
              <div>
                <p className="font-medium">Mitarbeiter {emp.id.slice(0, 6)}</p>
                <p className="text-sm text-gray-500">Heute: {formatHours(today)}</p>
                {forgotStop ? (
                  <p className="mt-1 text-xs text-amber-700">Hinweis: moeglicherweise vergessen auszustempeln.</p>
                ) : null}
                {!forgotStop && missingStart ? (
                  <p className="mt-1 text-xs text-amber-700">Hinweis: heute noch keine Stempelung erfasst.</p>
                ) : null}
              </div>

              <div>
                {isRunning ? (
                  <span className="font-semibold text-green-600">aktiv</span>
                ) : (
                  <span className="text-gray-500">offline</span>
                )}
              </div>
            </div>
          );
        })}

        {!loading && !error && employees.length === 0 ? (
          <p className="text-sm text-black/60">Keine Mitarbeiter gefunden.</p>
        ) : null}
      </div>
    </main>
  );
}
