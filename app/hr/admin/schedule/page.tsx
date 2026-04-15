"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type Shift = {
  id: string;
  employee_id: string;
  date: string;
  starts_at: string;
  ends_at: string;
  note?: string | null;
};

type Employee = {
  id: string;
  user_id: string;
  role: string;
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
  const diff = day === 0 ? -6 : 1 - day;
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

export default function AdminSchedulePage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modal state for adding a shift
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState("");
  const [modalEmployee, setModalEmployee] = useState("");
  const [modalStart, setModalStart] = useState("08:00");
  const [modalEnd, setModalEnd] = useState("16:00");
  const [modalNote, setModalNote] = useState("");

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const weekDays = getWeekDays(baseDate);
  const from = formatDateKey(weekDays[0]);
  const to = formatDateKey(weekDays[6]);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const [shiftsRes, systemRes] = await Promise.all([
        fetchWithAuth(`/api/hr/shifts?from=${from}&to=${to}`),
        fetchWithAuth("/api/debug/system-state"),
      ]);

      const shiftsData = await shiftsRes.json();
      const systemData = await systemRes.json();

      if (!shiftsRes.ok)
        throw new Error(shiftsData.error || "Fehler beim Laden der Schichten.");
      if (!systemRes.ok)
        throw new Error(systemData.error || "Fehler beim Laden.");

      setShifts(shiftsData.shifts || []);
      setEmployees(systemData.employees || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openAddShift(dateStr: string) {
    setModalDate(dateStr);
    setModalEmployee(employees[0]?.id || "");
    setModalStart("08:00");
    setModalEnd("16:00");
    setModalNote("");
    setShowModal(true);
  }

  async function handleAddShift(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/hr/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: modalEmployee,
          date: modalDate,
          starts_at: modalStart,
          ends_at: modalEnd,
          note: modalNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Erstellen.");
      setShowModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteShift(shiftId: string) {
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/hr/shifts/${shiftId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Löschen.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  function getEmployeeLabel(employeeId: string) {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return employeeId.slice(0, 8);
    return emp.user_id.slice(0, 8);
  }

  // Build grid: rows = employees, columns = days
  const shiftMap = new Map<string, Shift[]>();
  for (const s of shifts) {
    const key = `${s.employee_id}:${s.date}`;
    const existing = shiftMap.get(key) || [];
    existing.push(s);
    shiftMap.set(key, existing);
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4">
      <h1 className="text-2xl font-bold">Dienstplanung</h1>

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

      {/* Schedule table */}
      {loading ? (
        <p className="text-sm text-gray-500">Laden…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  Mitarbeiter
                </th>
                {weekDays.map((day, idx) => {
                  const today = isToday(day);
                  return (
                    <th
                      key={formatDateKey(day)}
                      className={`px-2 py-2 text-center font-medium ${today ? "bg-blue-50 text-blue-700" : "text-gray-600"}`}
                    >
                      {DAY_LABELS[idx]}
                      <br />
                      <span className="text-xs font-normal">
                        {formatDayDisplay(day)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b border-gray-100">
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-gray-700">
                    {emp.user_id.slice(0, 8)}…
                  </td>
                  {weekDays.map((day) => {
                    const key = `${emp.id}:${formatDateKey(day)}`;
                    const cellShifts = shiftMap.get(key) || [];
                    const today = isToday(day);
                    return (
                      <td
                        key={formatDateKey(day)}
                        className={`cursor-pointer px-1 py-1 text-center ${today ? "bg-blue-50/50" : ""}`}
                        onClick={() => openAddShift(formatDateKey(day))}
                      >
                        {cellShifts.length === 0 ? (
                          <span className="text-xs text-gray-300">+</span>
                        ) : (
                          cellShifts.map((s) => (
                            <div
                              key={s.id}
                              className="group relative mb-0.5 rounded bg-green-100 px-1 py-0.5 text-[10px] text-green-800"
                            >
                              {s.starts_at}–{s.ends_at}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteShift(s.id);
                                }}
                                className="absolute -right-1 -top-1 hidden rounded-full bg-red-500 px-1 text-[8px] text-white group-hover:block"
                              >
                                ×
                              </button>
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add shift modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">
              Schicht eintragen – {modalDate}
            </h3>
            <form onSubmit={handleAddShift} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Mitarbeiter
                </label>
                <select
                  value={modalEmployee}
                  onChange={(e) => setModalEmployee(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.user_id.slice(0, 8)}… ({emp.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Von
                  </label>
                  <input
                    type="time"
                    value={modalStart}
                    onChange={(e) => setModalStart(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Bis
                  </label>
                  <input
                    type="time"
                    value={modalEnd}
                    onChange={(e) => setModalEnd(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Notiz (optional)
                </label>
                <input
                  type="text"
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={submitting || !modalEmployee}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Speichern…" : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
