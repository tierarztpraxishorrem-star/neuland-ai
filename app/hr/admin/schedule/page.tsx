"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { uiTokens, Card, Button, Input } from "../../../../components/ui/System";

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
  display_name?: string | null;
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
    return emp.display_name || emp.user_id.slice(0, 8);
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
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(1000px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>
          Dienstplanung
        </h1>

        {error && (
          <div style={{ padding: 12, borderRadius: uiTokens.radiusCard, border: "1px solid #fca5a5", background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Week navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
            ← Vorherige Woche
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset(0)}>
            Aktuelle Woche
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
            Nächste Woche →
          </Button>
        </div>

        {/* Schedule table */}
        {loading ? (
          <p style={{ fontSize: 14, color: uiTokens.textMuted }}>Laden…</p>
        ) : (
          <Card style={{ padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: uiTokens.cardBorder, background: "#f9fafb" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: uiTokens.textSecondary }}>
                    Mitarbeiter
                  </th>
                  {weekDays.map((day, idx) => {
                    const today = isToday(day);
                    return (
                      <th
                        key={formatDateKey(day)}
                        style={{
                          padding: "8px 6px",
                          textAlign: "center",
                          fontWeight: 500,
                          color: today ? uiTokens.brand : uiTokens.textSecondary,
                          background: today ? "#e0f2f1" : "transparent",
                        }}
                      >
                        {DAY_LABELS[idx]}
                        <br />
                        <span style={{ fontSize: 12, fontWeight: 400 }}>
                          {formatDayDisplay(day)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 500, color: uiTokens.textPrimary, whiteSpace: "nowrap" }}>
                      {emp.display_name || `${emp.user_id.slice(0, 8)}…`}
                    </td>
                    {weekDays.map((day) => {
                      const key = `${emp.id}:${formatDateKey(day)}`;
                      const cellShifts = shiftMap.get(key) || [];
                      const today = isToday(day);
                      return (
                        <td
                          key={formatDateKey(day)}
                          style={{
                            padding: 4,
                            textAlign: "center",
                            cursor: "pointer",
                            background: today ? "rgba(15,107,116,0.04)" : "transparent",
                          }}
                          onClick={() => {
                            setModalEmployee(emp.id);
                            openAddShift(formatDateKey(day));
                          }}
                        >
                          {cellShifts.length === 0 ? (
                            <span style={{ fontSize: 12, color: uiTokens.textMuted }}>+</span>
                          ) : (
                            cellShifts.map((s) => (
                              <div
                                key={s.id}
                                style={{
                                  position: "relative",
                                  marginBottom: 2,
                                  borderRadius: 6,
                                  background: "#dcfce7",
                                  padding: "2px 4px",
                                  fontSize: 10,
                                  color: "#166534",
                                }}
                              >
                                {s.starts_at}–{s.ends_at}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteShift(s.id);
                                  }}
                                  style={{
                                    position: "absolute",
                                    right: -4,
                                    top: -4,
                                    borderRadius: "50%",
                                    background: "#ef4444",
                                    color: "#fff",
                                    border: "none",
                                    fontSize: 8,
                                    width: 14,
                                    height: 14,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    opacity: 0,
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
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
          </Card>
        )}

        {/* Add shift modal */}
        {showModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
            <Card style={{ width: "100%", maxWidth: 420, padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: uiTokens.textPrimary, marginBottom: 16 }}>
                Schicht eintragen – {modalDate}
              </h3>
              <form onSubmit={handleAddShift} style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500, color: uiTokens.textSecondary }}>
                    Mitarbeiter
                  </label>
                  <select
                    value={modalEmployee}
                    onChange={(e) => setModalEmployee(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: uiTokens.radiusCard,
                      border: uiTokens.cardBorder,
                      fontSize: 14,
                      background: "#fff",
                    }}
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.display_name || `${emp.user_id.slice(0, 8)}…`} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500, color: uiTokens.textSecondary }}>
                      Von
                    </label>
                    <input
                      type="time"
                      value={modalStart}
                      onChange={(e) => setModalStart(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: uiTokens.radiusCard,
                        border: uiTokens.cardBorder,
                        fontSize: 14,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500, color: uiTokens.textSecondary }}>
                      Bis
                    </label>
                    <input
                      type="time"
                      value={modalEnd}
                      onChange={(e) => setModalEnd(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: uiTokens.radiusCard,
                        border: uiTokens.cardBorder,
                        fontSize: 14,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500, color: uiTokens.textSecondary }}>
                    Notiz (optional)
                  </label>
                  <input
                    type="text"
                    value={modalNote}
                    onChange={(e) => setModalNote(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: uiTokens.radiusCard,
                      border: uiTokens.cardBorder,
                      fontSize: 14,
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
                  <Button variant="secondary" size="sm" onClick={() => setShowModal(false)} type="button">
                    Abbrechen
                  </Button>
                  <Button size="sm" disabled={submitting || !modalEmployee} type="submit">
                    {submitting ? "Speichern…" : "Speichern"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
