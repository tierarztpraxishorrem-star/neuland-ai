'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Section, SelectInput, uiTokens } from '../../components/ui/System';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

type Appointment = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number; // minutes
  title: string;
  patientName: string;
  ownerName: string;
  notes: string;
  type: 'konsultation' | 'op' | 'kontrolle' | 'impfung' | 'sonstiges';
};

type ViewMode = 'week' | 'day';

const STORAGE_KEY = 'neuland_appointments';

const TYPE_LABELS: Record<Appointment['type'], string> = {
  konsultation: 'Konsultation',
  op: 'OP',
  kontrolle: 'Kontrolle',
  impfung: 'Impfung',
  sonstiges: 'Sonstiges'
};

const TYPE_COLORS: Record<Appointment['type'], string> = {
  konsultation: '#0F6B74',
  op: '#dc2626',
  kontrolle: '#2563eb',
  impfung: '#16a34a',
  sonstiges: '#64748b'
};

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 – 19:00

function loadAppointments(): Appointment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAppointments(data: Appointment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export default function TerminePage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: formatDateKey(new Date()),
    time: '09:00',
    duration: 30,
    title: '',
    patientName: '',
    ownerName: '',
    notes: '',
    type: 'konsultation' as Appointment['type']
  });

  useEffect(() => {
    // Check auth
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/');
    });
    setAppointments(loadAppointments());
  }, [router]);

  const weekDays = useMemo(() => {
    const monday = getMonday(currentDate);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const visibleDates = useMemo(() => {
    if (viewMode === 'day') return [formatDateKey(currentDate)];
    return weekDays.map(formatDateKey);
  }, [viewMode, currentDate, weekDays]);

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const apt of appointments) {
      if (!map[apt.date]) map[apt.date] = [];
      map[apt.date].push(apt);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [appointments]);

  const navigate = useCallback((direction: -1 | 1) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + (viewMode === 'week' ? 7 * direction : direction));
      return next;
    });
  }, [viewMode]);

  const openNewAppointment = (date?: string, time?: string) => {
    setEditingId(null);
    setForm({
      date: date || formatDateKey(currentDate),
      time: time || '09:00',
      duration: 30,
      title: '',
      patientName: '',
      ownerName: '',
      notes: '',
      type: 'konsultation'
    });
    setShowModal(true);
  };

  const openEditAppointment = (apt: Appointment) => {
    setEditingId(apt.id);
    setForm({
      date: apt.date,
      time: apt.time,
      duration: apt.duration,
      title: apt.title,
      patientName: apt.patientName,
      ownerName: apt.ownerName,
      notes: apt.notes,
      type: apt.type
    });
    setShowModal(true);
  };

  const saveForm = () => {
    if (!form.title.trim()) {
      alert('Titel ist erforderlich.');
      return;
    }

    const updated = [...appointments];
    if (editingId) {
      const idx = updated.findIndex((a) => a.id === editingId);
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], ...form };
      }
    } else {
      updated.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...form
      });
    }
    setAppointments(updated);
    saveAppointments(updated);
    setShowModal(false);
  };

  const deleteAppointment = (id: string) => {
    const next = appointments.filter((a) => a.id !== id);
    setAppointments(next);
    saveAppointments(next);
    if (editingId === id) setShowModal(false);
  };

  const todayKey = formatDateKey(new Date());

  return (
    <main style={{ padding: uiTokens.pagePadding, background: uiTokens.pageBackground, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <h1 style={{ color: uiTokens.brand, margin: 0, fontSize: '32px', fontWeight: 700 }}>Termine</h1>
        <Button variant='primary' size='lg' onClick={() => openNewAppointment()}>
          + Neuer Termin
        </Button>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Button variant='secondary' onClick={() => navigate(-1)}>←</Button>
        <Button variant='secondary' onClick={() => setCurrentDate(new Date())}>Heute</Button>
        <Button variant='secondary' onClick={() => navigate(1)}>→</Button>

        <div style={{ marginLeft: '12px', display: 'flex', gap: '4px' }}>
          <Button
            variant={viewMode === 'week' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('week')}
          >
            Woche
          </Button>
          <Button
            variant={viewMode === 'day' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('day')}
          >
            Tag
          </Button>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '15px', fontWeight: 600, color: uiTokens.textPrimary }}>
          {viewMode === 'week'
            ? `${formatDayLabel(weekDays[0])} – ${formatDayLabel(weekDays[5])}`
            : currentDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Calendar Grid */}
      <Card style={{ padding: 0, overflow: 'auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: viewMode === 'week'
            ? '60px repeat(6, minmax(120px, 1fr))'
            : '60px 1fr',
          minWidth: viewMode === 'week' ? '780px' : undefined
        }}>
          {/* Header row */}
          <div style={{ borderBottom: '1px solid #e2e8f0', padding: '8px 4px', background: '#f8fafc' }} />
          {(viewMode === 'week' ? weekDays : [currentDate]).map((day) => {
            const key = formatDateKey(day);
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                style={{
                  borderBottom: '1px solid #e2e8f0',
                  borderLeft: '1px solid #e2e8f0',
                  padding: '8px',
                  background: isToday ? '#ecfeff' : '#f8fafc',
                  fontWeight: isToday ? 700 : 600,
                  fontSize: '13px',
                  color: isToday ? '#0F6B74' : uiTokens.textPrimary,
                  textAlign: 'center'
                }}
              >
                {formatDayLabel(day)}
              </div>
            );
          })}

          {/* Time rows */}
          {HOURS.map((hour) => (
            <>
              <div
                key={`label-${hour}`}
                style={{
                  padding: '4px 6px',
                  fontSize: '11px',
                  color: '#94a3b8',
                  textAlign: 'right',
                  borderBottom: '1px solid #f1f5f9',
                  height: '60px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-end'
                }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
              {visibleDates.map((dateKey) => {
                const hourStr = String(hour).padStart(2, '0');
                const dayAppointments = (appointmentsByDate[dateKey] || []).filter((apt) => {
                  const aptHour = parseInt(apt.time.split(':')[0], 10);
                  return aptHour === hour;
                });
                const isToday = dateKey === todayKey;

                return (
                  <div
                    key={`${dateKey}-${hour}`}
                    onClick={() => openNewAppointment(dateKey, `${hourStr}:00`)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      borderLeft: '1px solid #e2e8f0',
                      padding: '2px',
                      height: '60px',
                      background: isToday ? 'rgba(15,107,116,0.03)' : undefined,
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                  >
                    {dayAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditAppointment(apt);
                        }}
                        style={{
                          background: TYPE_COLORS[apt.type],
                          color: '#fff',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          marginBottom: '2px',
                          cursor: 'pointer',
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={`${apt.time} – ${apt.title} (${apt.patientName || 'Kein Patient'})`}
                      >
                        {apt.time} {apt.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </Card>

      {/* Appointment Modal */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120
          }}
        >
          <Card
            style={{ width: 'min(520px, calc(100vw - 24px))', padding: '20px' }}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '20px' }}>
                  {editingId ? 'Termin bearbeiten' : 'Neuer Termin'}
                </h3>
                <Button variant='ghost' onClick={() => setShowModal(false)} style={{ fontSize: '18px' }}>✕</Button>
              </div>

              <Section title='Details'>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Input
                      label='Titel *'
                      value={form.title}
                      onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder='z. B. Kontrolle Wundverlauf'
                    />
                  </div>

                  <Input
                    label='Datum'
                    type='date'
                    value={form.date}
                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  />
                  <Input
                    label='Uhrzeit'
                    type='time'
                    value={form.time}
                    onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                  />
                  <Input
                    label='Dauer (Min.)'
                    type='number'
                    value={String(form.duration)}
                    onChange={(e) => setForm((p) => ({ ...p, duration: Math.max(5, parseInt(e.target.value, 10) || 30) }))}
                  />

                  <SelectInput
                    label='Typ'
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as Appointment['type'] }))}
                  >
                    {Object.entries(TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </SelectInput>

                  <Input
                    label='Patient'
                    value={form.patientName}
                    onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))}
                    placeholder='Patientenname'
                  />
                  <Input
                    label='Besitzer'
                    value={form.ownerName}
                    onChange={(e) => setForm((p) => ({ ...p, ownerName: e.target.value }))}
                    placeholder='Besitzername'
                  />
                </div>

                <div style={{ marginTop: '10px' }}>
                  <Input
                    label='Notizen'
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder='Optionale Notizen'
                  />
                </div>
              </Section>

              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
                {editingId && (
                  <Button
                    variant='secondary'
                    onClick={() => deleteAppointment(editingId)}
                    style={{ color: '#dc2626', marginRight: 'auto' }}
                  >
                    Löschen
                  </Button>
                )}
                <Button variant='secondary' onClick={() => setShowModal(false)}>Abbrechen</Button>
                <Button variant='primary' onClick={saveForm}>
                  {editingId ? 'Speichern' : 'Termin erstellen'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
