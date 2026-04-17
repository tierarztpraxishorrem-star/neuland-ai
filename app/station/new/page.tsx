/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { uiTokens, Card, Button, Input, Section } from '../../../components/ui/System';
import { showToast } from '../../../lib/toast';
import { ArrowLeft, Search, UserPlus, Mic, MicOff, Check, SkipForward, ChevronRight } from 'lucide-react';

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

// Voice input steps
const VOICE_STEPS = [
  { field: 'patient_name', label: 'Patientenname', prompt: 'Wie heißt der Patient?', required: true },
  { field: 'species', label: 'Tierart', prompt: 'Welche Tierart? (Hund, Katze, Kaninchen...)', required: true },
  { field: 'breed', label: 'Rasse', prompt: 'Welche Rasse?', required: false },
  { field: 'gender', label: 'Geschlecht', prompt: 'Geschlecht? (männlich, weiblich, kastriert...)', required: false },
  { field: 'weight_kg', label: 'Gewicht (kg)', prompt: 'Wie viel wiegt der Patient in Kilogramm?', required: true },
  { field: 'owner_name', label: 'Besitzer', prompt: 'Name des Besitzers?', required: false },
  { field: 'box_number', label: 'Box-Nummer', prompt: 'In welche Box kommt der Patient?', required: false },
  { field: 'diagnosis', label: 'Diagnose', prompt: 'Was ist die Diagnose?', required: true },
  { field: 'responsible_vet', label: 'Verantwortlicher Tierarzt', prompt: 'Wer ist der verantwortliche Tierarzt?', required: false },
  { field: 'responsible_tfa', label: 'Verantwortliche TFA', prompt: 'Wer ist die verantwortliche TFA?', required: false },
  { field: 'cave_details', label: 'CAVE', prompt: 'Gibt es CAVE-Hinweise? (Sag "nein" wenn keine)', required: false },
];

