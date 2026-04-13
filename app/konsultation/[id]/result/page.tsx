'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { generatePDF } from '../../../../lib/pdfReport';
import { searchBreeds } from '../../../../lib/patientBreeds';
import AiDisclaimer from '../../../../components/AiDisclaimer';
import { Badge, Button, Input, SelectInput, TextAreaInput, uiTokens } from '../../../../components/ui/System';

type Template = {
  id: string;
  name: string;
  content: string;
  category: string;
  structure?: { untersuchung?: string[] } | null;
};

type Patient = {
  id: string;
  name: string;
  tierart: string | null;
  rasse: string | null;
  alter: string | null;
  geschlecht: string | null;
  external_id: string | null;
  owner_name: string | null;
  created_at: string;
};

type UploadedContextFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  previewUrl: string;
  extractedText: string;
  inContext: boolean;
  status: 'uploading' | 'ready' | 'error';
  progress: number;
  uploadedAt: string;
};

type PracticeMembership = {
  practice_id: string | null;
  role: string | null;
  created_at: string | null;
};

const genderOptions = ['m', 'w', 'mk', 'wk'];

const formatPatientLabel = (patient: Patient | null | undefined) => {
  if (!patient) return 'Kein Patient zugeordnet';
  const ext = patient.external_id?.trim();
  return ext ? `${patient.name} (#${ext})` : patient.name;
};

const categoryLabels: Record<string, string> = {
  clinical: 'Klinisch',
  communication: 'Kommunikation',
  internal: 'Intern'
};

const normalizeCategory = (value: unknown) => {
  if (typeof value !== 'string') return 'clinical';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'clinical';
  if (normalized === 'admin') return 'internal';
  return normalized;
};

const normalizeVisibilityScope = (value: unknown) => {
  if (typeof value !== 'string') return 'practice';
  const normalized = value.trim().toLowerCase();
  return normalized === 'restricted' ? 'restricted' : 'practice';
};

const deriveCaseKind = (value: string) => (value === 'internal' ? 'internal' : 'clinical');

const contextFields: Record<string, Array<{ key: string; label: string; type?: string; options?: string[]; optional?: boolean }>> = {
  clinical: [
    { key: 'patientName', label: 'Patientenname', optional: true },
    { key: 'tierart', label: 'Tierart', type: 'select', options: ['Hund', 'Katze', 'Heimtier'], optional: true },
    { key: 'rasse', label: 'Rasse', optional: true },
    { key: 'alter', label: 'Alter', optional: true },
    {
      key: 'geschlecht',
      label: 'Geschlecht',
      type: 'select',
      options: ['weiblich', 'maennlich', 'weiblich kastriert (wk)', 'maennlich kastriert (mk)'],
      optional: true
    },
    { key: 'additionalInfo', label: 'Zusatzinformationen', type: 'textarea', optional: true }
  ],
  communication: [
    { key: 'tiername', label: 'Tiername' },
    { key: 'besitzer', label: 'Besitzername' },
    { key: 'anrede', label: 'Anrede', type: 'select', options: ['Herr', 'Frau', 'Familie'] },
    { key: 'art', label: 'Kommunikationsart', type: 'select', options: ['Telefon', 'E-Mail', 'WhatsApp'] },
    { key: 'nachricht', label: 'Nachricht/Kontext', type: 'textarea' },
    { key: 'tonfall', label: 'Tonfall', type: 'select', options: ['neutral', 'empathisch', 'direkt'], optional: true }
  ],
  internal: [
    { key: 'datum', label: 'Datum' },
    { key: 'titel', label: 'Titel/Thema' },
    { key: 'beteiligte', label: 'Beteiligte', optional: true },
    { key: 'weitere', label: 'Weitere Informationen', type: 'textarea', optional: true },
    { key: 'typ', label: 'Typ', type: 'select', options: ['Meeting', 'SOP', 'Notiz'], optional: true }
  ]
};

