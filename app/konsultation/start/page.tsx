'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { ANAMNESIS_TEMPLATE_META, TEMPLATE_KEYS } from '../../../lib/liveAnamnesis';

const CHIEF_COMPLAINT_OPTIONS = TEMPLATE_KEYS.map((key) => ({
  value: key,
  label: ANAMNESIS_TEMPLATE_META[key].label,
}));

export default function StartKonsultation() {

  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'normal' | 'live-anamnesis'>('normal');
  const [chiefComplaint, setChiefComplaint] = useState('allgemein');
  const [titleError, setTitleError] = useState<string | null>(null);
  const showNoLastConsultationNotice = searchParams.get('notice') === 'no-last-consultation';


  // Titel (Pflicht)
  const [caseTitle, setCaseTitle] = useState("");

  const brand = {
    primary: '#0F6B74',
    border: '#E5E7EB',
    text: '#1F2937',
    bg: '#F4F7F8',
    card: '#FFFFFF'
  };

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
      const { data, error } = await supabase
        .from("cases")
        .insert({
          title: normalizedTitle,
          status: "draft"
        })
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
      background: brand.bg,
      padding: "40px",
      fontFamily: "Arial"
    }}>

      <div style={{
        maxWidth: "700px",
        margin: "0 auto",
        background: brand.card,
        padding: "30px",
        borderRadius: "16px",
        border: `1px solid ${brand.border}`
      }}>


        <h1 style={{ color: brand.primary, marginBottom: "25px" }}>
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

        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 18 }}>
          <b>Hinweis:</b> Weitere strukturierte Daten (z.B. Patient, Zusatzinfos) werden erst nach Auswahl der Vorlage abgefragt.
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ marginBottom: 8, fontSize: 14, color: '#6b7280' }}>Modus</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              type='button'
              onClick={() => setMode('normal')}
              style={{
                ...modeButtonStyle,
                border: mode === 'normal' ? '2px solid #0F6B74' : '1px solid #E5E7EB',
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
                border: mode === 'live-anamnesis' ? '2px solid #0F6B74' : '1px solid #E5E7EB',
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
            borderRadius: "14px",
            background: brand.primary,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "16px"
          }}
        >
          {loading ? "Erstelle..." : "➡️ Zur Aufnahme"}
        </button>

      </div>
    </main>
  );
}

// 🔧 Styles
const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "12px",
  borderRadius: "10px",
  border: "1px solid #E5E7EB"
};

const modeButtonStyle = {
  width: '100%',
  borderRadius: '10px',
  padding: '12px',
  textAlign: 'left' as const,
  cursor: 'pointer',
  color: '#0f172a'
};