'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { uiTokens, Card, Button, Input, Section } from '../../../components/ui/System';
import { showToast } from '../../../lib/toast';
import { ArrowLeft, Search, UserPlus } from 'lucide-react';

type PatientSearchResult = {
  id: string;
  name: string;
  tierart: string | null;
  rasse: string | null;
  owner_name: string | null;
};

async function fetchWithAuth(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(path, { ...init, headers });
}

const EMPTY_FORM = {
  patient_name: '', patient_number: '', chip_number: '',
  species: 'Hund', breed: '', birth_date: '', gender: 'männlich',
  owner_name: '', weight_kg: '',
  box_number: '', diagnosis: '', problems: '',
  cave: false, cave_details: '',
  has_collar: false, has_iv_catheter: false, iv_catheter_location: '', iv_catheter_date: '',
  diet_type: '', diet_notes: '',
  dnr: false, responsible_vet: '', responsible_tfa: '',
  patient_id: null as string | null,
};

export default function NewStationPatientPage() {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'choose' | 'search' | 'manual'>('choose');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const set = (field: string, value: unknown) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const term = `%${searchQuery.trim()}%`;
      const { data } = await supabase
        .from('patients')
        .select('id, name, tierart, rasse, owner_name')
        .or(`name.ilike.${term},owner_name.ilike.${term}`)
        .limit(20);
      setSearchResults((data || []) as PatientSearchResult[]);
    } catch { /* ignore */ } finally { setSearching(false); }
  };

  const selectPatient = (p: PatientSearchResult) => {
    setForm({
      ...EMPTY_FORM,
      patient_id: p.id,
      patient_name: p.name || '',
      species: p.tierart || 'Hund',
      breed: p.rasse || '',
      owner_name: p.owner_name || '',
    });
    setMode('manual');
  };

  const handleSubmit = async () => {
    if (!form.patient_name.trim()) { showToast({ message: 'Patientenname erforderlich.', type: 'error' }); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(form)) {
        if (val === '' || val === null) continue;
        if (key === 'weight_kg') { body[key] = parseFloat(val as string) || null; continue; }
        body[key] = val;
      }

      const res = await fetchWithAuth('/api/station/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { showToast({ message: data.error || 'Fehler beim Anlegen.', type: 'error' }); return; }

      showToast({ message: 'Patient auf Station aufgenommen!', type: 'success' });

      // Trigger AI check
      fetchWithAuth(`/api/station/patients/${data.patient.id}/ai-check`, { method: 'POST' }).catch(() => {});

      router.push(`/station/${data.patient.id}`);
    } catch { showToast({ message: 'Fehler.', type: 'error' }); } finally { setSubmitting(false); }
  };

  return (
    <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <Link href="/station"><Button variant="ghost" size="sm"><ArrowLeft size={16} /></Button></Link>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>Neuer Stationspatient</h1>
        </div>

        {mode === 'choose' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <Card style={{ cursor: 'pointer', padding: '24px' }} onClick={() => setMode('search')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Search size={24} color={uiTokens.brand} />
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: uiTokens.textPrimary }}>Aus Patientensystem laden</div>
                  <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>Patient im Neuland AI System suchen und Daten übernehmen</div>
                </div>
              </div>
            </Card>
            <Card style={{ cursor: 'pointer', padding: '24px' }} onClick={() => setMode('manual')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <UserPlus size={24} color={uiTokens.brand} />
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: uiTokens.textPrimary }}>Manuell eingeben</div>
                  <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>Alle Daten von Hand eintragen</div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {mode === 'search' && (
          <Card style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Patientenname oder Nummer..."
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                fullWidth
              />
              <Button variant="primary" onClick={handleSearch} disabled={searching}>
                {searching ? '...' : 'Suchen'}
              </Button>
            </div>
            {searchResults.length > 0 && (
              <div style={{ display: 'grid', gap: '8px' }}>
                {searchResults.map(p => (
                  <div
                    key={p.id}
                    onClick={() => selectPatient(p)}
                    style={{
                      padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>{[p.tierart, p.rasse, p.owner_name].filter(Boolean).join(' · ')}</div>
                  </div>
                ))}
              </div>
            )}
            {searchResults.length === 0 && searchQuery && !searching && (
              <p style={{ color: uiTokens.textMuted, textAlign: 'center' }}>Keine Ergebnisse. <button onClick={() => setMode('manual')} style={{ color: uiTokens.brand, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Manuell eingeben</button></p>
            )}
          </Card>
        )}

        {mode === 'manual' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <Section title="Patientendaten">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label="Patientenname *" value={form.patient_name} onChange={(e) => set('patient_name', e.target.value)} />
                <Input label="Patientennummer" value={form.patient_number} onChange={(e) => set('patient_number', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Tierart</label>
                  <select value={form.species} onChange={(e) => set('species', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}>
                    <option>Hund</option><option>Katze</option><option>Kaninchen</option><option>Vogel</option><option>Reptil</option><option>Sonstige</option>
                  </select>
                </div>
                <Input label="Rasse" value={form.breed} onChange={(e) => set('breed', e.target.value)} />
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Geschlecht</label>
                  <select value={form.gender} onChange={(e) => set('gender', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}>
                    <option>männlich</option><option>weiblich</option><option>männlich kastriert</option><option>weiblich kastriert</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <Input label="Geburtsdatum" type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
                <Input label="Gewicht (kg)" type="number" step="0.1" value={form.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} />
                <Input label="Chipnummer" value={form.chip_number} onChange={(e) => set('chip_number', e.target.value)} />
              </div>
              <Input label="Besitzer" value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} fullWidth />
            </Section>

            <Section title="Station">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label="Box-Nummer" value={form.box_number} onChange={(e) => set('box_number', e.target.value)} placeholder="z.B. 1, 2, A3" />
                <Input label="Verantwortlicher Tierarzt" value={form.responsible_vet} onChange={(e) => set('responsible_vet', e.target.value)} />
              </div>
              <Input label="Verantwortliche TFA" value={form.responsible_tfa} onChange={(e) => set('responsible_tfa', e.target.value)} fullWidth />
              <Input label="Diagnose" value={form.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} fullWidth />
              <Input label="Probleme" value={form.problems} onChange={(e) => set('problems', e.target.value)} fullWidth />
            </Section>

            <Section title="Besonderheiten">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.cave} onChange={(e) => set('cave', e.target.checked)} /> CAVE
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.has_collar} onChange={(e) => set('has_collar', e.target.checked)} /> Halskragen
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.has_iv_catheter} onChange={(e) => set('has_iv_catheter', e.target.checked)} /> Braunüle
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.dnr} onChange={(e) => set('dnr', e.target.checked)} /> DNR (nicht reanimieren)
                </label>
              </div>
              {form.cave && <Input label="CAVE Details" value={form.cave_details} onChange={(e) => set('cave_details', e.target.value)} fullWidth />}
              {form.has_iv_catheter && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Input label="Braunüle Ort" value={form.iv_catheter_location} onChange={(e) => set('iv_catheter_location', e.target.value)} placeholder="z.B. vorne rechts" />
                  <Input label="Braunüle Datum" type="date" value={form.iv_catheter_date} onChange={(e) => set('iv_catheter_date', e.target.value)} />
                </div>
              )}
            </Section>

            <Section title="Ernährung">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label="Diät-Typ" value={form.diet_type} onChange={(e) => set('diet_type', e.target.value)} placeholder="z.B. Magenschonkost" />
                <Input label="Ernährungs-Notizen" value={form.diet_notes} onChange={(e) => set('diet_notes', e.target.value)} />
              </div>
            </Section>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Link href="/station"><Button variant="ghost">Abbrechen</Button></Link>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting || !form.patient_name.trim()}
                style={{ minHeight: '44px', minWidth: '200px' }}
              >
                {submitting ? 'Wird angelegt...' : 'Patient aufnehmen'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