export default function ResultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const caseId = String(params.id || '');

  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateStructure, setTemplateStructure] = useState<Template['structure']>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedContextFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [caseNotes, setCaseNotes] = useState('');
  const [caseTitle, setCaseTitle] = useState('');
  const [casePracticeId, setCasePracticeId] = useState<string | null>(null);
  const [category, setCategory] = useState('clinical');
  const [visibilityScope, setVisibilityScope] = useState<'practice' | 'restricted'>('practice');
  const [quickMode, setQuickMode] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [contextData, setContextData] = useState<Record<string, string>>({});
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showPatientAssign, setShowPatientAssign] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientAction, setPatientAction] = useState<'existing' | 'new'>('existing');
  const [savingPatient, setSavingPatient] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: '',
    tierart: '',
    rasse: '',
    alter: '',
    geschlecht: '',
    external_id: '',
    owner_name: ''
  });

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [sessionCreatedAt, setSessionCreatedAt] = useState('');
  const [recordedDurationSeconds, setRecordedDurationSeconds] = useState(0);
  const [recordingStartedAtMs, setRecordingStartedAtMs] = useState<number | null>(null);
  const [timerNowMs, setTimerNowMs] = useState(Date.now());
  const [recordingAudioUrl, setRecordingAudioUrl] = useState('');
  const blobAudioUrlRef = useRef<string | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const previousCategoryRef = useRef(category);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [showTranscriptEditor, setShowTranscriptEditor] = useState(false);
  const [showLiveHandoffBanner, setShowLiveHandoffBanner] = useState(false);
  const [isLiveHandoffMode, setIsLiveHandoffMode] = useState(false);
  const [handoffFinalizedAt, setHandoffFinalizedAt] = useState<string | null>(null);
  const [finalizingHandoff, setFinalizingHandoff] = useState(false);

  const autosavePrefix = `case_${caseId}_autosave_`;
  const checks = useMemo(() => (templateStructure?.untersuchung || []), [templateStructure]);
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) || null,
    [patients, selectedPatientId]
  );
  const filteredPatients = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    if (!term) return patients.slice(0, 20);
    return patients
      .filter((patient) => {
        const haystack = [patient.name, patient.external_id || '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 20);
  }, [patients, patientSearch]);
  const breedSuggestions = useMemo(() => searchBreeds(newPatient.rasse), [newPatient.rasse]);
  const liveSegmentSeconds = recording && recordingStartedAtMs
    ? Math.max(0, Math.floor((timerNowMs - recordingStartedAtMs) / 1000))
    : 0;
  const totalDurationSeconds = recordedDurationSeconds + liveSegmentSeconds;
  const supportsPatientContext = category !== 'internal';

  const formatDuration = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safe / 60)
      .toString()
      .padStart(2, '0');
    const secs = (safe % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const formatSessionDateTime = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const time = date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${day} · ${time}`;
  };

  const formatDateTime = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStructuredCaseData = () => {
    const patientName = (selectedPatient?.name || contextData.patientName || contextData.tiername || '').trim();
    const tierart = (selectedPatient?.tierart || contextData.tierart || '').trim();
    const rasse = (selectedPatient?.rasse || contextData.rasse || '').trim();
    const alter = (selectedPatient?.alter || contextData.alter || '').trim();
    const geschlecht = (selectedPatient?.geschlecht || contextData.geschlecht || '').trim();
    const additionalInfo = (contextData.additionalInfo || contextData.weitere || '').trim();

    return {
      title: caseTitle || '',
      patientName,
      tierart,
      rasse,
      alter,
      geschlecht,
      additionalInfo,
      result
    };
  };

  const brand = {
    primary: '#0F6B74',
    border: '#E5E7EB',
    bg: '#F4F7F8',
    card: '#FFFFFF'
  };

  const maxFileSizeBytes = 30 * 1024 * 1024;

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  };

  const getFileBadge = (type: string) => {
    if (type.startsWith('image/')) return '🖼';
    if (type.includes('pdf')) return '📄 PDF';
    if (type.startsWith('audio/')) return '🎵';
    return '📎';
  };

  const buildCombinedInput = () => {
    let contextBlock = '';
    if (!quickMode) {
      const fields = contextFields[category] || [];
      const filled = fields.filter((f) => contextData[f.key]);

      if (filled.length > 0) {
        contextBlock = `KONTEXT:\n${filled.map((f) => `${f.label}: ${contextData[f.key]}`).join('\n')}\n\n`;
      }
    }

    let combined = '';
    if (contextBlock) combined += contextBlock;
    if (caseNotes) combined += `VORINFORMATIONEN:\n${caseNotes}\n\n`;

    // Always use transcript as source for generation; never reuse generated result as source.
    combined += transcript;

    const filesInContext = uploadedFiles.length > 0
      ? uploadedFiles
          .filter((file) => file.inContext && file.status === 'ready' && file.extractedText)
          .map((file) => file.extractedText)
      : attachments;

    if (filesInContext.length > 0) {
      combined += `\n\nZUSÄTZLICHE BEFUNDE:\n${filesInContext.join('\n\n')}`;
    }

    return combined.trim();
  };

  const processFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    for (const file of files) {
      const tooLarge = file.size > maxFileSizeBytes;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';

      const base: UploadedContextFile = {
        id,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        previewUrl,
        extractedText: '',
        inContext: !tooLarge,
        status: tooLarge ? 'error' : 'uploading',
        progress: tooLarge ? 0 : 15,
        uploadedAt: new Date().toISOString()
      };

      setUploadedFiles((prev) => [base, ...prev]);

      if (tooLarge) {
        alert(`Datei zu groß: ${file.name} (max. 30 MB)`);
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        setUploadedFiles((prev) => prev.map((entry) => (entry.id === id ? { ...entry, progress: 55 } : entry)));
        const res = await fetch('/api/analyze-image', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        const extracted = (data?.result || data?.text || '').trim();

        if (!extracted) {
          setUploadedFiles((prev) => prev.map((entry) => (
            entry.id === id ? { ...entry, status: 'error', progress: 100 } : entry
          )));
          continue;
        }

        // Keep legacy attachments in sync as fallback for older context paths.
        setAttachments((prev) => [...prev, extracted]);
        setUploadedFiles((prev) => prev.map((entry) => (
          entry.id === id
            ? { ...entry, extractedText: extracted, status: 'ready', progress: 100 }
            : entry
        )));
      } catch (err) {
        console.error(err);
        setUploadedFiles((prev) => prev.map((entry) => (
          entry.id === id ? { ...entry, status: 'error', progress: 100 } : entry
        )));
      }
    }
  };

  const removeUploadedFile = (fileId: string) => {
    setUploadedFiles((prev) => {
      const current = prev.find((entry) => entry.id === fileId);
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }

      if (current?.extractedText) {
        setAttachments((prevAttachments) => {
          const idx = prevAttachments.findIndex((item) => item === current.extractedText);
          if (idx === -1) return prevAttachments;
          const next = [...prevAttachments];
          next.splice(idx, 1);
          return next;
        });
      }

      return prev.filter((entry) => entry.id !== fileId);
    });

    if (previewFileId === fileId) {
      setPreviewFileId(null);
    }
  };

  const toggleFileInContext = (fileId: string) => {
    setUploadedFiles((prev) => prev.map((entry) => (
      entry.id === fileId ? { ...entry, inContext: !entry.inContext } : entry
    )));
  };

  const previewFile = uploadedFiles.find((entry) => entry.id === previewFileId) || null;

  const patientSuggestion = useMemo(() => {
    const name = (contextData.patientName || contextData.tiername || '').trim();
    const tierart = (contextData.tierart || '').trim();
    const external = (contextData.external_id || '').trim();
    if (!name) return null;
    return {
      name,
      tierart,
      external_id: external,
      label: `Als neuen Patienten anlegen: ${name}${tierart ? ` (${tierart})` : ''}`
    };
  }, [contextData]);

  const generate = async () => {
    if (!transcript.trim() && attachments.length === 0 && !caseNotes.trim() && !selectedTemplate.trim()) {
      alert('Keine Eingaben für Generierung vorhanden.');
      return;
    }

    const combinedInput = buildCombinedInput();
    const patientContext = selectedPatient
      ? [
          `PATIENT (NUR INTERNER KONTEXT, NICHT IM FINALTEXT AUSGEBEN):`,
          `Name: ${selectedPatient.name}`,
          selectedPatient.tierart ? `Tierart: ${selectedPatient.tierart}` : '',
          selectedPatient.rasse ? `Rasse: ${selectedPatient.rasse}` : '',
          selectedPatient.alter ? `Alter: ${selectedPatient.alter}` : '',
          selectedPatient.geschlecht ? `Geschlecht: ${selectedPatient.geschlecht}` : '',
          selectedPatient.external_id ? `PMS-ID: ${selectedPatient.external_id}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      : '';
    const finalPrompt = selectedTemplate
      ? `${selectedTemplate}\n\n${combinedInput}`
      : `Erstelle eine strukturierte Notiz.\n\nINPUT:\n${combinedInput}`;

    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: finalPrompt }],
          context: patientContext
        })
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      setResult('');

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullText += chunk;
        setResult(fullText);
      }

      let updatedText = fullText;
      checks.forEach((item) => {
        if (!updatedText.toLowerCase().includes(item.toLowerCase())) {
          updatedText += `\n${item}: nicht genannt`;
        }
      });
      setResult(updatedText);
    } catch (err) {
      console.error(err);
      alert('Fehler bei Generierung');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadCaseAndDraft = async () => {
      if (!caseId) return;

      const storedTranscript = localStorage.getItem(`${autosavePrefix}transcript`);
      const storedResult = localStorage.getItem(`${autosavePrefix}result`);
      const storedTemplate = localStorage.getItem(`${autosavePrefix}template`);
      const storedCategory = localStorage.getItem(`${autosavePrefix}category`);
      const storedVisibility = localStorage.getItem(`${autosavePrefix}visibility_scope`);
      const storedContext = localStorage.getItem(`${autosavePrefix}context`);
      const storedAttachments = localStorage.getItem(`${autosavePrefix}attachments`);
      const storedAttachmentFiles = localStorage.getItem(`${autosavePrefix}attachment_files`);
      const storedNotes = localStorage.getItem(`${autosavePrefix}notes`);
      const storedRecordingSession = localStorage.getItem(`${autosavePrefix}recording_session`);
      const storedHandoff = localStorage.getItem(`case_${caseId}_anamnesis_handoff`);

      if (storedTranscript !== null) setTranscript(storedTranscript);
      if (storedResult !== null) setResult(storedResult);
      if (storedTemplate !== null) setSelectedTemplate(storedTemplate);
      if (storedCategory) setCategory(normalizeCategory(storedCategory));
      if (storedVisibility) {
        setVisibilityScope(normalizeVisibilityScope(storedVisibility));
      }
      if (storedContext) {
        try {
          setContextData(JSON.parse(storedContext));
        } catch {
          setContextData({});
        }
      }
      if (storedAttachments) {
        try {
          setAttachments(JSON.parse(storedAttachments));
        } catch {
          setAttachments([]);
        }
      }
      if (storedAttachmentFiles) {
        try {
          const parsed = JSON.parse(storedAttachmentFiles) as UploadedContextFile[];
          setUploadedFiles(parsed || []);
        } catch {
          setUploadedFiles([]);
        }
      }
      if (storedNotes !== null) setCaseNotes(storedNotes);
      if (storedHandoff) {
        try {
          const handoff = JSON.parse(storedHandoff) as { transcript?: string; result?: string; source?: string };
          if (!storedTranscript && typeof handoff.transcript === 'string') setTranscript(handoff.transcript);
          if (!storedResult && typeof handoff.result === 'string') setResult(handoff.result);
          if (handoff.source === 'live') {
            setShowLiveHandoffBanner(true);
            setIsLiveHandoffMode(true);
          }
        } catch {
          // Ignore invalid handoff payload.
        }
      }
      if (storedRecordingSession) {
        try {
          const parsed = JSON.parse(storedRecordingSession);
          if (parsed?.created_at) setSessionCreatedAt(parsed.created_at);
          if (typeof parsed?.duration_seconds === 'number') {
            setRecordedDurationSeconds(Math.max(0, Math.floor(parsed.duration_seconds)));
          }
          if (parsed?.audio_url) setRecordingAudioUrl(parsed.audio_url);
        } catch {
          // Ignore invalid stored recording session payload.
        }
      }

      const { data } = await supabase
        .from('cases')
        .select('*')
        .eq('id', caseId)
        .maybeSingle();

      if (data) {
        if (data.title) setCaseTitle(data.title);
        if (data.practice_id) setCasePracticeId(data.practice_id);
        if (data.patient_id) setSelectedPatientId(data.patient_id);
        if (!storedCategory && data.category) setCategory(normalizeCategory(data.category));
        if (!storedVisibility && data.visibility_scope) {
          setVisibilityScope(normalizeVisibilityScope(data.visibility_scope));
        }
        if (!storedRecordingSession && data.created_at) setSessionCreatedAt(data.created_at);
        if (!storedTranscript && data.transcript) setTranscript(data.transcript);
        if (!storedResult && data.result) setResult(data.result);
        setContextData((prev) => ({
          ...prev,
          patientName: prev.patientName || data.patient_name || '',
          tierart: prev.tierart || data.species || '',
          rasse: prev.rasse || data.breed || '',
          alter: prev.alter || data.age || ''
        }));
      }

      if (!storedTranscript) {
        const legacyTranscript = localStorage.getItem('consultation_result') || '';
        if (legacyTranscript) setTranscript(legacyTranscript);
      }

      const legacyTemplate = localStorage.getItem('selectedTemplate');
      if (!storedTemplate && legacyTemplate) {
        try {
          const parsed = JSON.parse(legacyTemplate);
          setSelectedTemplate(parsed?.content || '');
          setTemplateStructure(parsed?.structure || null);
        } catch {
          // Ignore invalid legacy template data.
        }
      }

      if (!storedNotes) {
        const notes = localStorage.getItem('case_notes') || '';
        setCaseNotes(notes);
      }

      const savedContextByCase = localStorage.getItem(`case_context_${caseId}`);
      if (savedContextByCase) {
        try {
          const parsed = JSON.parse(savedContextByCase);
          const structured = parsed.structuredCase || {};
          if (parsed.patient_id) {
            setSelectedPatientId(parsed.patient_id);
          }
          if (parsed.patient && !parsed.patient_id) {
            setPatients((prev) => {
              const exists = prev.some((item) => item.id === parsed.patient.id);
              if (exists) return prev;
              return [parsed.patient as Patient, ...prev];
            });
            setSelectedPatientId(parsed.patient.id);
          }
          if (!storedContext && (parsed.contextData || structured)) {
            setContextData({
              ...(parsed.contextData || {}),
              patientName: structured.patientName || parsed.contextData?.patientName || parsed.contextData?.tiername || '',
              tierart: structured.tierart || parsed.contextData?.tierart || '',
              rasse: structured.rasse || parsed.contextData?.rasse || '',
              alter: structured.alter || parsed.contextData?.alter || '',
              geschlecht: structured.geschlecht || parsed.contextData?.geschlecht || '',
              additionalInfo: structured.additionalInfo || parsed.contextData?.additionalInfo || parsed.contextData?.weitere || ''
            });
          }
          if (!storedAttachments && parsed.attachments) setAttachments(parsed.attachments);
          if (!storedAttachmentFiles && parsed.attachmentFiles) setUploadedFiles(parsed.attachmentFiles);
          if (!storedCategory && parsed.category) setCategory(normalizeCategory(parsed.category));
          if (!storedVisibility && parsed.visibilityScope) {
            setVisibilityScope(normalizeVisibilityScope(parsed.visibilityScope));
          }
          if (!storedTemplate && parsed.template) setSelectedTemplate(parsed.template);
          if (parsed.recordingSession) {
            if (parsed.recordingSession.created_at) setSessionCreatedAt(parsed.recordingSession.created_at);
            if (typeof parsed.recordingSession.duration_seconds === 'number') {
              setRecordedDurationSeconds((prev) =>
                Math.max(prev, Math.max(0, Math.floor(parsed.recordingSession.duration_seconds)))
              );
            }
            if (parsed.recordingSession.audio_url) setRecordingAudioUrl(parsed.recordingSession.audio_url);
          }
          if (!caseTitle && structured.title) setCaseTitle(structured.title);
        } catch {
          // Ignore invalid context payload.
        }
      }
    };

    loadCaseAndDraft();
  }, [autosavePrefix, caseId]);

  useEffect(() => {
    if (searchParams.get('source') === 'live') {
      setShowLiveHandoffBanner(true);
      setIsLiveHandoffMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!caseId) return;
    const raw = localStorage.getItem(`case_${caseId}_handoff_status`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { finalizedAt?: string };
      if (parsed.finalizedAt) setHandoffFinalizedAt(parsed.finalizedAt);
    } catch {
      // Ignore malformed handoff status.
    }
  }, [caseId]);

  useEffect(() => {
    const loadPatients = async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) {
        console.error(error);
        return;
      }

      setPatients((data || []) as Patient[]);
    };

    loadPatients();
  }, []);

  useEffect(() => {
    if (!recording) return;
    setTimerNowMs(Date.now());
    const interval = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    return () => {
      if (blobAudioUrlRef.current) {
        URL.revokeObjectURL(blobAudioUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!caseId) return;
    const createdAt = sessionCreatedAt || new Date().toISOString();
    if (!sessionCreatedAt) setSessionCreatedAt(createdAt);

    const key = `${autosavePrefix}recording_session`;
    let existingDuration = 0;
    const existing = localStorage.getItem(key);
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        if (typeof parsed?.duration_seconds === 'number') {
          existingDuration = Math.max(0, Math.floor(parsed.duration_seconds));
        }
      } catch {
        existingDuration = 0;
      }
    }

    const safeDuration = Math.max(existingDuration, totalDurationSeconds);

    localStorage.setItem(
      key,
      JSON.stringify({
        name: caseTitle || '',
        duration_seconds: safeDuration,
        created_at: createdAt,
        audio_url: recordingAudioUrl || null
      })
    );
  }, [autosavePrefix, caseId, caseTitle, totalDurationSeconds, sessionCreatedAt, recordingAudioUrl]);

  useEffect(() => {
    const loadTemplates = async () => {
      const enteredClinical = previousCategoryRef.current !== category && category === 'clinical';

      await supabase
        .from('templates')
        .update({ category: 'internal' })
        .eq('category', 'admin');

      let query = supabase
        .from('templates')
        .select('*')
        .order('created_at', { ascending: true });

      if (category === 'internal') {
        query = query.in('category', ['internal', 'admin']);
      } else {
        query = query.eq('category', category);
      }

      const { data } = await query;

      const loaded = (data || []) as Template[];
      setTemplates(loaded);

      const clinicalDefault = loaded.find((t) => t.name.toLowerCase().includes('allgemeine untersuchung'));

      if (enteredClinical && clinicalDefault) {
        setSelectedTemplate(clinicalDefault.content);
        setTemplateStructure(clinicalDefault.structure || null);
        previousCategoryRef.current = category;
        return;
      }

      if (!selectedTemplate && loaded.length > 0) {
        const defaultTemplate = (category === 'clinical' ? clinicalDefault : undefined) || loaded[0];
        setSelectedTemplate(defaultTemplate.content);
        setTemplateStructure(defaultTemplate.structure || null);
      }

      if (selectedTemplate) {
        const selected = loaded.find((t) => t.content === selectedTemplate);
        setTemplateStructure(selected?.structure || null);
      }

      previousCategoryRef.current = category;
    };

    loadTemplates();
  }, [category, selectedTemplate]);

  useEffect(() => {
    localStorage.setItem(`${autosavePrefix}transcript`, transcript || '');
  }, [autosavePrefix, transcript]);

  useEffect(() => {
    localStorage.setItem(`${autosavePrefix}result`, result || '');
  }, [autosavePrefix, result]);

  useEffect(() => {
    localStorage.setItem(`${autosavePrefix}template`, selectedTemplate || '');
  }, [autosavePrefix, selectedTemplate]);

  useEffect(() => {
    localStorage.setItem(`${autosavePrefix}category`, category || 'clinical');
  }, [autosavePrefix, category]);

  useEffect(() => {
    if (category !== 'internal' && visibilityScope !== 'practice') {
      setVisibilityScope('practice');
      return;
    }
    localStorage.setItem(`${autosavePrefix}visibility_scope`, visibilityScope);
  }, [autosavePrefix, category, visibilityScope]);

  useEffect(() => {
    localStorage.setItem(`${autosavePrefix}context`, JSON.stringify(contextData || {}));
  }, [autosavePrefix, contextData]);

  useEffect(() => {
    localStorage.setItem(`${autosavePrefix}attachments`, JSON.stringify(attachments || []));
  }, [autosavePrefix, attachments]);

  useEffect(() => {
    localStorage.setItem(`${autosavePrefix}attachment_files`, JSON.stringify(uploadedFiles || []));
  }, [autosavePrefix, uploadedFiles]);

  useEffect(() => {
    localStorage.setItem(`${autosavePrefix}notes`, caseNotes || '');
  }, [autosavePrefix, caseNotes]);

  useEffect(() => {
    if (!caseId) return;

    const structuredCase = getStructuredCaseData();
    const previewBase = (result || transcript || '').trim();
    const preview = previewBase
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' ')
      .slice(0, 180);

    localStorage.setItem(
      `case_context_${caseId}`,
      JSON.stringify({
        structuredCase,
        title: structuredCase.title,
        patient_id: selectedPatientId,
        patient: selectedPatient,
        patient_name: structuredCase.patientName,
        preview,
        created_at: new Date().toISOString(),
        contextData,
        attachments,
        attachmentFiles: uploadedFiles,
        category,
        visibilityScope,
        template: selectedTemplate,
        notes: caseNotes,
        recordingSession: {
          name: caseTitle || '',
          duration_seconds: totalDurationSeconds,
          created_at: sessionCreatedAt || new Date().toISOString(),
          audio_url: recordingAudioUrl || null
        }
      })
    );

    localStorage.setItem(
      'last_consultation_snapshot',
      JSON.stringify({
        caseId,
        patient_id: selectedPatientId,
        patient: selectedPatient,
        structuredCase,
        result,
        transcript,
        recordingSession: {
          name: caseTitle || '',
          duration_seconds: totalDurationSeconds,
          created_at: sessionCreatedAt || new Date().toISOString(),
          audio_url: recordingAudioUrl || null
        },
        updatedAt: new Date().toISOString()
      })
    );
  }, [caseId, caseTitle, contextData, result, transcript, attachments, uploadedFiles, category, selectedTemplate, caseNotes, totalDurationSeconds, sessionCreatedAt, recordingAudioUrl, selectedPatientId, selectedPatient]);

  useEffect(() => {
    if (!caseId) return;
    localStorage.setItem('last_consultation_case_id', caseId);
    localStorage.setItem('current_case_id', caseId);
    localStorage.setItem('last_consultation_updated_at', new Date().toISOString());
  }, [caseId, result, contextData, caseNotes]);

  const startRecording = async () => {
    if (!sessionCreatedAt) {
      setSessionCreatedAt(new Date().toISOString());
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      chunksRef.current.push(e.data);
    };

    recorder.start();
    setRecordingStartedAtMs(Date.now());
    setTimerNowMs(Date.now());
    setRecording(true);
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;

    const stoppedAtMs = Date.now();
    const currentSegmentSeconds = recordingStartedAtMs
      ? Math.max(0, Math.floor((stoppedAtMs - recordingStartedAtMs) / 1000))
      : 0;

    setRecording(false);
    setRecordingStartedAtMs(null);
    if (currentSegmentSeconds > 0) {
      setRecordedDurationSeconds((prev) => prev + currentSegmentSeconds);
    }

    mediaRecorderRef.current.stop();

    mediaRecorderRef.current.onstop = async () => {
      try {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blobAudioUrlRef.current) {
          URL.revokeObjectURL(blobAudioUrlRef.current);
        }
        const previewUrl = URL.createObjectURL(blob);
        blobAudioUrlRef.current = previewUrl;
        setRecordingAudioUrl(previewUrl);

        try {
          const path = `recordings/${caseId}/${Date.now()}.webm`;
          const uploadRes = await supabase.storage
            .from('recordings')
            .upload(path, blob, { contentType: 'audio/webm', upsert: false });

          if (!uploadRes.error) {
            const publicRes = supabase.storage.from('recordings').getPublicUrl(path);
            const publicUrl = publicRes?.data?.publicUrl || '';
            if (publicUrl) {
              setRecordingAudioUrl(publicUrl);
            }
          }
        } catch {
          // Storage upload is optional; keep local URL fallback.
        }

        const formData = new FormData();
        formData.append('file', blob);

        const res = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        const newText = (data?.text || '').trim();
        if (!newText) return;

        setTranscript((prev) => (prev ? `${prev}\n\n${newText}` : newText));
      } catch (err) {
        console.error(err);
        alert('Fehler bei Transkription');
      }
    };
  };

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!shareMenuRef.current) return;
      if (!shareMenuRef.current.contains(event.target as Node)) {
        setShareMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const shareText = async () => {
    if (!result.trim()) return;

    const title = caseTitle?.trim() || 'Patientenbrief';
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title,
          text: result
        });
        setShareMenuOpen(false);
        return;
      } catch {
        // User canceled or share failed: fallback to menu.
      }
    }

    setShareMenuOpen((prev) => !prev);
  };

  const downloadPdf = () => {
    const structuredCase = getStructuredCaseData();
    generatePDF(result, {
      title: caseTitle?.trim() || 'Patientenbrief',
      date: new Date(),
      patientName: structuredCase.patientName || undefined,
      ownerName: contextData.besitzer || undefined
    });
    setShareMenuOpen(false);
  };

  const copyResultText = async () => {
    await navigator.clipboard.writeText(result);
    setShareMenuOpen(false);
  };

  const openEmailClient = () => {
    const subject = encodeURIComponent(caseTitle?.trim() || 'Patientenbrief');
    const body = encodeURIComponent(result || '');
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setShareMenuOpen(false);
  };

  const applyPatientToContext = (patient: Patient) => {
    setContextData((prev) => ({
      ...prev,
      patientName: patient.name || prev.patientName || '',
      tierart: patient.tierart || prev.tierart || '',
      rasse: patient.rasse || prev.rasse || '',
      alter: patient.alter || prev.alter || '',
      geschlecht: patient.geschlecht || prev.geschlecht || '',
      besitzer: patient.owner_name || prev.besitzer || '',
      external_id: patient.external_id || prev.external_id || ''
    }));
  };

  const createPatient = async () => {
    const normalizedName = newPatient.name.trim();
    if (!normalizedName) {
      alert('Bitte einen Patientennamen eingeben.');
      return;
    }

    setSavingPatient(true);
    try {
      const payload = {
        name: normalizedName,
        tierart: newPatient.tierart || null,
        rasse: newPatient.rasse.trim() || null,
        alter: newPatient.alter.trim() || null,
        geschlecht: newPatient.geschlecht || null,
        external_id: newPatient.external_id.trim() || null,
        owner_name: newPatient.owner_name.trim() || null
      };

      const { data, error } = await supabase
        .from('patients')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      const createdPatient = data as Patient;
      setPatients((prev) => [createdPatient, ...prev]);
      setSelectedPatientId(createdPatient.id);
      applyPatientToContext(createdPatient);
      setShowPatientAssign(false);
      setPatientAction('existing');
      setPatientSearch('');
    } catch (err) {
      console.error(err);
      alert('Patient konnte nicht angelegt werden.');
    } finally {
      setSavingPatient(false);
    }
  };

  const saveCase = async (): Promise<boolean> => {
    if (!caseId) {
      alert('Keine Fall-ID gefunden.');
      return false;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id || null;

      const { data: memberships } = await supabase
        .from('practice_memberships')
        .select('practice_id, role, created_at')
        .order('created_at', { ascending: true });

      const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
      const selectedMembership = ((memberships || []) as PracticeMembership[]).sort((a, b) => {
        const ra = rank[a.role || ''] ?? 99;
        const rb = rank[b.role || ''] ?? 99;
        if (ra !== rb) return ra - rb;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      })[0];
      const effectivePracticeId = casePracticeId || selectedMembership?.practice_id || null;

      if (!effectivePracticeId) {
        throw new Error('Kein practice_id vorhanden. Bitte Praxiszuordnung prüfen.');
      }

      const structuredCase = getStructuredCaseData();
      const patientName = structuredCase.patientName;
      const previewBase = (result || transcript || '').trim();
      const previewLines = previewBase
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' ')
        .slice(0, 180);

      const payload = {
        title: caseTitle || null,
        patient_id: selectedPatientId,
        patient_name: selectedPatient?.name || patientName || null,
        species: selectedPatient?.tierart || structuredCase.tierart || null,
        breed: selectedPatient?.rasse || structuredCase.rasse || null,
        age: selectedPatient?.alter || structuredCase.alter || null,
        user_id: currentUserId,
        practice_id: effectivePracticeId,
        category,
        case_kind: deriveCaseKind(category),
        visibility_scope: category === 'internal' ? visibilityScope : 'practice',
        transcript,
        result,
        template: selectedTemplate || null
      };

      const { error } = await supabase
        .from('cases')
        .update(payload)
        .eq('id', caseId);

      if (error) {
        const detail = [error.message, error.details, error.hint].filter(Boolean).join(' | ');
        throw new Error(detail || 'Unbekannter Datenbankfehler');
      }

      localStorage.setItem(
        `case_context_${caseId}`,
        JSON.stringify({
          structuredCase,
          title: caseTitle || '',
          patient_id: selectedPatientId,
          patient: selectedPatient,
          patient_name: patientName || '',
          preview: previewLines,
          created_at: new Date().toISOString(),
          contextData,
          attachments,
          attachmentFiles: uploadedFiles,
          category,
          visibilityScope,
          template: selectedTemplate,
          notes: caseNotes,
          recordingSession: {
            name: caseTitle || '',
            duration_seconds: totalDurationSeconds,
            created_at: sessionCreatedAt || new Date().toISOString(),
            audio_url: recordingAudioUrl || null
          }
        })
      );

      // Keep autosave as a local fallback so reopening "Letzte Konsultation" restores state instantly.

      alert('✅ Fall gespeichert');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      console.error('saveCase failed', err);
      alert(`Fehler beim Speichern: ${message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finalizeHandoff = async () => {
    if (!caseId || finalizingHandoff) return;

    setFinalizingHandoff(true);
    try {
      const ok = await saveCase();
      if (!ok) return;

      const finalizedAt = new Date().toISOString();
      setHandoffFinalizedAt(finalizedAt);
      localStorage.setItem(
        `case_${caseId}_handoff_status`,
        JSON.stringify({
          finalizedAt,
          mode: 'live-documentation'
        })
      );

      alert('✅ Anamnese wurde in die Konsultation übernommen.');
    } finally {
      setFinalizingHandoff(false);
    }
  };

  if (isLiveHandoffMode) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: brand.bg,
          padding: uiTokens.pagePadding,
          fontFamily: 'Arial'
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ margin: 0, color: uiTokens.brand, fontSize: '32px', fontWeight: 700 }}>Dokumentation (Live-Übergabe)</h1>
            <div style={{ marginTop: 6, fontSize: '14px', color: uiTokens.textSecondary }}>
              Strukturierte Anamnese prüfen, bei Bedarf editieren und in die Konsultation übernehmen.
            </div>
          </div>

          {showLiveHandoffBanner && (
            <div
              style={{
                marginBottom: '16px',
                border: '1px solid #c7e2d2',
                background: '#eefbf3',
                color: '#0f5132',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
                alignItems: 'center'
              }}
            >
              <div style={{ fontSize: '13px' }}>
                Live-Anamnese wurde übernommen. Dieses Ergebnisfeld ist direkt editierbar.
              </div>
              <Button
                size='sm'
                variant='secondary'
                onClick={() => setShowLiveHandoffBanner(false)}
                style={{ background: '#fff', color: '#14532d' }}
              >
                Hinweis schließen
              </Button>
            </div>
          )}

          <div
            style={{
              background: '#fff',
              padding: '14px',
              borderRadius: '12px',
              border: `1px solid ${brand.border}`,
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ fontSize: '13px', color: '#334155' }}>
              📄 {caseTitle || 'Unbenannte Konsultation'}{' '}
              • {formatPatientLabel(selectedPatient)}{' '}
              • {formatSessionDateTime(sessionCreatedAt) || 'Datum offen'}{' '}
              • {formatDuration(totalDurationSeconds)} min
            </div>

            {handoffFinalizedAt ? (
              <div
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: '#ecfdf3',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: '12px',
                  fontWeight: 700
                }}
              >
                Übernommen am {formatDateTime(handoffFinalizedAt)}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                onClick={recording ? stopRecording : startRecording}
                variant='secondary'
                size='sm'
                style={{ background: recording ? '#fff1f2' : '#fff', fontSize: '12px' }}
              >
                {recording ? '⏹ Aufnahme stoppen' : '🎤 Aufnahme fortsetzen'}
              </Button>

              <Button
                onClick={() => router.push(`/konsultation/${caseId}/live`)}
                variant='secondary'
                size='sm'
                style={{ background: '#fff', fontSize: '12px' }}
              >
                🧭 Zur Live-Ansicht
              </Button>
            </div>
          </div>

          <div
            style={{
              background: '#fff',
              padding: '16px',
              borderRadius: '12px',
              border: `1px solid ${brand.border}`,
              marginBottom: '14px'
            }}
          >
            <div style={{ marginBottom: '10px', fontSize: '13px', color: '#64748b' }}>Fertiges Ergebnis (editierbar)</div>
            <div
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setResult(e.currentTarget.innerText)}
              style={{
                width: '100%',
                minHeight: '360px',
                border: '1px solid #E5E7EB',
                borderRadius: '10px',
                padding: '12px',
                whiteSpace: 'pre-wrap',
                background: '#fcfdff'
              }}
            >
              {result}
            </div>
          </div>

          <div
            style={{
              background: '#fff',
              padding: '16px',
              borderRadius: '12px',
              border: `1px solid ${brand.border}`,
              marginBottom: '14px'
            }}
          >
            <div style={{ marginBottom: '10px', fontSize: '13px', color: '#64748b' }}>Transkript</div>
            <Button
              onClick={() => setShowTranscriptEditor((prev) => !prev)}
              variant='secondary'
              size='sm'
              style={{ marginBottom: 10, background: showTranscriptEditor ? '#eef6f7' : '#fff' }}
            >
              {showTranscriptEditor ? 'Transkript ausblenden' : 'Transkript anzeigen/bearbeiten'}
            </Button>

            {showTranscriptEditor ? (
              <TextAreaInput
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder='Transkript hier bearbeiten...'
                style={{ minHeight: '180px', resize: 'vertical', background: '#fff' }}
              />
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button
              onClick={finalizeHandoff}
              disabled={saving || finalizingHandoff}
              variant='primary'
              style={{ background: '#166534', color: '#fff', fontWeight: 700 }}
            >
              {finalizingHandoff ? 'Übernehme...' : handoffFinalizedAt ? 'Erneut übernehmen' : 'Anamnese in Konsultation übernehmen'}
            </Button>

            <Button
              onClick={saveCase}
              disabled={saving}
              variant='primary'
              style={{ background: brand.primary, color: '#fff', fontWeight: 700 }}
            >
              {saving ? 'Speichert...' : '💾 Dokumentation speichern'}
            </Button>

            <Button
              onClick={() => {
                setIsLiveHandoffMode(false);
                setShowLiveHandoffBanner(false);
                router.replace(`/konsultation/${caseId}/result`);
              }}
              variant='secondary'
              style={{ background: '#fff', color: '#111827', fontWeight: 600 }}
            >
              Vollständige Konsultation öffnen
            </Button>
          </div>

          {result.trim() ? <AiDisclaimer /> : null}
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: brand.bg,
        padding: uiTokens.pagePadding,
        fontFamily: 'Arial'
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, color: uiTokens.brand, fontSize: '32px', fontWeight: 700 }}>Konsultation</h1>
        <div style={{ marginTop: 6, fontSize: '14px', color: uiTokens.textSecondary }}>
          Vorlage waehlen, Kontext anreichern und Ergebnis direkt mit VetMind weiterbearbeiten.
        </div>
      </div>

      {showLiveHandoffBanner && (
        <div
          style={{
            marginBottom: '16px',
            border: '1px solid #c7e2d2',
            background: '#eefbf3',
            color: '#0f5132',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
            alignItems: 'center'
          }}
        >
          <div style={{ fontSize: '13px' }}>
            Live-Anamnese wurde übernommen. Ergebnis ist sofort editierbar und für die Konsultation bereit.
          </div>
          <Button
            size='sm'
            variant='secondary'
            onClick={() => setShowLiveHandoffBanner(false)}
            style={{ background: '#fff', color: '#14532d' }}
          >
            Hinweis schließen
          </Button>
        </div>
      )}

      <div
        style={{
          background: brand.card,
          padding: '12px',
          borderRadius: '12px',
          border: `1px solid ${brand.border}`,
          marginBottom: '10px'
        }}
      >
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        {['clinical', 'communication', 'internal'].map((cat) => (
          <Button
            key={cat}
            onClick={() => {
              setCategory(cat);
            }}
            variant={category === cat ? 'primary' : 'secondary'}
            style={{
              color: category === cat ? '#fff' : '#000'
            }}
          >
            {categoryLabels[cat]}
          </Button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '12px', color: '#64748b' }}>Sichtbarkeit</div>
        {category === 'internal' ? (
          <>
            <Button
              size='sm'
              variant={visibilityScope === 'restricted' ? 'primary' : 'secondary'}
              onClick={() => setVisibilityScope('restricted')}
              style={{ color: visibilityScope === 'restricted' ? '#fff' : '#111827' }}
            >
              Nur ausgewählte Personen
            </Button>
            <Button
              size='sm'
              variant={visibilityScope === 'practice' ? 'primary' : 'secondary'}
              onClick={() => setVisibilityScope('practice')}
              style={{ color: visibilityScope === 'practice' ? '#fff' : '#111827' }}
            >
              Ganze Praxis
            </Button>
          </>
        ) : (
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Klinische und Kommunikationsfälle sind praxisweit sichtbar.
          </div>
        )}
      </div>
      </div>

      <div
        style={{
          background: brand.card,
          padding: '16px',
          borderRadius: '12px',
          border: `1px solid ${brand.border}`,
          marginBottom: '20px'
        }}
      >
        <div style={{ marginBottom: 10, fontSize: '13px', color: '#64748b' }}>Vorlage</div>
        <SelectInput
          value={selectedTemplate}
          onChange={(e) => {
            const selected = templates.find((t) => t.content === e.target.value);
            setSelectedTemplate(e.target.value);
            setTemplateStructure(selected?.structure || null);
          }}
        >
          <option value=''>Vorlage wählen</option>
          {templates.map((t) => (
            <option key={t.id} value={t.content}>
              {t.name}
            </option>
          ))}
        </SelectInput>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ marginBottom: 8, fontSize: '13px', color: '#64748b' }}>Arbeitsmodus</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant={quickMode ? 'primary' : 'secondary'}
            size='sm'
            onClick={() => {
              setQuickMode(true);
              setShowContext(false);
            }}
          >
            Schnellmodus
          </Button>

          <Button
            variant={!quickMode ? 'primary' : 'secondary'}
            size='sm'
            onClick={() => {
              setQuickMode(false);
              setShowContext(true);
            }}
          >
            Mit Kontext arbeiten
          </Button>

          {category === 'internal' && (
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Intern/SOP: Patientenkontext ist optional und standardmäßig nicht nötig.
            </div>
          )}
        </div>

        <Button
          onClick={() => setShowContext((v) => !v)}
          variant={showContext ? 'primary' : 'secondary'}
          style={{
            marginBottom: 8,
            color: showContext ? '#fff' : brand.primary
          }}
        >
          {showContext ? 'Kontext ausblenden' : 'Kontext hinzufügen (optional)'}
        </Button>

        {showContext && (
          <div
            style={{
              background: '#fff',
              border: `1px solid ${brand.border}`,
              borderRadius: 12,
              padding: 16,
              marginTop: 4,
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
            }}
          >
            <div
              style={{
                gridColumn: '1 / -1',
                border: '1px solid #e8edf1',
                borderRadius: '10px',
                padding: '12px',
                background: '#f9fbfc'
              }}
            >
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: '2px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Patientenbezug</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {formatPatientLabel(selectedPatient)}
                    </div>
                  </div>

                  {selectedPatientId && (
                    <Button
                      onClick={() => setSelectedPatientId(null)}
                      size='sm'
                      variant='secondary'
                      style={{ fontSize: '12px' }}
                    >
                      Zuordnung entfernen
                    </Button>
                  )}
                </div>

                {supportsPatientContext ? (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <Button
                        onClick={() => {
                          setShowPatientAssign(true);
                          setPatientAction('existing');
                        }}
                        size='sm'
                        variant={showPatientAssign && patientAction === 'existing' ? 'primary' : 'secondary'}
                        style={{
                          color: showPatientAssign && patientAction === 'existing' ? '#fff' : brand.primary,
                          fontSize: '12px'
                        }}
                      >
                        Patient suchen
                      </Button>

                      <Button
                        onClick={() => {
                          setShowPatientAssign(true);
                          setPatientAction('new');
                          if (patientSuggestion) {
                            setNewPatient((prev) => ({
                              ...prev,
                              name: patientSuggestion.name,
                              tierart: patientSuggestion.tierart || prev.tierart,
                              external_id: patientSuggestion.external_id || prev.external_id
                            }));
                          }
                        }}
                        size='sm'
                        variant={showPatientAssign && patientAction === 'new' ? 'primary' : 'secondary'}
                        style={{
                          color: showPatientAssign && patientAction === 'new' ? '#fff' : brand.primary,
                          fontSize: '12px'
                        }}
                      >
                        Neuen Patienten anlegen
                      </Button>

                      {showPatientAssign && (
                        <Button
                          onClick={() => setShowPatientAssign(false)}
                          size='sm'
                          variant='ghost'
                          style={{ fontSize: '12px' }}
                        >
                          Schließen
                        </Button>
                      )}

                      {patientSuggestion && (
                        <Button
                          onClick={() => {
                            setShowPatientAssign(true);
                            setPatientAction('new');
                            setNewPatient((prev) => ({
                              ...prev,
                              name: patientSuggestion.name,
                              tierart: patientSuggestion.tierart,
                              external_id: patientSuggestion.external_id
                            }));
                          }}
                          size='sm'
                          variant='secondary'
                          style={{ fontSize: '12px' }}
                        >
                          {patientSuggestion.label}
                        </Button>
                      )}
                    </div>

                    {showPatientAssign && (
                      patientAction === 'existing' ? (
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <Input
                            placeholder='Nach Name oder PMS-ID suchen'
                            value={patientSearch}
                            onChange={(e) => setPatientSearch(e.target.value)}
                          />

                          <div style={{ maxHeight: '220px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff' }}>
                            {filteredPatients.length === 0 ? (
                              <div style={{ padding: '10px', fontSize: '12px', color: '#6b7280' }}>Keine passenden Patienten gefunden.</div>
                            ) : (
                              filteredPatients.map((patient) => (
                                <Button
                                  key={patient.id}
                                  onClick={() => {
                                    setSelectedPatientId(patient.id);
                                    applyPatientToContext(patient);
                                    setShowPatientAssign(false);
                                  }}
                                  variant='ghost'
                                  size='sm'
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    borderBottom: '1px solid #f1f5f9',
                                    background: selectedPatientId === patient.id ? '#f1f8f9' : '#fff',
                                    justifyContent: 'flex-start'
                                  }}
                                >
                                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{formatPatientLabel(patient)}</div>
                                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                                    {patient.tierart || 'Tierart offen'}{patient.rasse ? ` · ${patient.rasse}` : ''}
                                  </div>
                                </Button>
                              ))
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                          <Input
                            label='Patientenname'
                            value={newPatient.name}
                            onChange={(e) => setNewPatient((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder='Name eingeben'
                          />

                          <SelectInput
                            label='Tierart (optional)'
                            value={newPatient.tierart}
                            onChange={(e) => setNewPatient((prev) => ({ ...prev, tierart: e.target.value }))}
                          >
                            <option value=''>-</option>
                            <option value='Hund'>Hund</option>
                            <option value='Katze'>Katze</option>
                            <option value='Heimtier'>Heimtier</option>
                          </SelectInput>

                          <div style={{ position: 'relative' }}>
                            <Input
                              label='Rasse (optional)'
                              value={newPatient.rasse}
                              onChange={(e) => setNewPatient((prev) => ({ ...prev, rasse: e.target.value }))}
                              placeholder='Rasse eingeben'
                            />
                            {newPatient.rasse.trim() && breedSuggestions.length > 0 && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  right: 0,
                                  marginTop: 4,
                                  background: '#fff',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 8,
                                  maxHeight: 140,
                                  overflow: 'auto',
                                  zIndex: 20
                                }}
                              >
                                {breedSuggestions.map((breed) => (
                                  <Button
                                    key={breed}
                                    onClick={() => setNewPatient((prev) => ({ ...prev, rasse: breed }))}
                                    variant='ghost'
                                    size='sm'
                                    style={{
                                      width: '100%',
                                      textAlign: 'left',
                                      background: '#fff',
                                      justifyContent: 'flex-start'
                                    }}
                                  >
                                    {breed}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>

                          <Input
                            label='Alter (optional)'
                            value={newPatient.alter}
                            onChange={(e) => setNewPatient((prev) => ({ ...prev, alter: e.target.value }))}
                            placeholder='z. B. 6 Jahre'
                          />

                          <SelectInput
                            label='Geschlecht (optional)'
                            value={newPatient.geschlecht}
                            onChange={(e) => setNewPatient((prev) => ({ ...prev, geschlecht: e.target.value }))}
                          >
                            <option value=''>-</option>
                            {genderOptions.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </SelectInput>

                          <Input
                            label='PMS-ID / external_id (optional)'
                            value={newPatient.external_id}
                            onChange={(e) => setNewPatient((prev) => ({ ...prev, external_id: e.target.value }))}
                            placeholder='Interne Kennung'
                          />

                          <Input
                            label='Besitzername (optional)'
                            value={newPatient.owner_name}
                            onChange={(e) => setNewPatient((prev) => ({ ...prev, owner_name: e.target.value }))}
                            placeholder='Name des Besitzers'
                          />

                          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                              onClick={createPatient}
                              disabled={savingPatient}
                              variant='primary'
                              style={{
                                background: brand.primary,
                                fontWeight: 600
                              }}
                            >
                              {savingPatient ? 'Speichert...' : 'Patient anlegen und zuordnen'}
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Für intern/SOP ist kein Patientenbezug erforderlich.
                  </div>
                )}
              </div>
            </div>

            {(contextFields[category] || []).map((field) => (
              <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>
                  {field.label}
                  {field.optional ? ' (optional)' : ''}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={contextData[field.key] || ''}
                    onChange={(e) => setContextData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  >
                    <option value=''>-</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={contextData[field.key] || ''}
                    onChange={(e) => setContextData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', minHeight: 40 }}
                  />
                ) : (
                  <input
                    type='text'
                    value={contextData[field.key] || ''}
                    onChange={(e) => setContextData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          background: '#fff',
          padding: '16px',
          borderRadius: '12px',
          border: `1px solid ${brand.border}`,
          marginBottom: '20px'
        }}
      >
        <div style={{ marginBottom: 10, fontSize: '13px', color: '#64748b' }}>Kontext-Dateien</div>
        <div
          onClick={() => fileInputRef.current?.click()}
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
            await processFiles(e.dataTransfer.files);
          }}
          style={{
            border: dragActive ? '2px dashed #0F6B74' : '1px dashed #cbd5e1',
            borderRadius: '12px',
            background: dragActive ? '#ecfeff' : '#f8fafc',
            padding: '14px',
            cursor: 'pointer',
            marginBottom: '12px',
            transition: 'all 0.16s ease'
          }}
        >
          <div style={{ fontWeight: 700, color: '#0f172a' }}>Dateien hier ablegen oder klicken</div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            PDF, Bilder oder Befunde werden analysiert und als Kontext hinzugefügt
          </div>

          <input
            ref={fileInputRef}
            type='file'
            accept='image/*,.pdf,text/plain,.txt'
            hidden
            multiple
            onChange={async (e) => {
              const inputEl = e.currentTarget;
              await processFiles(inputEl.files);
              inputEl.value = '';
            }}
          />

          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <Button variant='secondary' size='sm'>📎 Datei auswählen</Button>
            <Button variant='secondary' size='sm' onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>PDF / Bild / Befund</Button>
          </div>
        </div>

        {uploadedFiles.length > 0 && (
          <div style={{ display: 'grid', gap: '8px' }}>
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  background: '#fff',
                  padding: '10px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{file.name}</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <Badge tone={file.status === 'error' ? 'danger' : file.status === 'ready' ? 'success' : 'default'}>
                      {file.status === 'uploading' ? `${file.progress}%` : file.status === 'ready' ? 'Bereit' : 'Fehler'}
                    </Badge>
                    <Badge tone='accent'>{getFileBadge(file.type)}</Badge>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {formatFileSize(file.size)} · {new Date(file.uploadedAt).toLocaleString('de-DE')}
                </div>

                {file.status === 'uploading' && (
                  <div style={{ marginTop: '8px', height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${file.progress}%`, height: '100%', background: '#0F6B74' }} />
                  </div>
                )}

                {file.status === 'error' && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#b91c1c' }}>
                    Analyse fehlgeschlagen oder kein verwertbarer Text erkannt.
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <Button
                    variant='secondary'
                    size='sm'
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewFileId(file.id);
                    }}
                  >
                    👁 Vorschau
                  </Button>

                  <Button
                    variant='secondary'
                    size='sm'
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFileInContext(file.id);
                    }}
                    style={{ background: file.inContext ? '#eef6f7' : '#fff' }}
                  >
                    🧠 {file.inContext ? 'Im Kontext' : 'Nicht im Kontext'}
                  </Button>

                  <Button
                    variant='secondary'
                    size='sm'
                    onClick={(e) => {
                      e.stopPropagation();
                      removeUploadedFile(file.id);
                    }}
                    style={{ background: '#fff1f2', color: '#b91c1c' }}
                  >
                    🗑 Entfernen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {uploadedFiles.length === 0 && attachments.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '13px' }}>{attachments.length} Datei(en) im Legacy-Kontext</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Button
          onClick={generate}
          variant='primary'
          style={{
            padding: '12px',
            background: brand.primary,
            color: '#fff',
            fontWeight: 700
          }}
        >
          {loading ? '...' : '🧠 VetMind generieren'}
        </Button>

        <Button
          onClick={saveCase}
          disabled={saving}
          variant='secondary'
          style={{
            padding: '12px',
            background: '#fff',
            fontWeight: 600,
            color: '#111827'
          }}
        >
          {saving ? 'Speichert...' : '💾 Konsultation speichern'}
        </Button>

        <Button
          onClick={() => router.push(`/konsultation/${caseId}/live`)}
          variant='secondary'
          style={{
            padding: '12px',
            background: '#fff',
            fontWeight: 600,
            color: '#111827'
          }}
        >
          🎙 Live-Anamnese fortsetzen
        </Button>

        <Button
          onClick={() => router.push('/konsultation/start')}
          variant='secondary'
          style={{
            padding: '12px',
            background: '#fff',
            color: '#111827',
            fontWeight: 600
          }}
        >
          ➕ Neue Aufnahme
        </Button>
      </div>

      <div
        style={{
          background: '#fff',
          padding: '16px',
          borderRadius: '12px',
          border: `1px solid ${brand.border}`
        }}
      >
        <div style={{ marginBottom: '10px', fontSize: '13px', color: '#64748b' }}>Konsultationsbereich</div>
        <div
          style={{
            marginBottom: '12px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #e8edf1',
            background: '#f9fbfc',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}
        >
          <div style={{ fontSize: '13px', color: '#334155' }}>
            📄 Konsultation: {caseTitle || 'Unbenannt'}
            {' — '}
            {formatPatientLabel(selectedPatient)}
            {' — '}
            {formatSessionDateTime(sessionCreatedAt) || 'Datum offen'}
            {' — '}
            {formatDuration(totalDurationSeconds)} min
            {recording ? ' (läuft)' : ''}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              onClick={() => setShowTranscriptEditor((v) => !v)}
              variant='secondary'
              size='sm'
              style={{
                background: showTranscriptEditor ? '#eef6f7' : '#fff',
                fontSize: '12px'
              }}
            >
              📝 Transkript bearbeiten
            </Button>

            <Button
              onClick={recording ? stopRecording : startRecording}
              variant='secondary'
              size='sm'
              style={{
                background: recording ? '#fff1f2' : '#fff',
                fontSize: '12px'
              }}
            >
              {recording ? '⏹ Aufnahme stoppen' : '🎤 Weiter aufnehmen'}
            </Button>

            <Button
              onClick={() => recordingAudioUrl && window.open(recordingAudioUrl, '_blank', 'noopener,noreferrer')}
              disabled={!recordingAudioUrl}
              variant='secondary'
              size='sm'
              style={{
                background: '#fff',
                fontSize: '12px',
                opacity: recordingAudioUrl ? 1 : 0.6
              }}
            >
              🎧 Aufnahme anhören
            </Button>
          </div>
        </div>

        {showTranscriptEditor && (
          <div style={{ marginBottom: '12px' }}>
            <TextAreaInput
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder='Transkript hier bearbeiten...'
              style={{
                minHeight: '120px',
                resize: 'vertical',
                background: '#fff'
              }}
            />
          </div>
        )}

        <div
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => setResult(e.currentTarget.innerText)}
          style={{
            width: '100%',
            minHeight: '400px',
            border: '1px solid #E5E7EB',
            borderRadius: '10px',
            padding: '12px',
            whiteSpace: 'pre-wrap',
            background: '#fcfdff'
          }}
        >
          {result}
        </div>

        {result.trim() && <AiDisclaimer />}

        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginTop: '16px',
            flexWrap: 'wrap'
          }}
        >
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(result);
            }}
            variant='primary'
            size='lg'
            style={{
              background: '#1E6F73',
              color: '#fff'
            }}
          >
            📋 Kopieren
          </Button>

          <Button
            onClick={() => {
              const structuredCase = getStructuredCaseData();
              const payload = {
                source: 'konsultation-result',
                caseId,
                title: caseTitle,
                patient_id: selectedPatientId,
                patient: selectedPatient,
                patientName: structuredCase.patientName,
                external_id: selectedPatient?.external_id || contextData.external_id || '',
                tierart: structuredCase.tierart,
                rasse: structuredCase.rasse,
                alter: structuredCase.alter,
                geschlecht: structuredCase.geschlecht,
                additionalInfo: structuredCase.additionalInfo,
                result,
                transcript,
                contextData,
                attachments,
                attachmentFiles: uploadedFiles,
                category,
                notes: caseNotes,
                createdAt: new Date().toISOString()
              };

              localStorage.setItem(
                'vetmind_context',
                JSON.stringify(payload)
              );
              localStorage.setItem('activeCase', JSON.stringify(payload));
              localStorage.setItem('last_consultation_case_id', caseId);
              router.push('/vetmind');
            }}
            variant='secondary'
            size='lg'
            style={{
              background: '#fff',
              fontWeight: 600
            }}
          >
            🤖 In VetMind öffnen
          </Button>

          <Button
            onClick={shareText}
            variant='secondary'
            size='lg'
            style={{
              background: '#fff',
              color: '#111827',
              fontWeight: 600
            }}
          >
            📤 Teilen
          </Button>

          {shareMenuOpen && (
            <div
              ref={shareMenuRef}
              style={{
                position: 'relative'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-4px',
                  left: 0,
                  transform: 'translateY(-100%)',
                  minWidth: '240px',
                  background: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                  padding: '6px',
                  zIndex: 20
                }}
              >
                <Button
                  onClick={downloadPdf}
                  variant='ghost'
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    background: '#fff'
                  }}
                >
                  📄 Als PDF herunterladen
                </Button>

                <Button
                  onClick={copyResultText}
                  variant='ghost'
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    background: '#fff'
                  }}
                >
                  📋 Text kopieren
                </Button>

                <Button
                  onClick={openEmailClient}
                  variant='ghost'
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    background: '#fff'
                  }}
                >
                  📧 Per E-Mail öffnen
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {previewFile && (
        <div
          onClick={() => setPreviewFileId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 160
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(780px, calc(100vw - 24px))',
              maxHeight: '80vh',
              overflow: 'auto',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '14px',
              padding: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ fontWeight: 700 }}>{previewFile.name}</div>
              <Button variant='ghost' onClick={() => setPreviewFileId(null)}>✕</Button>
            </div>

            {previewFile.previewUrl && (
              <img
                src={previewFile.previewUrl}
                alt={previewFile.name}
                style={{ width: '100%', maxHeight: '320px', objectFit: 'contain', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '10px' }}
              />
            )}

            <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', color: '#1f2937', lineHeight: 1.5 }}>
              {previewFile.extractedText || 'Kein extrahierter Text verfügbar.'}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
