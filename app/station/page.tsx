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
};

type MedStatus = {
  patient_id: string;
  total_scheduled: number;
  given: number;
  overdue: number;
  next_med: string | null;
  next_hour: number | null;
};

async function fetchWithAuth(path: string) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
}

export default function StationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isTv = searchParams.get('tv') === '1';
  const [patients, setPatients] = useState<StationPatient[]>([]);
  const [medStatuses, setMedStatuses] = useState<Record<string, MedStatus>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const loadData = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/station/patients?status=active');
      if (!res.ok) return;
      const data = await res.json();
      setPatients(data.patients || []);

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
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

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
      if (s?.next_hour !== null && s?.next_med) {
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

        {/* Patient boxes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px', marginBottom: '40px' }}>
          {patients.map((p) => {
            const s = medStatuses[p.id];
            const borderColor = p.cave ? '#ef4444' : s?.overdue ? '#ef4444' : s?.next_hour !== null && s.next_hour - now.getHours() <= 1 ? '#eab308' : '#22c55e';
            return (
              <div key={p.id} style={{
                background: '#1e293b', borderRadius: '16px', padding: '24px',
                border: `3px solid ${borderColor}`, minHeight: '180px',
              }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>BOX {p.box_number || '–'}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>{p.patient_name}</div>
                <div style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '4px' }}>{p.species || ''}</div>
                <div style={{ fontSize: '15px', color: '#cbd5e1', marginBottom: '12px' }}>{p.diagnosis || ''}</div>
                {p.cave && <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>CAVE</div>}
                <div style={{ marginTop: 'auto', fontSize: '14px', color: s?.overdue ? '#fca5a5' : '#86efac' }}>
                  {s?.overdue ? `${s.overdue} Med. fällig` : s?.total_scheduled ? 'alles OK' : '–'}
                </div>
              </div>
            );
          })}
          {/* Empty box placeholder */}
          <div style={{ background: '#1e293b', borderRadius: '16px', padding: '24px', border: '3px solid #334155', minHeight: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
            <span style={{ fontSize: '18px', color: '#64748b' }}>FREI</span>
          </div>
        </div>

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
                      {s?.next_hour !== null && s?.next_med && (
                        <span>Nächstes: {String(s.next_hour).padStart(2, '0')}:00</span>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
