"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { uiTokens, Card, Button } from "../../../components/ui/System";

type Shift = {
  id: string;
  date: string;
  starts_at: string;
  ends_at: string;
  note?: string | null;
};

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

async function fetchWithAuth(url: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht angemeldet.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday-based
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day;
  });
}

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDayDisplay(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function isToday(d: Date): boolean {
  const now = new Date();
  return formatDateKey(d) === formatDateKey(now);
}

export default function SchedulePage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const weekDays = getWeekDays(baseDate);
  const from = formatDateKey(weekDays[0]);
  const to = formatDateKey(weekDays[6]);

  const loadShifts = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetchWithAuth(
        `/api/hr/shifts?from=${from}&to=${to}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setShifts(data.shifts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  const shiftsByDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    const existing = shiftsByDate.get(s.date) || [];
    existing.push(s);
    shiftsByDate.set(s.date, existing);
  }

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding, fontFamily: "inherit" }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>Dienstplan</h1>
        </div>

        {error && (
          <Card style={{ border: "1px solid #fecaca", background: "#fff1f2" }}>
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          </Card>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>← Vorherige Woche</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset(0)}>Aktuelle Woche</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>Nächste Woche →</Button>
        </div>

        <Card>
          {loading ? (
            <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Laden…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
              {weekDays.map((day, idx) => {
                const key = formatDateKey(day);
                const dayShifts = shiftsByDate.get(key) || [];
                const today = isToday(day);

                return (
                  <div
                    key={key}
                    style={{
                      minHeight: 100,
                      borderRadius: 12,
                      border: today ? "1px solid #93c5fd" : uiTokens.cardBorder,
                      background: today ? "#eff6ff" : "#f8fafc",
                      padding: 8,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: today ? "#1d4ed8" : uiTokens.textSecondary, marginBottom: 4 }}>
                      {DAY_LABELS[idx]}<br />{formatDayDisplay(day)}
                    </div>
                    {dayShifts.length === 0 ? (
                      <div style={{ fontSize: 11, color: uiTokens.textMuted }}>frei</div>
                    ) : (
                      dayShifts.map((s) => (
                        <div key={s.id} style={{ marginBottom: 3, borderRadius: 6, background: "#dcfce7", padding: "2px 6px", fontSize: 11, color: "#166534" }}>
                          {s.starts_at}–{s.ends_at}
                          {s.note && <div style={{ fontSize: 10, color: "#16a34a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.note}</div>}
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
