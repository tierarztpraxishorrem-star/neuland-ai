'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { uiTokens, Card, Button } from '../../components/ui/System';
import { Plus, Tv, Monitor, RefreshCw } from 'lucide-react';

type StationPatient = {
  id: string;
  patient_name: string;
  species: string | null;
  breed: string | null;
  box_number: string | null;
  diagnosis: string | null;
  cave: boolean;
  cave_details: string | null;
  status: string;
  station_day: number;
  admission_date: string;
  discharge_date: string | null;
};

type MedStatus = {
  patient_id: string;
  total_scheduled: number;
  given: number;
  overdue: number;
  next_med: string | null;
  next_hour: number | null;
};

async function fetchWithAuth(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(path, { ...init, headers });
}

export default function StationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isTv = searchParams.get('tv') === '1';
  const [patients, setPatients] = useState<StationPatient[]>([]);
  const [dischargedPatients, setDischargedPatients] = useState<StationPatient[]>([]);
  const [showDischarged, setShowDischarged] = useState(false);
  const [readmitting, setReadmitting] = useState<string | null>(null);
  const [medStatuses, setMedStatuses] = useState<Record<string, MedStatus>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // Daily tasks per patient (für TV-Modus Abholzeiten + offene Checks)
  type DailyTaskInfo = { id: string; label: string; checked: boolean; notes: string | null };
  const [dailyTasksMap, setDailyTasksMap] = useState<Record<string, DailyTaskInfo[]>>({});

  // Offene Verlaufsmessungen pro Patient
  type OpenVital = { param: string; hour: number };
  const [openVitalsMap, setOpenVitalsMap] = useState<Record<string, OpenVital[]>>({});

  const loadData = useCallback(async () => {
    try {
      const [res, disRes] = await Promise.all([
        fetchWithAuth('/api/station/patients?status=active'),
        fetchWithAuth('/api/station/patients?status=discharged'),
      ]);
      if (!res.ok) return;
      const data = await res.json();
      setPatients(data.patients || []);
      if (disRes.ok) {
        const disData = await disRes.json();
        // Only show discharged patients from last 14 days
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const recent = (disData.patients || []).filter((p: StationPatient) =>
          p.discharge_date && new Date(p.discharge_date) >= twoWeeksAgo
        );
        setDischargedPatients(recent);
      }

      // Load medication status for each patient
      const statuses: Record<string, MedStatus> = {};
      await Promise.all(
        (data.patients || []).map(async (p: StationPatient) => {
          try {
            const mRes = await fetchWithAuth(`/api/station/patients/${p.id}`);
            if (!mRes.ok) return;
            const mData = await mRes.json();
            const meds = mData.medications || [];
            const admins = mData.administrations || [];
            const currentHour = new Date().getHours();

            let totalScheduled = 0;
            let given = 0;
            let overdue = 0;
            let nextHour: number | null = null;
            let nextMed: string | null = null;

            for (const med of meds) {
              if (med.is_dti || med.is_prn) continue;
              const hours: number[] = med.scheduled_hours || [];
              for (const h of hours) {
                totalScheduled++;
                const wasGiven = admins.some(
                  (a: Record<string, unknown>) => a.medication_id === med.id && a.scheduled_hour === h
                );
                if (wasGiven) {
                  given++;
                } else if (h <= currentHour) {
                  overdue++;
                } else if (nextHour === null || h < nextHour) {
                  nextHour = h;
                  nextMed = med.name;
                }
              }
            }

            statuses[p.id] = { patient_id: p.id, total_scheduled: totalScheduled, given, overdue, next_med: nextMed, next_hour: nextHour };
          } catch { /* ignore */ }
        })
      );
      setMedStatuses(statuses);

      // Daily tasks für TV-Modus laden
      const tasksMap: Record<string, DailyTaskInfo[]> = {};
      await Promise.all(
        (data.patients || []).map(async (p: StationPatient) => {
          try {
            const dtRes = await fetchWithAuth(`/api/station/patients/${p.id}/daily-tasks`);
            if (dtRes.ok) {
              const dtData = await dtRes.json();
              tasksMap[p.id] = (dtData.tasks || []).map((t: { id: string; label: string; checked: boolean; notes: string | null }) => ({
                id: t.id, label: t.label, checked: t.checked, notes: t.notes,
              }));
            }
          } catch { /* ignore */ }
        })
      );
      setDailyTasksMap(tasksMap);

      // Offene Verlaufsmessungen laden (TV)
      const paramLabels: Record<string, string> = {
        heart_rate: 'HF', resp_rate: 'AF', temperature_c: 'Temp',
        pain_score: 'Schmerz', feces: 'Kot', urine: 'Urin', notes: 'Notiz',
      };
      const vitalsMap: Record<string, OpenVital[]> = {};
      const currentHour = new Date().getHours();
      await Promise.all(
        (data.patients || []).map(async (p: StationPatient) => {
          try {
            const [schedRes, vitalsRes] = await Promise.all([
              fetchWithAuth(`/api/station/patients/${p.id}/vital-schedule`),
              fetchWithAuth(`/api/station/patients/${p.id}/vitals`),
            ]);
            if (!schedRes.ok || !vitalsRes.ok) return;
            const schedData = await schedRes.json();
            const vitalsData = await vitalsRes.json();
            const schedules: Array<{ param_key: string; scheduled_hours: number[] }> = schedData.schedules || [];
            const vitals: Array<Record<string, unknown>> = vitalsData.vitals || [];
            const recordedHours = new Set(vitals.map(v => v.measured_hour as number));

            const open: OpenVital[] = [];
            for (const sched of schedules) {
              for (const h of sched.scheduled_hours) {
                if (h > currentHour) continue; // nur vergangene/aktuelle Stunden
                // Prüfe ob für diese Stunde ein Wert existiert
                const vitalAtHour = vitals.find(v => v.measured_hour === h);
                const hasValue = vitalAtHour && sched.param_key in vitalAtHour && vitalAtHour[sched.param_key] != null;
                if (!hasValue) {
                  open.push({ param: paramLabels[sched.param_key] || sched.param_key, hour: h });
                }
              }
            }
            if (open.length > 0) vitalsMap[p.id] = open;
          } catch { /* ignore */ }
        })
      );
      setOpenVitalsMap(vitalsMap);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleReadmit = async (patientId: string) => {
    if (!confirm('Patient erneut aufnehmen?')) return;
    setReadmitting(patientId);
    try {
      const res = await fetchWithAuth(`/api/station/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          discharge_date: null,
          admission_date: new Date().toISOString(),
          station_day: 1,
        }),
      });
      if (res.ok) {
        loadData();
      }
    } catch { /* ignore */ }
    finally { setReadmitting(null); }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('station-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_med_administrations' }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const getBoxColor = (patientId: string) => {
    const s = medStatuses[patientId];
    if (!s) return '#e5e7eb';
    if (s.overdue > 0) return '#fca5a5';
    if (s.next_hour !== null && s.next_hour - new Date().getHours() <= 0) return '#fde68a';
    if (s.given > 0 && s.given === s.total_scheduled) return '#86efac';
    return '#e5e7eb';
  };

  const activeCount = patients.filter(p => p.status === 'active').length;

  // TV mode
  if (isTv) {
    // Collect next medications across all patients
    const nextMeds: Array<{ time: string; patient: string; med: string }> = [];
    for (const p of patients) {
      const s = medStatuses[p.id];
      if (s && s.next_hour !== null && s.next_med) {
        nextMeds.push({
          time: `${String(s.next_hour).padStart(2, '0')}:00`,
          patient: p.patient_name,
          med: s.next_med,
        });
      }
    }
    nextMeds.sort((a, b) => a.time.localeCompare(b.time));

    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', padding: '32px', fontFamily: 'system-ui, sans-serif' }}>
        {/* TV Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Tv size={28} color="#22d3ee" />
            <span style={{ fontSize: '24px', fontWeight: 700 }}>Station TZN Bergheim</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', fontSize: '20px' }}>
            <span>{now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            <span style={{ fontWeight: 700, fontSize: '28px', fontVariantNumeric: 'tabular-nums' }}>{now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
            <span style={{ background: activeCount > 0 ? '#ef4444' : '#22c55e', borderRadius: '50%', width: '14px', height: '14px', display: 'inline-block' }} />
            <span>{activeCount}</span>
          </div>
        </div>

        {/* Overdue banner */}
        {patients.some((p) => medStatuses[p.id]?.overdue) && (
          <div style={{
            background: '#7f1d1d',
            border: '2px solid #ef4444',
            borderRadius: '12px',
            padding: '16px 24px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            animation: 'pulse 2s infinite',
          }}>
            <span style={{ fontSize: '28px' }}>⚠️</span>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#fca5a5' }}>ÜBERFÄLLIGE MEDIKAMENTE</div>
              <div style={{ fontSize: '15px', color: '#fecaca', marginTop: '4px' }}>
                {patients.filter((p) => medStatuses[p.id]?.overdue).map((p) => {
                  const s = medStatuses[p.id];
                  return `${p.patient_name} (Box ${p.box_number || '–'}): ${s?.overdue} fällig`;
                }).join(' · ')}
              </div>
            </div>
          </div>
        )}

        {/* Patient boxes — klickbar zum Stationsblatt */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px', marginBottom: '40px' }}>
          {patients.map((p) => {
            const s = medStatuses[p.id];
            const borderColor = p.cave ? '#ef4444' : s?.overdue ? '#ef4444' : (s && s.next_hour !== null && s.next_hour - now.getHours() <= 1) ? '#eab308' : '#22c55e';
            return (
              <Link key={p.id} href={`/station/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  background: '#1e293b', borderRadius: '16px', padding: '24px',
                  border: `3px solid ${borderColor}`, minHeight: '180px',
                  cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = `0 0 20px ${borderColor}40`; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>BOX {p.box_number || '–'}</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: '#f1f5f9' }}>{p.patient_name}</div>
                  <div style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '4px' }}>{p.species || ''}</div>
                  <div style={{ fontSize: '15px', color: '#cbd5e1', marginBottom: '12px' }}>{p.diagnosis || ''}</div>
                  {p.cave && <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>CAVE</div>}
                  <div style={{ marginTop: 'auto', fontSize: '14px', color: s?.overdue ? '#fca5a5' : '#86efac' }}>
                    {s?.overdue ? `${s.overdue} Med. fällig` : s?.total_scheduled ? 'alles OK' : '–'}
                  </div>
                  {/* Offene Tasks + Abholzeit + Offene Messungen */}
                  {(() => {
                    const tasks = dailyTasksMap[p.id] || [];
                    const openCount = tasks.filter(t => !t.checked).length;
                    const openTasks = tasks.filter(t => !t.checked);
                    const pickupTask = tasks.find(t => t.label.toLowerCase().includes('abholung') && t.checked && t.notes);
                    const openVitals = openVitalsMap[p.id] || [];
                    return (
                      <>
                        {pickupTask && (
                          <div style={{ marginTop: '8px', padding: '4px 8px', borderRadius: '6px', background: '#164e63', fontSize: '13px', fontWeight: 700, color: '#22d3ee' }}>
                            🚗 Abholung: {pickupTask.notes}
                          </div>
                        )}
                        {openVitals.length > 0 && (
                          <div style={{ marginTop: '6px', fontSize: '12px', color: '#f97316' }}>
                            📊 {openVitals.length} Messung{openVitals.length > 1 ? 'en' : ''} offen
                            <span style={{ color: '#94a3b8', marginLeft: '4px' }}>
                              ({[...new Set(openVitals.map(v => v.param))].join(', ')})
                            </span>
                          </div>
                        )}
                        {openCount > 0 && (
                          <div style={{ marginTop: '4px', fontSize: '12px', color: '#fbbf24' }}>
                            ○ {openCount} Aufgabe{openCount > 1 ? 'n' : ''} offen
                            <span style={{ color: '#94a3b8', marginLeft: '4px' }}>
                              ({openTasks.slice(0, 3).map(t => t.label.length > 20 ? t.label.slice(0, 18) + '...' : t.label).join(', ')}{openCount > 3 ? ', ...' : ''})
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </Link>
            );
          })}
          {/* Empty box placeholder */}
          <div style={{ background: '#1e293b', borderRadius: '16px', padding: '24px', border: '3px solid #334155', minHeight: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
            <span style={{ fontSize: '18px', color: '#64748b' }}>FREI</span>
          </div>
        </div>

        {/* Offene Aufgaben & Messungen – Gesamtübersicht */}
        {(() => {
          const allOpen: Array<{ patientId: string; patient: string; box: string; type: 'task' | 'vital'; taskId?: string; label: string; detail?: string }> = [];
          patients.forEach((p) => {
            const tasks = dailyTasksMap[p.id] || [];
            tasks.filter(t => !t.checked).forEach(t => {
              allOpen.push({ patientId: p.id, patient: p.patient_name, box: p.box_number || '–', type: 'task', taskId: t.id, label: t.label });
            });
            const vitals = openVitalsMap[p.id] || [];
            vitals.forEach(v => {
              allOpen.push({ patientId: p.id, patient: p.patient_name, box: p.box_number || '–', type: 'vital', label: v.param, detail: `${v.hour}:00` });
            });
          });
          if (allOpen.length === 0) return null;

          const checkTask = async (patientId: string, taskId: string) => {
            try {
              const res = await fetchWithAuth(`/api/station/patients/${patientId}/daily-tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task_id: taskId, checked_by: 'TV' }),
              });
              if (res.ok) {
                // Task sofort aus dem State entfernen für direktes Feedback
                setDailyTasksMap((prev) => {
                  const updated = { ...prev };
                  if (updated[patientId]) {
                    updated[patientId] = updated[patientId].map(t =>
                      t.id === taskId ? { ...t, checked: true } : t
                    );
                  }
                  return updated;
                });
              }
            } catch { /* ignore */ }
          };

          return (
            <div style={{ marginBottom: '40px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#94a3b8', marginBottom: '12px', letterSpacing: '1px' }}>OFFENE AUFGABEN & MESSUNGEN</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
                {allOpen.map((item, i) => (
                  <div
                    key={`${item.patientId}-${item.taskId || item.label}-${i}`}
                    onClick={item.type === 'task' && item.taskId ? () => checkTask(item.patientId, item.taskId!) : undefined}
                    style={{
                      fontSize: '14px', padding: '8px 12px', borderRadius: '8px',
                      background: item.type === 'vital' ? '#431407' : '#1c1917',
                      border: `1px solid ${item.type === 'vital' ? '#9a3412' : '#334155'}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: item.type === 'task' ? 'pointer' : 'default',
                      transition: 'background 0.15s, transform 0.1s',
                    }}
                    onMouseEnter={item.type === 'task' ? (e) => { e.currentTarget.style.background = '#22c55e20'; e.currentTarget.style.borderColor = '#22c55e'; } : undefined}
                    onMouseLeave={item.type === 'task' ? (e) => { e.currentTarget.style.background = '#1c1917'; e.currentTarget.style.borderColor = '#334155'; } : undefined}
                  >
                    <span>
                      <span style={{ color: item.type === 'vital' ? '#fb923c' : '#fbbf24', marginRight: '8px' }}>
                        {item.type === 'vital' ? '📊' : '☐'}
                      </span>
                      <span style={{ color: '#e2e8f0' }}>{item.label}</span>
                      {item.detail && <span style={{ color: '#94a3b8', marginLeft: '6px' }}>({item.detail})</span>}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      Box {item.box} · {item.patient}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Next medications */}
        {nextMeds.length > 0 && (
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#94a3b8', marginBottom: '12px', letterSpacing: '1px' }}>NÄCHSTE MEDIKAMENTE</div>
            {nextMeds.slice(0, 6).map((m, i) => (
              <div key={i} style={{ fontSize: '18px', padding: '8px 0', borderBottom: '1px solid #334155', display: 'flex', gap: '16px' }}>
                <span style={{ color: '#22d3ee', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{m.time}</span>
                <span>{m.patient}: {m.med}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Normal mode
  return (
    <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: uiTokens.textPrimary }}>Station</h1>
            <p style={{ margin: '4px 0 0', color: uiTokens.textSecondary, fontSize: '14px' }}>{activeCount} aktive Patienten</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" onClick={() => loadData()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={16} /> Aktualisieren
            </Button>
            <Link href="/station?tv=1" target="_blank" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Monitor size={16} /> TV-Modus
              </Button>
            </Link>
            <Link href="/station/new" style={{ textDecoration: 'none' }}>
              <Button variant="primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> Neuer Patient
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <Card><p style={{ color: uiTokens.textSecondary, textAlign: 'center', padding: '40px' }}>Lade Stationspatienten...</p></Card>
        ) : patients.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <p style={{ fontSize: '18px', color: uiTokens.textSecondary, marginBottom: '16px' }}>Keine Patienten auf Station</p>
              <Link href="/station/new" style={{ textDecoration: 'none' }}>
                <Button variant="primary">Ersten Patienten aufnehmen</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {patients.map((p) => {
              const s = medStatuses[p.id];
              return (
                <Link key={p.id} href={`/station/${p.id}`} style={{ textDecoration: 'none' }}>
                  <Card style={{
                    cursor: 'pointer', transition: 'box-shadow 0.15s',
                    borderLeft: `4px solid ${getBoxColor(p.id)}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: uiTokens.textMuted, fontWeight: 600, letterSpacing: '0.5px' }}>
                          BOX {p.box_number || '–'} · TAG {p.station_day}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: uiTokens.textPrimary, marginTop: '2px' }}>{p.patient_name}</div>
                      </div>
                      {p.cave && (
                        <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>CAVE</span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: uiTokens.textSecondary, marginBottom: '4px' }}>
                      {[p.species, p.breed].filter(Boolean).join(' · ')}
                    </div>
                    {p.diagnosis && (
                      <div style={{ fontSize: '13px', color: uiTokens.textPrimary, marginBottom: '8px' }}>{p.diagnosis}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: uiTokens.textMuted, borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginTop: '4px' }}>
                      <span>{s?.overdue ? `${s.overdue} überfällig` : s?.total_scheduled ? `${s.given}/${s.total_scheduled} gegeben` : 'Keine Medikamente'}</span>
                      {s && s.next_hour !== null && s.next_med && (
                        <span>Nächstes: {String(s.next_hour).padStart(2, '0')}:00</span>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* Entlassene Patienten (letzte 14 Tage) */}
        {dischargedPatients.length > 0 && (
          <div style={{ marginTop: isTv ? 20 : 32 }}>
            <button
              onClick={() => setShowDischarged((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                color: uiTokens.textSecondary,
                padding: '8px 0',
              }}
            >
              <span style={{ transition: 'transform 150ms', transform: showDischarged ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
              Entlassen ({dischargedPatients.length}) · letzte 14 Tage
            </button>
            {showDischarged && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: isTv ? 'repeat(auto-fill, minmax(280px, 1fr))' : 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 10,
                marginTop: 8,
              }}>
                {dischargedPatients.map((p) => (
                  <Card key={p.id} style={{
                    padding: isTv ? '14px' : '16px',
                    opacity: 0.65,
                    background: '#f8fafc',
                  }}>
                    <Link href={`/station/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: uiTokens.textMuted, fontWeight: 600, letterSpacing: '0.5px' }}>
                            BOX {p.box_number || '–'} · {p.station_day} Tage
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: uiTokens.textSecondary, marginTop: '2px' }}>{p.patient_name}</div>
                        </div>
                        <span style={{ background: '#e2e8f0', color: '#475569', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px' }}>
                          Entlassen
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: uiTokens.textMuted, marginTop: 4 }}>
                        {[p.species, p.breed].filter(Boolean).join(' · ')}
                        {p.discharge_date && ` · ${new Date(p.discharge_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`}
                      </div>
                    </Link>
                    <button
                      onClick={() => handleReadmit(p.id)}
                      disabled={readmitting === p.id}
                      style={{
                        marginTop: '8px', width: '100%', padding: '8px',
                        borderRadius: '8px', border: `1px solid ${uiTokens.brand}`,
                        background: readmitting === p.id ? '#e5e7eb' : 'white',
                        color: uiTokens.brand, fontWeight: 600, fontSize: '12px',
                        cursor: readmitting === p.id ? 'wait' : 'pointer',
                      }}
                    >
                      {readmitting === p.id ? 'Wird aufgenommen...' : '↩ Wieder aufnehmen'}
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
