"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

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
    <div className="mx-auto max-w-[800px] space-y-6 p-4">
      <h1 className="text-2xl font-bold">Dienstplan</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          ← Vorherige Woche
        </button>
        <button
          onClick={() => setWeekOffset(0)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Aktuelle Woche
        </button>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Nächste Woche →
        </button>
      </div>

      {/* Week grid */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        {loading ? (
          <p className="text-sm text-gray-500">Laden…</p>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day, idx) => {
              const key = formatDateKey(day);
              const dayShifts = shiftsByDate.get(key) || [];
              const today = isToday(day);

              return (
                <div
                  key={key}
                  className={`min-h-[100px] rounded-md border p-2 ${
                    today
                      ? "border-blue-300 bg-blue-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div
                    className={`mb-1 text-xs font-semibold ${today ? "text-blue-700" : "text-gray-600"}`}
                  >
                    {DAY_LABELS[idx]}
                    <br />
                    {formatDayDisplay(day)}
                  </div>
                  {dayShifts.length === 0 ? (
                    <div className="text-xs text-gray-400">frei</div>
                  ) : (
                    dayShifts.map((s) => (
                      <div
                        key={s.id}
                        className="mb-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800"
                      >
                        {s.starts_at}–{s.ends_at}
                        {s.note && (
                          <div className="truncate text-[10px] text-green-600">
                            {s.note}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
