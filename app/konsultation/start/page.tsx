'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { ANAMNESIS_TEMPLATE_META, TEMPLATE_KEYS } from '../../../lib/liveAnamnesis';
import { uiTokens, Card } from '../../../components/ui/System';

const CHIEF_COMPLAINT_OPTIONS = TEMPLATE_KEYS.map((key) => ({
  value: key,
  label: ANAMNESIS_TEMPLATE_META[key].label,
}));

type Patient = {
  id: string;
  name: string;
  tierart: string | null;
  rasse: string | null;
  alter: string | null;
  geschlecht: string | null;
  external_id: string | null;
  owner_name: string | null;
};

export default function StartKonsultation() {

  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'normal' | 'live-anamnesis'>('normal');
  const [chiefComplaint, setChiefComplaint] = useState('allgemein');
  const [titleError, setTitleError] = useState<string | null>(null);
  const showNoLastConsultationNotice = searchParams.get('notice') === 'no-last-consultation';

  // Patient selection
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [practiceId, setPracticeId] = useState<string | null>(null);

  // Titel (Pflicht)
  const [caseTitle, setCaseTitle] = useState("");

  // Load patients + practice_id on mount
  useEffect(() => {
    const load = async () => {
      const [patientsRes, membershipRes] = await Promise.all([
        supabase.from('patients').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('practice_memberships').select('practice_id, role, created_at').order('created_at', { ascending: true }),
      ]);
      if (patientsRes.data) setPatients(patientsRes.data as Patient[]);

      const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
      const best = ((membershipRes.data || []) as { practice_id: string | null; role: string | null; created_at: string | null }[]).sort((a, b) => {
        const ra = rank[a.role || ''] ?? 99;
        const rb = rank[b.role || ''] ?? 99;
        return ra !== rb ? ra - rb : String(a.created_at || '').localeCompare(String(b.created_at || ''));
      })[0];
      if (best?.practice_id) setPracticeId(best.practice_id);
    };
    load();
  }, []);

  const filteredPatients = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    if (!term) return patients.slice(0, 20);
    return patients.filter((p) => [p.name, p.external_id || '', p.owner_name || ''].join(' ').toLowerCase().includes(term)).slice(0, 20);
  }, [patients, patientSearch]);

  const selectedPatient = useMemo(() => patients.find((p) => p.id === selectedPatientId) || null, [patients, selectedPatientId]);

  // 🚀 CASE ERSTELLEN
  const createCase = async () => {
    const normalizedTitle = caseTitle.trim();
    if (!normalizedTitle) {
      setTitleError('Bitte gib einen Titel ein. Ohne Titel kann keine Konsultation gestartet werden.');
      return;
    }

    setTitleError(null);
    setLoading(true);
    try {
      const insertPayload: Record<string, unknown> = {
        title: normalizedTitle,
        status: 'draft',
      };
      if (selectedPatientId) {
        insertPayload.patient_id = selectedPatientId;
        if (selectedPatient) {
          insertPayload.patient_name = selectedPatient.name;
          insertPayload.species = selectedPatient.tierart;
          insertPayload.breed = selectedPatient.rasse;
          insertPayload.age = selectedPatient.alter;
          insertPayload.geschlecht = selectedPatient.geschlecht;
        }
      }
      if (practiceId) insertPayload.practice_id = practiceId;

      const { data, error } = await supabase
        .from("cases")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      localStorage.setItem("current_case_id", data.id);
      localStorage.setItem("last_consultation_case_id", data.id);
      if (mode === 'live-anamnesis') {
        router.push(`/konsultation/${data.id}/live?complaint=${encodeURIComponent(chiefComplaint)}`);
      } else {
        router.push(`/konsultation/${data.id}/record`);
      }
    } catch (err) {
      console.error(err);
      alert("Fehler beim Erstellen");
    }
    setLoading(false);
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: uiTokens.pageBackground,
      padding: uiTokens.pagePadding,
    }}>

      <Card style={{
        maxWidth: "700px",
        margin: "0 auto",
      }}>


        <h1 style={{ color: uiTokens.brand, marginBottom: "25px" }}>
          Neue Aufnahme / Dokumentation
        </h1>

        {showNoLastConsultationNotice ? (
          <div
            style={{
              marginBottom: 12,
              border: '1px solid #fecaca',
              background: '#fff1f2',
              color: '#881337',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
            }}
          >
            Es gibt noch keine letzte Konsultation. Bitte starte zuerst eine neue Konsultation.
          </div>
        ) : null}

        {/* Titel (Pflichtfeld) */}
        <input
          placeholder="Titel Pflichtfeld (z.B. Tiername - Konsultation, Meeting, SOP...)"
          value={caseTitle}
          onChange={e => {
            setCaseTitle(e.target.value);
            if (titleError && e.target.value.trim()) {
              setTitleError(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) {
              e.preventDefault();
              createCase();
            }
          }}
          aria-invalid={Boolean(titleError)}
          style={inputStyle}
        />

        {titleError ? (
          <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>
            {titleError}
          </div>
        ) : null}

        {/* Patient (optional) */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ marginBottom: 6, fontSize: 14, color: '#6b7280' }}>Patient (optional)</div>
          {selectedPatient ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: uiTokens.radiusCard, border: `1px solid ${uiTokens.brand}`, background: '#ecf8f9',
            }}>
              <span style={{ fontSize: 14, color: '#0f172a' }}>
                {selectedPatient.name}
                {selectedPatient.external_id ? ` (#${selectedPatient.external_id})` : ''}
                {selectedPatient.tierart ? ` · ${selectedPatient.tierart}` : ''}
                {selectedPatient.rasse ? ` · ${selectedPatient.rasse}` : ''}
              </span>
              <button
                type="button"
                onClick={() => { setSelectedPatientId(null); setPatientSearch(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 16 }}
              >✕</button>
            </div>
          ) : (
            <>
              <input
                placeholder="Patient suchen (Name oder ID)..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                style={inputStyle}
              />
              {patientSearch.trim() && filteredPatients.length > 0 && (
                <div style={{
                  border: '1px solid #E5E7EB', borderRadius: 10, maxHeight: 180, overflowY: 'auto',
                  background: '#fff', marginTop: -8, marginBottom: 8,
                }}>
                  {filteredPatients.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => { setSelectedPatientId(p.id); setPatientSearch(''); }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f0fdfa'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                    >
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      {p.external_id ? <span style={{ color: '#6b7280' }}> #{p.external_id}</span> : null}
                      {p.tierart ? <span style={{ color: '#6b7280' }}> · {p.tierart}</span> : null}
                      {p.rasse ? <span style={{ color: '#6b7280' }}> · {p.rasse}</span> : null}
                      {p.owner_name ? <span style={{ color: '#6b7280' }}> · {p.owner_name}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 18 }}>
          <b>Hinweis:</b> Weitere strukturierte Daten (z.B. Zusatzinfos, Vorlage) können nach der Aufnahme ergänzt werden.
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ marginBottom: 8, fontSize: 14, color: '#6b7280' }}>Modus</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              type='button'
              onClick={() => setMode('normal')}
              style={{
                ...modeButtonStyle,
                border: mode === 'normal' ? `2px solid ${uiTokens.brand}` : uiTokens.cardBorder,
                background: mode === 'normal' ? '#ecf8f9' : '#fff'
              }}
            >
              Normale Konsultation
            </button>
            <button
              type='button'
              onClick={() => setMode('live-anamnesis')}
              style={{
                ...modeButtonStyle,
                border: mode === 'live-anamnesis' ? `2px solid ${uiTokens.brand}` : uiTokens.cardBorder,
                background: mode === 'live-anamnesis' ? '#ecf8f9' : '#fff'
              }}
            >
              Anamnese Assistent (Live)
            </button>
          </div>
        </div>

        {mode === 'live-anamnesis' ? (
          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 8, fontSize: 14, color: '#6b7280' }}>
              Vorstellungsgrund (optional, beeinflusst Fragevorschlaege)
            </div>
            <select
              value={chiefComplaint}
              onChange={(event) => setChiefComplaint(event.target.value)}
              style={inputStyle}
            >
              {CHIEF_COMPLAINT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button
          onClick={createCase}
          disabled={loading}
          style={{
            width: "100%",
            marginTop: "20px",
            padding: "16px",
            borderRadius: uiTokens.radiusCard,
            background: uiTokens.brand,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "16px"
          }}
        >
          {loading ? "Erstelle..." : "➡️ Zur Aufnahme"}
        </button>

      </Card>
    </main>
  );
}

// 🔧 Styles
const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "12px",
  borderRadius: "16px",
  border: "1px solid #e5e7eb"
};

const modeButtonStyle = {
  width: '100%',
  borderRadius: '16px',
  padding: '12px',
  textAlign: 'left' as const,
  cursor: 'pointer',
  color: '#1f2937'
};