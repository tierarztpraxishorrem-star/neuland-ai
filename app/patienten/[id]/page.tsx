'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { Badge, Button, Card, EmptyState, Input, ListItem, Section, SelectInput, uiTokens } from '../../../components/ui/System';

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
  fileType: 'pdf' | 'image' | 'lab' | 'other';
  mimeType: string;
};

const getDocumentType = (fileName: string, mimeType?: string): PatientDocument['fileType'] => {
  const lowerName = fileName.toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) return 'pdf';
  if (lowerMime.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/.test(lowerName)) return 'image';
  if (/(labor|lab|blut|cbc|chem)/.test(lowerName)) return 'lab';
  return 'other';
};

const getDocumentTypeLabel = (type: PatientDocument['fileType']) => {
  if (type === 'pdf') return 'PDF';
  if (type === 'image') return 'Bild';
  if (type === 'lab') return 'Labor';
  return 'Dokument';
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
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [uploadAccept, setUploadAccept] = useState('');

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
      if (!Array.isArray(parsed)) {
        setDocuments([]);
        return;
      }

      const normalized = parsed.map((doc: Partial<PatientDocument>) => ({
        id: String(doc.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        name: String(doc.name || 'Dokument'),
        uploadedAt: String(doc.uploadedAt || new Date().toISOString()),
        text: String(doc.text || ''),
        mimeType: String(doc.mimeType || ''),
        fileType: (doc.fileType as PatientDocument['fileType']) || getDocumentType(String(doc.name || ''), String(doc.mimeType || ''))
      }));

      setDocuments(normalized);
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
    return patient.name;
  }, [patient]);

  const detailLineWithId = [patient?.tierart, patient?.rasse, patient?.alter, patient?.geschlecht, patient?.external_id ? `(#${patient.external_id})` : '']
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
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        uploadedAt: new Date().toISOString(),
        text: extractedText || 'Kein extrahierter Text gefunden.',
        fileType: getDocumentType(file.name, file.type),
        mimeType: file.type || ''
      };

      saveDocuments([doc, ...documents]);
    } catch (err) {
      console.error(err);
      alert('Datei konnte nicht verarbeitet werden.');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    for (const file of files) {
      await handleUploadDocument(file);
    }
  };

  const removeDocument = (id: string) => {
    const next = documents.filter((doc) => doc.id !== id);
    saveDocuments(next);
    if (selectedDocument?.id === id) {
      setSelectedDocument(null);
    }
  };

  const openUploadPicker = (accept = '') => {
    setUploadAccept(accept);
    fileInputRef.current?.click();
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

  const summarizeContext = async () => {
    if (documents.length === 0 && consultations.length === 0) {
      alert('Bitte zuerst Konsultationen oder Dokumente bereitstellen.');
      return;
    }

    setSummarizing(true);
    try {
      const docsContent = documents
        .slice(0, 8)
        .map((doc) => `Dokument: ${doc.name}\n${doc.text}`)
        .join('\n\n');

      const consultationContent = consultations
        .slice(0, 6)
        .map((entry) => `Konsultation: ${entry.title || 'Konsultation'} (${formatDateTime(entry.created_at)})\n${buildPreview(entry)}`)
        .join('\n\n');

      const prompt = `Erstelle eine kurze klinische Verlaufszusammenfassung für einen Tierpatienten.\n\nStruktur:\n1) Wichtigste Diagnosen/Befunde\n2) Relevante Probleme\n3) Letzte Maßnahmen\n4) Offene Fragen/Nächste Schritte\n\nSchreibe kompakt, medizinisch klar und ohne Halluzinationen.\n\nKONSULTATIONEN:\n${consultationContent || 'Keine Konsultationen'}\n\nDOKUMENTE:\n${docsContent || 'Keine Dokumente'}`;

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
      localStorage.setItem(`patient_summary_${patientId}`, fullText.trim());
    } catch (err) {
      console.error(err);
      alert('Zusammenfassung fehlgeschlagen.');
    } finally {
      setSummarizing(false);
    }
  };

  useEffect(() => {
    if (!patientId) return;
    const storedSummary = localStorage.getItem(`patient_summary_${patientId}`);
    if (storedSummary) {
      setHistorySummary(storedSummary);
      return;
    }

    if (consultations.length === 0 && documents.length === 0) {
      setHistorySummary('');
      return;
    }

    const latestConsultation = consultations[0];
    const latestDoc = documents[0];
    const autoSummary = [
      latestConsultation ? `Wichtigster Verlauf: ${latestConsultation.title || 'Konsultation'} (${formatDateTime(latestConsultation.created_at)}).` : '',
      latestConsultation ? `Letzter Befundhinweis: ${buildPreview(latestConsultation) || 'Keine Vorschau verfügbar.'}` : '',
      latestDoc ? `Neueste Unterlage: ${latestDoc.name}.` : '',
      'Empfehlung: Verlauf mit "Neu zusammenfassen" klinisch verdichten.'
    ]
      .filter(Boolean)
      .join('\n');

    setHistorySummary(autoSummary);
  }, [patientId, consultations, documents]);

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
      setIsEditingDetails(false);
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
        background: uiTokens.pageBackground,
        padding: uiTokens.pagePadding,
        fontFamily: 'Arial, sans-serif'
      }}
    >
      <Button
        variant='secondary'
        onClick={() => router.push('/patienten')}
        style={{ marginBottom: '16px' }}
      >
        ← Zur Patientenliste
      </Button>

      <Card
        style={{
          padding: '24px',
          marginBottom: '18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '20px',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h1 style={{ marginTop: 0, marginBottom: '8px', color: uiTokens.brand, fontSize: '34px', lineHeight: 1.1 }}>{patientTitle}</h1>
          <div style={{ color: uiTokens.textPrimary, fontSize: '15px' }}>
            {detailLineWithId || 'Tierart · Rasse · Alter · Geschlecht fehlen'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Button variant='secondary' size='lg' onClick={() => router.push('/konsultation/start')}>
            + Neue Konsultation
          </Button>

          <Button variant='primary' size='lg' onClick={openInVetMindWithContext}>
            In VetMind öffnen
          </Button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(280px, 3fr)', gap: '16px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <Section title='Konsultationen'>

            {loading && <div style={{ color: '#64748b' }}>Lade ...</div>}

            {!loading && consultations.length === 0 && (
              <EmptyState
                text='Noch keine Konsultationen vorhanden.'
                actionLabel='+ Erste Konsultation erstellen'
                onAction={() => router.push('/konsultation/start')}
              />
            )}

            <div style={{ display: 'grid', gap: '12px' }}>
              {consultations.map((entry) => (
                <ListItem
                  key={entry.id}
                  style={{ background: '#fbfdff' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>🧾 {entry.title || 'Konsultation'}</div>
                      <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
                        {formatDateTime(entry.created_at)} · Dauer: {formatDuration(consultationDurations[entry.id] || 0)}
                      </div>
                    </div>

                    <Button
                      variant='secondary'
                      size='sm'
                      onClick={() => router.push(`/konsultation/${entry.id}/result`)}
                    >
                      Öffnen
                    </Button>
                  </div>
                  <div style={{ color: '#334155', fontSize: '13px', marginTop: '8px', lineHeight: 1.45 }}>
                    {buildPreview(entry) || 'Keine Vorschau'}
                  </div>
                </ListItem>
              ))}
            </div>
          </Section>

          <Section
            title='🧠 Letzter Verlauf'
            actions={(
              <Button
                variant='secondary'
                onClick={summarizeContext}
                disabled={summarizing || (documents.length === 0 && consultations.length === 0)}
              >
                {summarizing ? 'Neu zusammenfassen ...' : 'Neu zusammenfassen'}
              </Button>
            )}
          >

            <div
              style={{
                border: '1px solid #dbeafe',
                background: '#f8fbff',
                color: '#1f2937',
                borderRadius: '12px',
                padding: '12px',
                whiteSpace: 'pre-wrap',
                fontSize: '14px',
                lineHeight: 1.55
              }}
            >
              {historySummary || 'Noch keine Zusammenfassung vorhanden. Nutze "Neu zusammenfassen" für einen schnellen klinischen Überblick.'}
            </div>
          </Section>

          <Section title='Dokumente & Patientenhistorie'>

            <div
              onClick={() => !uploading && openUploadPicker('')}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!dragActive) setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                if (uploading) return;
                const files = Array.from(e.dataTransfer.files || []);
                await handleUploadFiles(files);
              }}
              style={{
                border: dragActive ? '2px dashed #0F6B74' : '1px dashed #cbd5e1',
                borderRadius: '14px',
                padding: '16px',
                marginBottom: '12px',
                background: dragActive ? '#ecfeff' : '#f8fafc',
                transition: 'all 0.16s ease',
                cursor: uploading ? 'wait' : 'pointer'
              }}
            >
              <div style={{ color: '#0f172a', marginBottom: '6px', fontWeight: 700 }}>
                Dateien hier ablegen oder klicken
              </div>
              <div style={{ color: '#64748b', marginBottom: '10px', fontSize: '13px' }}>
                Drag & Drop ist aktiv. Unterstützt: PDF, Bilder, Laborunterlagen
              </div>

              <input
                type='file'
                hidden
                ref={fileInputRef}
                disabled={uploading}
                multiple
                accept={uploadAccept}
                onChange={async (e) => {
                  const input = e.target;
                  const files = Array.from(input.files || []);
                  await handleUploadFiles(files);
                  input.value = '';
                  setUploadAccept('');
                }}
              />

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    openUploadPicker('');
                  }}
                  variant='secondary'
                  disabled={uploading}
                >
                  📤 Datei hochladen
                </Button>

                <Button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    openUploadPicker('application/pdf,.pdf');
                  }}
                  variant='secondary'
                >
                  PDF
                </Button>

                <Button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    openUploadPicker('.csv,.txt,.pdf,application/pdf');
                  }}
                  variant='secondary'
                >
                  Labor
                </Button>

                <Button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    openUploadPicker('image/*,.pdf');
                  }}
                  variant='secondary'
                >
                  Röntgen
                </Button>

                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    openInVetMindWithContext();
                  }}
                  variant='secondary'
                >
                  🧠 Mit Kontext arbeiten
                </Button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              {documents.map((doc) => (
                <ListItem
                  key={doc.id}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600 }}>{doc.name}</div>
                    <Badge tone='accent'>{getDocumentTypeLabel(doc.fileType)}</Badge>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {formatDateTime(doc.uploadedAt)}
                  </div>

                  <div style={{ fontSize: '13px', color: '#334155', marginTop: '7px', lineHeight: 1.45 }}>
                    {(doc.text || 'Kein Inhalt verfügbar.').slice(0, 180)}
                    {(doc.text || '').length > 180 ? ' ...' : ''}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <Button variant='secondary' size='sm' onClick={() => setSelectedDocument(doc)}>
                      👁 Vorschau öffnen
                    </Button>

                    <Button
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
                      variant='primary'
                      size='sm'
                    >
                      🧠 Als Kontext verwenden
                    </Button>

                    <Button variant='secondary' size='sm' onClick={() => removeDocument(doc.id)}>
                      🗑 löschen
                    </Button>
                  </div>
                </ListItem>
              ))}
            </div>
          </Section>
        </div>

        <aside style={{ display: 'grid', gap: '16px', position: 'sticky', top: '16px' }}>
          <Section title='🧬 Patient'>

            {!isEditingDetails && (
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ color: '#334155', fontWeight: 600 }}>{patient?.tierart || '-'}</div>
                <div style={{ color: '#334155' }}>{patient?.rasse || '-'}</div>
                <div style={{ color: '#334155' }}>{patient?.alter || '-'}</div>
                <div style={{ color: '#334155' }}>{patient?.geschlecht || '-'}</div>
                <div style={{ color: '#64748b', fontSize: '13px' }}>PMS-ID: {patient?.external_id || '-'}</div>
                <div style={{ color: '#64748b', fontSize: '13px' }}>Besitzer: {patient?.owner_name || '-'}</div>

                <Button variant='ghost' onClick={() => setIsEditingDetails(true)} style={{ justifyContent: 'flex-start', width: '100%' }}>
                  ✏️ Bearbeiten
                </Button>
              </div>
            )}

            {isEditingDetails && (
              <>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder='Name *'
                  />
                  <SelectInput
                    value={editForm.tierart}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, tierart: e.target.value }))}
                  >
                    <option value=''>Tierart</option>
                    <option value='Hund'>Hund</option>
                    <option value='Katze'>Katze</option>
                    <option value='Heimtier'>Heimtier</option>
                  </SelectInput>
                  <Input
                    value={editForm.rasse}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, rasse: e.target.value }))}
                    placeholder='Rasse'
                  />
                  <Input
                    value={editForm.alter}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, alter: e.target.value }))}
                    placeholder='Alter'
                  />
                  <SelectInput
                    value={editForm.geschlecht}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, geschlecht: e.target.value }))}
                  >
                    <option value=''>Geschlecht</option>
                    <option value='m'>m</option>
                    <option value='w'>w</option>
                    <option value='mk'>mk</option>
                    <option value='wk'>wk</option>
                  </SelectInput>
                  <Input
                    value={editForm.external_id}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, external_id: e.target.value }))}
                    placeholder='PMS-ID'
                  />
                  <Input
                    value={editForm.owner_name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                    placeholder='Besitzer'
                  />
                </div>

                <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                  <Button variant='primary' onClick={savePatientDetails} disabled={savingPatient} style={{ width: '100%' }}>
                    {savingPatient ? 'Speichert ...' : 'Details speichern'}
                  </Button>

                  <Button
                    variant='secondary'
                    onClick={() => {
                      if (!patient) return;
                      setEditForm({
                        name: patient.name || '',
                        tierart: patient.tierart || '',
                        rasse: patient.rasse || '',
                        alter: patient.alter || '',
                        geschlecht: patient.geschlecht || '',
                        external_id: patient.external_id || '',
                        owner_name: patient.owner_name || ''
                      });
                      setIsEditingDetails(false);
                    }}
                    style={{ width: '100%' }}
                  >
                    Abbrechen
                  </Button>
                </div>
              </>
            )}
          </Section>

          <Section title='📚 Kontext verfügbar'>
            <div style={{ color: '#334155', fontSize: '14px', lineHeight: 1.6 }}>
              <div>- {consultations.length} Konsultationen</div>
              <div>- {documents.length} Dokumente</div>
            </div>

            <Button variant='secondary' onClick={openInVetMindWithContext} style={{ marginTop: '10px', width: '100%' }}>
              🧠 Mit Kontext arbeiten
            </Button>
          </Section>

          <Section title='Aktionen'>
            <div style={{ display: 'grid', gap: '8px' }}>
              <Button variant='primary' onClick={() => router.push('/konsultation/start')} style={{ width: '100%' }}>
                + Konsultation starten
              </Button>

              <Button variant='secondary' onClick={openInVetMindWithContext} style={{ width: '100%' }}>
                🧠 VetMind öffnen
              </Button>
            </div>
          </Section>
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
          <Card
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, calc(100vw - 24px))',
              maxHeight: '78vh',
              overflow: 'auto',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>{selectedDocument.name}</h3>
              <Button variant='ghost' onClick={() => setSelectedDocument(null)} style={{ fontSize: '18px' }}>
                ✕
              </Button>
            </div>
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '10px' }}>{formatDateTime(selectedDocument.uploadedAt)}</div>
            <div style={{ whiteSpace: 'pre-wrap', color: '#1f2937', fontSize: '14px', lineHeight: 1.5 }}>
              {selectedDocument.text || 'Kein Inhalt verfügbar.'}
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
