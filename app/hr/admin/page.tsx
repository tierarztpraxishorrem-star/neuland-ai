"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Section, Badge } from "../../../components/ui/System";

type Session = {
  id: string;
  employee_id: string;
  started_at: string;
  ended_at: string | null;
};

type Employee = {
  id: string;
  user_id: string;
  display_name?: string | null;
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
    const row = item as Record<string, unknown>;
    return typeof row.id === "string" && typeof row.user_id === "string";
  }).map((item) => ({
    id: item.id,
    user_id: item.user_id,
    display_name: (item as Record<string, unknown>).display_name as string | null | undefined,
  }));
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
          const hasSessionStartedToday = sessions.some((session) => {
            if (session.employee_id !== emp.id) return false;
            const started = new Date(session.started_at).getTime();
            if (Number.isNaN(started)) return false;
            return started >= dayRange.start.getTime() && started <= dayRange.end.getTime();
          });
          return !hasSessionStartedToday;
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
          const isOpenTooLong = nowMs - startedMs > maxOpenMs;
          return isOpenTooLong;
        })
        .map((session) => session.employee_id),
    );
  }, [sessions, now]);

  const reminderCount = missingStartEmployees.size + missingStopEmployees.size;

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding, fontFamily: "inherit" }}>
      <div style={{ width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>HR Dashboard</h1>
          <p style={{ marginTop: 6, fontSize: 14, color: uiTokens.textSecondary }}>Live-Übersicht für Teamzeiten und fehlende Stempel.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <Card>
            <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>Mitarbeiter</div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 600 }}>{employees.length}</div>
          </Card>
          <Card>
            <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>Aktiv</div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 600, color: "#16a34a" }}>{runningEmployees.size}</div>
          </Card>
          <Card>
            <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>Erinnerungen nötig</div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 600, color: "#d97706" }}>{reminderCount}</div>
          </Card>
        </div>

        {loading ? <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div> : null}
        {error ? <div style={{ fontSize: 14, color: "#dc2626" }}>{error}</div> : null}

        {!loading && !error && reminderCount > 0 ? (
          <Card style={{ border: "1px solid #fde68a", background: "#fffbeb" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#92400e" }}>Automatische Erinnerung</div>
            {missingStopEmployees.size > 0 ? (
              <div style={{ marginTop: 8, fontSize: 14, color: "#92400e" }}>{missingStopEmployees.size} Mitarbeiter haben vermutlich das Ausstempeln vergessen.</div>
            ) : null}
            {missingStartEmployees.size > 0 ? (
              <div style={{ marginTop: 8, fontSize: 14, color: "#92400e" }}>{missingStartEmployees.size} Mitarbeiter haben heute noch keine Stempelung.</div>
            ) : null}
          </Card>
        ) : null}

        <Section title="Team-Übersicht">
          {employees.map((emp) => {
            const isRunning = runningEmployees.has(emp.id);
            const today = todayStats[emp.id] || 0;
            const forgotStop = missingStopEmployees.has(emp.id);
            const missingStart = missingStartEmployees.has(emp.id);

            return (
              <Card key={emp.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{emp.display_name || `Mitarbeiter ${emp.id.slice(0, 6)}`}</div>
                    <div style={{ fontSize: 13, color: uiTokens.textSecondary, marginTop: 2 }}>Heute: {formatHours(today)}</div>
                    {forgotStop ? <div style={{ marginTop: 4, fontSize: 12, color: "#d97706" }}>Hat wahrscheinlich vergessen auszustempeln.</div> : null}
                    {!forgotStop && missingStart ? <div style={{ marginTop: 4, fontSize: 12, color: "#d97706" }}>Hat heute noch nicht gestempelt.</div> : null}
                  </div>
                  <div>
                    {isRunning ? (
                      <Badge tone="success">aktiv</Badge>
                    ) : (
                      <Badge>offline</Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {!loading && !error && employees.length === 0 ? <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Keine Mitarbeiter gefunden.</div> : null}
        </Section>
      </div>
    </main>
  );
}
