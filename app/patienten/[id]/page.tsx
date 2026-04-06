'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

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

type Consultation = {
  id: string;
  title: string | null;
  result: string | null;
  transcript: string | null;
  created_at: string;
};

type PatientDocument = {
  id: string;
  name: string;
  uploadedAt: string;
  text: string;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const buildPreview = (entry: Consultation) => {
  const source = entry.result || entry.transcript || '';
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .slice(0, 220);
};

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${mins}:${secs} min`;
};

const getConsultationDuration = (caseId: string) => {
  try {
    const autosaveSession = localStorage.getItem(`case_${caseId}_autosave_recording_session`);
    if (autosaveSession) {
      const parsed = JSON.parse(autosaveSession);
      if (typeof parsed?.duration_seconds === 'number') {
        return Math.max(0, Math.floor(parsed.duration_seconds));
      }
    }

    const context = localStorage.getItem(`case_context_${caseId}`);
    if (context) {
      const parsed = JSON.parse(context);
      if (typeof parsed?.recordingSession?.duration_seconds === 'number') {
        return Math.max(0, Math.floor(parsed.recordingSession.duration_seconds));
      }
    }
  } catch {
    return 0;
  }

  return 0;
};

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = String(params.id || '');

  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [consultationDurations, setConsultationDurations] = useState<Record<string, number>>({});
  const [savingPatient, setSavingPatient] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<PatientDocument | null>(null);
  const [historySummary, setHistorySummary] = useState('');
  const [loading, setLoading] = useState(true);

  const docsStorageKey = `patient_documents_${patientId}`;

  const [editForm, setEditForm] = useState({
    name: '',
    tierart: '',
    rasse: '',
    alter: '',
    geschlecht: '',
    external_id: '',
    owner_name: ''
  });

  useEffect(() => {
    const loadData = async () => {
      if (!patientId) return;

      setLoading(true);
      const [patientRes, consultationsRes] = await Promise.all([
        supabase.from('patients').select('*').eq('id', patientId).maybeSingle(),
        supabase
          .from('cases')
          .select('id, title, result, transcript, created_at')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(300)
      ]);

      if (patientRes.error) {
        console.error(patientRes.error);
      } else {
        const loaded = (patientRes.data || null) as Patient | null;
        setPatient(loaded);
        if (loaded) {
          setEditForm({
            name: loaded.name || '',
            tierart: loaded.tierart || '',
            rasse: loaded.rasse || '',
            alter: loaded.alter || '',
            geschlecht: loaded.geschlecht || '',
            external_id: loaded.external_id || '',
            owner_name: loaded.owner_name || ''
          });
        }
      }

      if (consultationsRes.error) {
        console.error(consultationsRes.error);
      } else {
        setConsultations((consultationsRes.data || []) as Consultation[]);
      }

      setLoading(false);
    };

    loadData();
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    const stored = localStorage.getItem(docsStorageKey);
    if (!stored) {
      setDocuments([]);
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      setDocuments(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDocuments([]);
    }
  }, [docsStorageKey, patientId]);

  useEffect(() => {
    const next: Record<string, number> = {};
    consultations.forEach((entry) => {
      next[entry.id] = getConsultationDuration(entry.id);
    });
    setConsultationDurations(next);
  }, [consultations]);

  const patientTitle = useMemo(() => {
    if (!patient) return 'Patient';
    return patient.external_id ? `${patient.name} (#${patient.external_id})` : patient.name;
  }, [patient]);

  const detailLine = [patient?.tierart, patient?.rasse, patient?.alter, patient?.geschlecht]
    .filter(Boolean)
    .join(' · ');

  const saveDocuments = (next: PatientDocument[]) => {
    setDocuments(next);
    localStorage.setItem(docsStorageKey, JSON.stringify(next));
  };

  const handleUploadDocument = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/analyze-image', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      const extractedText = (data?.result || data?.text || '').trim();

      const doc: PatientDocument = {
        id: `${Date.now()}`,
        name: file.name,
        uploadedAt: new Date().toISOString(),
        text: extractedText || 'Kein extrahierter Text gefunden.'
      };

      saveDocuments([doc, ...documents]);
    } catch (err) {
      console.error(err);
      alert('Datei konnte nicht verarbeitet werden.');
    } finally {
      setUploading(false);
    }
  };

  const openInVetMindWithContext = () => {
    const latestConsultations = consultations.slice(0, 3).map((entry) => ({
      title: entry.title || 'Konsultation',
      created_at: entry.created_at,
      preview: buildPreview(entry)
    }));

    const docsSnippet = documents
      .slice(0, 3)
      .map((doc) => `Dokument: ${doc.name}\n${doc.text.slice(0, 300)}`)
      .join('\n\n');

    const payload = {
      source: 'patient-workspace',
      patientName: patient?.name || '',
      external_id: patient?.external_id || '',
      tierart: patient?.tierart || '',
      rasse: patient?.rasse || '',
      alter: patient?.alter || '',
      geschlecht: patient?.geschlecht || '',
      additionalInfo: [
        latestConsultations.length > 0
          ? `VERLAUF:\n${latestConsultations
              .map((item) => `${item.title} (${formatDateTime(item.created_at)}): ${item.preview}`)
              .join('\n')}`
          : '',
        docsSnippet ? `DOKUMENTE:\n${docsSnippet}` : ''
      ]
        .filter(Boolean)
        .join('\n\n'),
      result: historySummary || '',
      title: `${patient?.name || 'Patient'} - Kontext`
    };

    localStorage.setItem('vetmind_context', JSON.stringify(payload));
    localStorage.setItem('activeCase', JSON.stringify(payload));
    router.push('/vetmind');
  };

  const summarizeDocuments = async () => {
    if (documents.length === 0) {
      alert('Bitte zuerst Dokumente hochladen.');
      return;
    }

    setSummarizing(true);
    try {
      const content = documents
        .slice(0, 8)
        .map((doc) => `Dokument: ${doc.name}\n${doc.text}`)
        .join('\n\n');

      const prompt = `Fasse die folgenden tiermedizinischen Vorberichte/Laborbefunde kompakt zusammen.\n\nWichtige Punkte:\n- Relevante Diagnosen\n- Befunde\n- Therapie/Hinweise\n- Offene Fragen\n\nINHALT:\n${content}`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          context: 'Patientenhistorie-Zusammenfassung'
        })
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value);
      }

      setHistorySummary(fullText.trim());
    } catch (err) {
      console.error(err);
      alert('Zusammenfassung fehlgeschlagen.');
    } finally {
      setSummarizing(false);
    }
  };

  const savePatientDetails = async () => {
    if (!patientId || !editForm.name.trim()) {
      alert('Name ist erforderlich.');
      return;
    }

    setSavingPatient(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        tierart: editForm.tierart || null,
        rasse: editForm.rasse || null,
        alter: editForm.alter || null,
        geschlecht: editForm.geschlecht || null,
        external_id: editForm.external_id || null,
        owner_name: editForm.owner_name || null
      };

      const { data, error } = await supabase
        .from('patients')
        .update(payload)
        .eq('id', patientId)
        .select('*')
        .single();

      if (error) throw error;

      setPatient(data as Patient);
    } catch (err) {
      console.error(err);
      alert('Patientendetails konnten nicht gespeichert werden.');
    } finally {
      setSavingPatient(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f4f7f8',
        padding: '40px',
        fontFamily: 'Arial'
      }}
    >
      <button
        onClick={() => router.push('/patienten')}
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          background: '#fff',
          padding: '8px 12px',
          cursor: 'pointer',
          marginBottom: '16px'
        }}
      >
        ← Zur Patientenliste
      </button>

      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '14px',
          padding: '20px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h1 style={{ marginTop: 0, marginBottom: '8px', color: '#0F6B74' }}>{patientTitle}</h1>
          <div style={{ color: '#334155', fontSize: '14px' }}>
            {detailLine || 'Tierart · Rasse · Alter · Geschlecht fehlen'}
          </div>
          {patient?.external_id && <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>#{patient.external_id}</div>}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <button
            onClick={() => router.push('/konsultation/start')}
            style={{
              border: '1px solid #e5e7eb',
              background: '#fff',
              borderRadius: '10px',
              padding: '10px 12px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            + Neue Konsultation
          </button>

          <button
            onClick={openInVetMindWithContext}
            style={{
              border: 'none',
              background: '#0F6B74',
              color: '#fff',
              borderRadius: '10px',
              padding: '10px 12px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            In VetMind öffnen
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(280px, 3fr)', gap: '16px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <section
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '14px',
              padding: '20px'
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '12px' }}>Konsultationsverlauf</h2>

            {loading && <div style={{ color: '#64748b' }}>Lade ...</div>}

            {!loading && consultations.length === 0 && (
              <div style={{ color: '#64748b' }}>Noch keine verknuepften Konsultationen.</div>
            )}

            <div style={{ display: 'grid', gap: '12px' }}>
              {consultations.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    background: '#fff',
                    padding: '14px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{entry.title || 'Konsultation'}</div>
                      <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
                        {formatDateTime(entry.created_at)} · Dauer: {formatDuration(consultationDurations[entry.id] || 0)}
                      </div>
                    </div>

                    <button
                      onClick={() => router.push(`/konsultation/${entry.id}/result`)}
                      style={{
                        border: '1px solid #e5e7eb',
                        background: '#fff',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Öffnen
                    </button>
                  </div>
                  <div style={{ color: '#334155', fontSize: '13px', marginTop: '8px' }}>{buildPreview(entry) || 'Keine Vorschau'}</div>
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '14px',
              padding: '20px'
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '12px' }}>Patientenhistorie</h2>

            <div
              style={{
                border: '1px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '12px',
                background: '#f8fafc'
              }}
            >
              <div style={{ color: '#334155', marginBottom: '10px' }}>
                Dokumente, Laborbefunde oder Vorberichte hinzufügen
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <label
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    background: '#fff',
                    padding: '8px 12px',
                    cursor: uploading ? 'wait' : 'pointer',
                    fontWeight: 600,
                    fontSize: '14px'
                  }}
                >
                  📤 Datei hochladen
                  <input
                    type='file'
                    hidden
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      await handleUploadDocument(file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>

                <button
                  onClick={summarizeDocuments}
                  disabled={summarizing || documents.length === 0}
                  style={{
                    border: 'none',
                    borderRadius: '8px',
                    background: '#0F6B74',
                    color: '#fff',
                    padding: '8px 12px',
                    cursor: summarizing || documents.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: summarizing || documents.length === 0 ? 0.7 : 1,
                    fontWeight: 600,
                    fontSize: '14px'
                  }}
                >
                  {summarizing ? 'Zusammenfassung ...' : '🧠 Zusammenfassen'}
                </button>

                <button
                  onClick={openInVetMindWithContext}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    background: '#fff',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '14px'
                  }}
                >
                  🧠 Mit Kontext arbeiten
                </button>
              </div>
            </div>

            {documents.length === 0 && (
              <div style={{ color: '#64748b', marginBottom: '8px' }}>
                Füge Vorberichte oder Laborwerte hinzu, um die KI kontextreicher zu machen
              </div>
            )}

            {historySummary && (
              <div
                style={{
                  border: '1px solid #d1fae5',
                  background: '#ecfeff',
                  color: '#134e4a',
                  borderRadius: '10px',
                  padding: '10px',
                  marginBottom: '10px',
                  whiteSpace: 'pre-wrap',
                  fontSize: '13px'
                }}
              >
                {historySummary}
              </div>
            )}

            <div style={{ display: 'grid', gap: '10px' }}>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '10px',
                    background: '#fff'
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{doc.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {formatDateTime(doc.uploadedAt)}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setSelectedDocument(doc)}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        background: '#fff',
                        padding: '6px 8px',
                        cursor: 'pointer'
                      }}
                    >
                      Öffnen
                    </button>

                    <button
                      onClick={() => {
                        const payload = {
                          source: 'patient-document',
                          title: `${patient?.name || 'Patient'} - Dokument`,
                          patientName: patient?.name || '',
                          external_id: patient?.external_id || '',
                          tierart: patient?.tierart || '',
                          rasse: patient?.rasse || '',
                          alter: patient?.alter || '',
                          geschlecht: patient?.geschlecht || '',
                          additionalInfo: `DOKUMENT: ${doc.name}\n\n${doc.text}`
                        };
                        localStorage.setItem('vetmind_context', JSON.stringify(payload));
                        localStorage.setItem('activeCase', JSON.stringify(payload));
                        router.push('/vetmind');
                      }}
                      style={{
                        border: 'none',
                        borderRadius: '8px',
                        background: '#0F6B74',
                        color: '#fff',
                        padding: '6px 8px',
                        cursor: 'pointer'
                      }}
                    >
                      In KI verwenden
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside style={{ display: 'grid', gap: '16px', position: 'sticky', top: '16px' }}>
          <section
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '14px',
              padding: '14px'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '10px' }}>Patientendetails</h3>

            <div style={{ display: 'grid', gap: '8px' }}>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder='Name *'
                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <select
                value={editForm.tierart}
                onChange={(e) => setEditForm((prev) => ({ ...prev, tierart: e.target.value }))}
                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              >
                <option value=''>Tierart</option>
                <option value='Hund'>Hund</option>
                <option value='Katze'>Katze</option>
                <option value='Heimtier'>Heimtier</option>
              </select>
              <input
                value={editForm.rasse}
                onChange={(e) => setEditForm((prev) => ({ ...prev, rasse: e.target.value }))}
                placeholder='Rasse'
                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <input
                value={editForm.alter}
                onChange={(e) => setEditForm((prev) => ({ ...prev, alter: e.target.value }))}
                placeholder='Alter'
                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <select
                value={editForm.geschlecht}
                onChange={(e) => setEditForm((prev) => ({ ...prev, geschlecht: e.target.value }))}
                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              >
                <option value=''>Geschlecht</option>
                <option value='m'>m</option>
                <option value='w'>w</option>
                <option value='mk'>mk</option>
                <option value='wk'>wk</option>
              </select>
              <input
                value={editForm.external_id}
                onChange={(e) => setEditForm((prev) => ({ ...prev, external_id: e.target.value }))}
                placeholder='PMS-ID'
                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <input
                value={editForm.owner_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                placeholder='Besitzer'
                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
            </div>

            <button
              onClick={savePatientDetails}
              disabled={savingPatient}
              style={{
                marginTop: '10px',
                border: 'none',
                borderRadius: '8px',
                background: '#0F6B74',
                color: '#fff',
                padding: '8px 10px',
                cursor: savingPatient ? 'wait' : 'pointer',
                fontWeight: 600,
                width: '100%'
              }}
            >
              {savingPatient ? 'Speichert ...' : 'Details speichern'}
            </button>
          </section>

          <section
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '14px',
              padding: '14px'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '8px' }}>📚 Kontext verfügbar</h3>
            <div style={{ color: '#334155', fontSize: '14px', lineHeight: 1.6 }}>
              <div>- {consultations.length} Konsultationen</div>
              <div>- {documents.length} Dokumente</div>
            </div>

            <button
              onClick={openInVetMindWithContext}
              style={{
                marginTop: '10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                background: '#fff',
                padding: '8px 10px',
                cursor: 'pointer',
                width: '100%',
                fontWeight: 600
              }}
            >
              🧠 Mit Kontext arbeiten
            </button>
          </section>
        </aside>
      </div>

      {selectedDocument && (
        <div
          onClick={() => setSelectedDocument(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, calc(100vw - 24px))',
              maxHeight: '78vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: '14px',
              border: '1px solid #e5e7eb',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>{selectedDocument.name}</h3>
              <button
                onClick={() => setSelectedDocument(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '10px' }}>{formatDateTime(selectedDocument.uploadedAt)}</div>
            <div style={{ whiteSpace: 'pre-wrap', color: '#1f2937', fontSize: '14px', lineHeight: 1.5 }}>
              {selectedDocument.text || 'Kein Inhalt verfügbar.'}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
