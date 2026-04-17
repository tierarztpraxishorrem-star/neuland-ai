/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { uiTokens, Card, Button, Input, Section } from '../../../components/ui/System';
import { showToast } from '../../../lib/toast';
import { ArrowLeft, Search, UserPlus, Mic, MicOff, Check, ChevronRight, Loader } from 'lucide-react';

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

const FORM_FIELDS = [
  { key: 'patient_name', label: 'Patient' },
  { key: 'species', label: 'Tierart' },
  { key: 'breed', label: 'Rasse' },
  { key: 'gender', label: 'Geschlecht' },
  { key: 'weight_kg', label: 'Gewicht' },
  { key: 'owner_name', label: 'Besitzer' },
  { key: 'box_number', label: 'Box' },
  { key: 'diagnosis', label: 'Diagnose' },
  { key: 'responsible_vet', label: 'Tierarzt' },
  { key: 'responsible_tfa', label: 'TFA' },
  { key: 'cave_details', label: 'CAVE' },
  { key: 'iv_catheter_location', label: 'Braunüle' },
];

export default function NewStationPatientPage() {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'choose' | 'search' | 'manual' | 'voice'>('choose');

  // Prefill von /patienten/[id] — ?prefill=1&patient_id=...&name=...&species=...
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('prefill') !== '1') return;
    setForm(prev => ({
      ...prev,
      patient_id: params.get('patient_id') || '',
      patient_name: params.get('name') || '',
      species: params.get('species') || 'Hund',
      breed: params.get('breed') || '',
      owner_name: params.get('owner') || '',
      gender: params.get('gender') || '',
    }));
    setMode('manual');
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Voice state (Server-Transkription statt Browser-SpeechRecognition)
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsing, setParsing] = useState(false);
  const [lastParsedFields, setLastParsedFields] = useState<string[]>([]);
  const [voiceMeds, setVoiceMeds] = useState<Array<{ name: string; dose: string; route: string | null; frequency_label: string | null; scheduled_hours: number[]; is_prn: boolean; is_dti: boolean; dti_rate_ml_h: number | null }>>([]);
  const recognitionRef = useRef<any>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (field: string, value: unknown) => setForm(prev => ({ ...prev, [field]: value }));

  // Parse transcript with AI
  const parseTranscript = useCallback(async (text: string) => {
    if (!text.trim() || text.trim().length < 5) return;
    setParsing(true);
    try {
      const res = await fetchWithAuth('/api/station/parse-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.fields) {
        const filled: string[] = [];
        const updates: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(data.fields)) {
          if (val && val !== '' && val !== 'null' && val !== 'unbekannt') {
            updates[key] = val;
            filled.push(key);
            if (key === 'cave_details' && val) updates.cave = true;
            if (key === 'iv_catheter_location' && val) updates.has_iv_catheter = true;
          }
        }
        setForm(prev => ({ ...prev, ...updates }));
        setLastParsedFields(filled);
      }
      if (data.medications && data.medications.length > 0) {
        setVoiceMeds(data.medications);
      }
    } catch { /* ignore */ } finally { setParsing(false); }
  }, []);

  // Auto-parse entfällt: Server-Transkription + Parse passiert in stopListening().

  // Server-basierte Spracherkennung (MediaRecorder → /api/transcribe → parse-voice)
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // 1s chunks
      setIsListening(true);
      setTranscript('');
      setLastParsedFields([]);
      setVoiceMeds([]);
    } catch (err) {
      showToast({ message: 'Mikrofon-Zugriff fehlgeschlagen. Bitte Berechtigung erteilen.', type: 'error' });
    }
  }, []);

  const stopListening = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      setIsListening(false);
      return;
    }

    // Stop recording and wait for final data
    setIsListening(false);
    setIsTranscribing(true);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        recorder.stream?.getTracks().forEach((t) => t.stop());
        resolve();
      };
      recorder.stop();
    });

    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (blob.size < 1000) {
      setIsTranscribing(false);
      showToast({ message: 'Aufnahme zu kurz.', type: 'error' });
      return;
    }

    try {
      // Schritt 1: Audio → Text via Server-Transkription (OpenAI/AssemblyAI)
      const formData = new FormData();
      formData.append('file', blob, 'station-voice.webm');
      const transcribeRes = await fetchWithAuth('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok || !transcribeData.text) {
        throw new Error(transcribeData.error || 'Transkription fehlgeschlagen.');
      }
      const text = transcribeData.text as string;
      setTranscript(text);

      // Schritt 2: Text → strukturierte Daten via parse-voice
      await parseTranscript(text);
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Fehler bei der Spracherkennung.', type: 'error' });
    } finally {
      setIsTranscribing(false);
    }
  }, [parseTranscript]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current);
    };
  }, []);

  const handleSearch = async (q?: string) => {
    const query = (q ?? searchQuery).trim();
    if (!query) return;
    setSearching(true);
    try {
      const res = await fetchWithAuth(`/api/station/search-patients?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok && data.patients) {
        setSearchResults(data.patients as PatientSearchResult[]);
      } else {
        setSearchResults([]);
      }
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

      // Create medications if any were dictated
      if (voiceMeds.length > 0) {
        await Promise.all(voiceMeds.map(med =>
          fetchWithAuth(`/api/station/patients/${data.patient.id}/medications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(med),
          }).catch(() => {})
        ));
      }

      showToast({ message: `Patient aufgenommen${voiceMeds.length > 0 ? ` + ${voiceMeds.length} Medikamente` : ''}!`, type: 'success' });
      fetchWithAuth(`/api/station/patients/${data.patient.id}/ai-check`, { method: 'POST' }).catch(() => {});
      router.push(`/station/${data.patient.id}`);
    } catch { showToast({ message: 'Fehler.', type: 'error' }); } finally { setSubmitting(false); }
  };

  const filledCount = FORM_FIELDS.filter(f => {
    const v = form[f.key as keyof typeof form];
    return v && v !== '' && v !== 'Hund' && v !== 'männlich';
  }).length;

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
                  <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>Einfach drauf los sprechen – KI füllt das Formular automatisch</div>
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

        {/* Voice continuous input */}
        {mode === 'voice' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            {/* Recording area */}
            <Card style={{ padding: '24px' }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '15px', color: uiTokens.textSecondary, marginBottom: '16px' }}>
                  {isTranscribing
                    ? '⏳ Wird transkribiert (Server-Erkennung mit med. Fachbegriffe-Boost)...'
                    : isListening
                      ? '🔴 Aufnahme läuft – sprich frei, z.B. "Hund Bello, Labrador, Tierarzt Dr. Meier, 32 Kilo, Metamizol 50mg/kg 3x täglich i.v., Diagnose Durchfall..."'
                      : 'Tippe auf das Mikrofon und beschreibe den Patienten inkl. Medikamente'}
                </div>

                <button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isTranscribing || parsing}
                  style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: isTranscribing ? '#eab308' : isListening ? '#ef4444' : uiTokens.brand,
                    border: 'none', cursor: isTranscribing ? 'wait' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isListening ? '0 0 0 8px rgba(239,68,68,0.15)' : isTranscribing ? '0 0 0 8px rgba(234,179,8,0.15)' : '0 4px 14px rgba(15,107,116,0.3)',
                    transition: 'all 0.2s',
                    animation: isListening ? 'pulse 1.5s infinite' : isTranscribing ? 'pulse 2s infinite' : 'none',
                    opacity: (isTranscribing || parsing) ? 0.7 : 1,
                  }}
                >
                  {isTranscribing ? <Loader size={32} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : isListening ? <MicOff size={32} color="#fff" /> : <Mic size={32} color="#fff" />}
                </button>
              </div>

              {/* Live transcript */}
              {transcript && (
                <div style={{
                  padding: '16px', borderRadius: '12px', marginTop: '16px',
                  background: isListening ? '#f0fdfa' : '#f8fafc',
                  border: `1px solid ${isListening ? '#99f6e4' : '#e5e7eb'}`,
                }}>
                  <div style={{ fontSize: '12px', color: uiTokens.textMuted, marginBottom: '6px', fontWeight: 600 }}>TRANSKRIPT</div>
                  <div style={{ fontSize: '15px', color: uiTokens.textPrimary, lineHeight: 1.5 }}>{transcript}</div>
                </div>
              )}

              {parsing && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px', color: uiTokens.brand, fontSize: '13px' }}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Erkenne Felder...
                </div>
              )}
            </Card>

            {/* Live form preview */}
            <Card style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: uiTokens.textMuted, marginBottom: '10px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                <span>ERKANNTE DATEN</span>
                <span>{filledCount}/{FORM_FIELDS.length} Felder</span>
              </div>
              <div style={{ display: 'grid', gap: '4px' }}>
                {FORM_FIELDS.map(f => {
                  const val = form[f.key as keyof typeof form];
                  const isFilled = val && val !== '' && val !== 'Hund' && val !== 'männlich';
                  const justParsed = lastParsedFields.includes(f.key);
                  return (
                    <div key={f.key} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 10px', borderRadius: '8px', fontSize: '14px',
                      background: justParsed ? '#f0fdf4' : isFilled ? '#fafafa' : 'transparent',
                      transition: 'background 0.5s',
                    }}>
                      <span style={{ color: isFilled ? uiTokens.textPrimary : uiTokens.textMuted }}>{f.label}</span>
                      {isFilled ? (
                        <input
                          value={String(val)}
                          onChange={(e) => set(f.key, e.target.value)}
                          style={{
                            textAlign: 'right', fontWeight: 600, color: justParsed ? '#16a34a' : uiTokens.textPrimary,
                            border: 'none', background: 'transparent', outline: 'none', fontSize: '14px',
                            maxWidth: '60%',
                          }}
                        />
                      ) : (
                        <span style={{ color: '#d1d5db', fontSize: '13px' }}>–</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Medications preview */}
            {voiceMeds.length > 0 && (
              <Card style={{ padding: '16px' }}>
                <div style={{ fontSize: '12px', color: uiTokens.textMuted, marginBottom: '10px', fontWeight: 600 }}>
                  ERKANNTE MEDIKAMENTE ({voiceMeds.length})
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {voiceMeds.map((med, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', borderRadius: '8px', background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: uiTokens.textPrimary }}>{med.name}</div>
                        <div style={{ fontSize: '12px', color: uiTokens.textSecondary }}>
                          {med.dose}{med.route ? ` ${med.route}` : ''}{med.frequency_label ? ` · ${med.frequency_label}` : ''}{med.is_dti ? ` · DTI ${med.dti_rate_ml_h} ml/h` : ''}{med.is_prn ? ' · bei Bedarf' : ''}
                        </div>
                      </div>
                      <button onClick={() => setVoiceMeds(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '16px', padding: '4px' }}>×</button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <Button variant="ghost" onClick={() => { recognitionRef.current?.stop(); setMode('choose'); }}>Abbrechen</Button>
              <div style={{ display: 'flex', gap: '8px' }}>
                {transcript && !parsing && (
                  <Button variant="ghost" onClick={() => parseTranscript(transcript)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={14} /> Nochmal auswerten
                  </Button>
                )}
                <Button variant="primary" onClick={() => { recognitionRef.current?.stop(); setMode('manual'); }} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Prüfen & Aufnehmen <ChevronRight size={14} />
                </Button>
              </div>
            </div>

            <style>{`
              @keyframes pulse {
                0%, 100% { box-shadow: 0 0 0 8px rgba(239,68,68,0.15); }
                50% { box-shadow: 0 0 0 16px rgba(239,68,68,0); }
              }
              @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
          </div>
        )}

        {mode === 'search' && (
          <Card style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // Live-Suche: automatisch suchen ab 1 Zeichen (300ms Debounce)
                  const q = e.target.value.trim();
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                  if (q.length >= 1) {
                    searchDebounceRef.current = setTimeout(() => handleSearch(q), 300);
                  } else {
                    setSearchResults([]);
                  }
                }}
                placeholder="Patientenname eingeben — Ergebnisse erscheinen sofort..."
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                fullWidth
                autoFocus
              />
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