export default function NewStationPatientPage() {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'choose' | 'search' | 'manual' | 'voice'>('choose');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Voice state
  const [voiceStep, setVoiceStep] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const set = (field: string, value: unknown) => setForm(prev => ({ ...prev, [field]: value }));

  // Speech recognition setup
  const startListening = useCallback(() => {
    const W = window as any;
    const SpeechRecognition = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast({ message: 'Spracherkennung wird von diesem Browser nicht unterstützt.', type: 'error' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript('');
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const normalizeVoiceInput = (field: string, raw: string): string | boolean => {
    const text = raw.trim();
    if (field === 'species') {
      const lower = text.toLowerCase();
      if (lower.includes('hund')) return 'Hund';
      if (lower.includes('katze')) return 'Katze';
      if (lower.includes('kaninchen')) return 'Kaninchen';
      if (lower.includes('vogel')) return 'Vogel';
      if (lower.includes('reptil')) return 'Reptil';
      return text;
    }
    if (field === 'gender') {
      const lower = text.toLowerCase();
      if (lower.includes('kastriert') && lower.includes('weib')) return 'weiblich kastriert';
      if (lower.includes('kastriert')) return 'männlich kastriert';
      if (lower.includes('weib')) return 'weiblich';
      return 'männlich';
    }
    if (field === 'weight_kg') {
      const num = text.replace(/[^0-9.,]/g, '').replace(',', '.');
      return num;
    }
    if (field === 'cave_details') {
      const lower = text.toLowerCase();
      if (lower === 'nein' || lower === 'keine' || lower === 'nein keine') return '';
      return text;
    }
    return text;
  };

  const confirmVoiceStep = () => {
    if (!transcript.trim()) return;
    const step = VOICE_STEPS[voiceStep];
    const value = normalizeVoiceInput(step.field, transcript);
    if (step.field === 'cave_details' && value) {
      set('cave', true);
    }
    set(step.field, value);
    setTranscript('');
    if (voiceStep < VOICE_STEPS.length - 1) {
      setVoiceStep(voiceStep + 1);
    } else {
      setMode('manual'); // Switch to manual for final review
    }
  };

  const skipVoiceStep = () => {
    setTranscript('');
    if (voiceStep < VOICE_STEPS.length - 1) {
      setVoiceStep(voiceStep + 1);
    } else {
      setMode('manual');
    }
  };

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
            <Card style={{ cursor: 'pointer', padding: '24px' }} onClick={() => setMode('voice')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Mic size={24} color={uiTokens.brand} />
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: uiTokens.textPrimary }}>Per Sprache aufnehmen</div>
                  <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>Schritt für Schritt diktieren – Daten werden live angezeigt</div>
                </div>
              </div>
            </Card>
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

        {/* Voice guided input */}
        {mode === 'voice' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            {/* Progress */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {VOICE_STEPS.map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: '4px', borderRadius: '2px',
                  background: i < voiceStep ? uiTokens.brand : i === voiceStep ? '#22d3ee' : '#e5e7eb',
                }} />
              ))}
              <span style={{ fontSize: '12px', color: uiTokens.textMuted, marginLeft: '8px', whiteSpace: 'nowrap' }}>{voiceStep + 1}/{VOICE_STEPS.length}</span>
            </div>

            {/* Current step */}
            <Card style={{ padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: uiTokens.textMuted, marginBottom: '8px', letterSpacing: '0.5px' }}>
                {VOICE_STEPS[voiceStep].label}{VOICE_STEPS[voiceStep].required ? ' *' : ' (optional)'}
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: uiTokens.textPrimary, marginBottom: '24px' }}>
                {VOICE_STEPS[voiceStep].prompt}
              </div>

              {/* Transcript display */}
              <div style={{
                minHeight: '60px', padding: '16px', borderRadius: '12px', marginBottom: '20px',
                background: isListening ? '#f0fdfa' : '#f8fafc',
                border: `2px solid ${isListening ? uiTokens.brand : '#e5e7eb'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}>
                {editingField === VOICE_STEPS[voiceStep].field ? (
                  <input
                    type="text"
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    autoFocus
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setEditingField(null); confirmVoiceStep(); } }}
                    style={{
                      width: '100%', padding: '8px', fontSize: '20px', fontWeight: 600,
                      textAlign: 'center', border: 'none', outline: 'none', background: 'transparent',
                    }}
                  />
                ) : (
                  <div
                    onClick={() => { if (transcript) setEditingField(VOICE_STEPS[voiceStep].field); }}
                    style={{
                      fontSize: '20px', fontWeight: 600, cursor: transcript ? 'pointer' : 'default',
                      color: transcript ? uiTokens.textPrimary : uiTokens.textMuted,
                    }}
                  >
                    {transcript || (isListening ? 'Ich höre zu...' : 'Tippe auf das Mikrofon')}
                  </div>
                )}
              </div>
              {transcript && !editingField && (
                <div style={{ fontSize: '12px', color: uiTokens.textMuted, marginBottom: '12px', marginTop: '-12px' }}>
                  Antippen zum Bearbeiten
                </div>
              )}

              {/* Controls */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {!isListening ? (
                  <button
                    onClick={startListening}
                    style={{
                      width: '64px', height: '64px', borderRadius: '50%',
                      background: uiTokens.brand, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 14px rgba(15,107,116,0.3)',
                    }}
                  >
                    <Mic size={28} color="#fff" />
                  </button>
                ) : (
                  <button
                    onClick={stopListening}
                    style={{
                      width: '64px', height: '64px', borderRadius: '50%',
                      background: '#ef4444', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      animation: 'pulse 1.5s infinite',
                    }}
                  >
                    <MicOff size={28} color="#fff" />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '20px' }}>
                {transcript && (
                  <Button variant="primary" onClick={confirmVoiceStep} style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '44px' }}>
                    <Check size={16} /> Übernehmen
                  </Button>
                )}
                <Button variant="ghost" onClick={skipVoiceStep} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <SkipForward size={16} /> Überspringen
                </Button>
              </div>
            </Card>

            {/* Already filled fields */}
            {voiceStep > 0 && (
              <Card style={{ padding: '16px' }}>
                <div style={{ fontSize: '12px', color: uiTokens.textMuted, marginBottom: '8px', fontWeight: 600 }}>BEREITS ERFASST</div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  {VOICE_STEPS.slice(0, voiceStep).map((step) => {
                    const val = form[step.field as keyof typeof form];
                    if (!val) return null;
                    return (
                      <div key={step.field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', padding: '4px 0' }}>
                        <span style={{ color: uiTokens.textSecondary }}>{step.label}</span>
                        <span style={{ fontWeight: 600, color: uiTokens.textPrimary }}>{String(val)}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <Button variant="ghost" onClick={() => { setMode('choose'); setVoiceStep(0); }}>Abbrechen</Button>
              <Button variant="ghost" onClick={() => setMode('manual')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Zum Formular <ChevronRight size={14} />
              </Button>
            </div>

            <style>{`
              @keyframes pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                50% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
              }
            `}</style>
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
