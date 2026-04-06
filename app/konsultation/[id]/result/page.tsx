'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { generatePDF } from '../../../../lib/pdfReport';
import { searchBreeds } from '../../../../lib/patientBreeds';

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
  const [caseNotes, setCaseNotes] = useState('');
  const [caseTitle, setCaseTitle] = useState('');
  const [category, setCategory] = useState('clinical');
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

  const buildCombinedInput = () => {
    let contextBlock = '';
    const fields = contextFields[category] || [];
    const filled = fields.filter((f) => contextData[f.key]);

    if (filled.length > 0) {
      contextBlock = `KONTEXT:\n${filled.map((f) => `${f.label}: ${contextData[f.key]}`).join('\n')}\n\n`;
    }

    let combined = '';
    if (contextBlock) combined += contextBlock;
    if (caseNotes) combined += `VORINFORMATIONEN:\n${caseNotes}\n\n`;

    // Always use transcript as source for generation; never reuse generated result as source.
    combined += transcript;

    if (attachments.length > 0) {
      combined += `\n\nZUSÄTZLICHE BEFUNDE:\n${attachments.join('\n\n')}`;
    }

    return combined.trim();
  };

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
    if (!transcript.trim() && attachments.length === 0 && !caseNotes.trim()) {
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
      const storedContext = localStorage.getItem(`${autosavePrefix}context`);
      const storedAttachments = localStorage.getItem(`${autosavePrefix}attachments`);
      const storedNotes = localStorage.getItem(`${autosavePrefix}notes`);
      const storedRecordingSession = localStorage.getItem(`${autosavePrefix}recording_session`);

      if (storedTranscript !== null) setTranscript(storedTranscript);
      if (storedResult !== null) setResult(storedResult);
      if (storedTemplate !== null) setSelectedTemplate(storedTemplate);
      if (storedCategory) setCategory(normalizeCategory(storedCategory));
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
      if (storedNotes !== null) setCaseNotes(storedNotes);
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
        if (data.patient_id) setSelectedPatientId(data.patient_id);
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
          if (!storedCategory && parsed.category) setCategory(normalizeCategory(parsed.category));
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
    localStorage.setItem(`${autosavePrefix}context`, JSON.stringify(contextData || {}));
  }, [autosavePrefix, contextData]);

  useEffect(() => {
    localStorage.setItem(`${autosavePrefix}attachments`, JSON.stringify(attachments || []));
  }, [autosavePrefix, attachments]);

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
        category,
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
  }, [caseId, caseTitle, contextData, result, transcript, attachments, category, selectedTemplate, caseNotes, totalDurationSeconds, sessionCreatedAt, recordingAudioUrl, selectedPatientId, selectedPatient]);

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
    if (!newPatient.name.trim()) {
      alert('Bitte einen Patientennamen angeben.');
      return;
    }

    setSavingPatient(true);
    try {
      const payload = {
        name: newPatient.name.trim(),
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

  const saveCase = async () => {
    if (!caseId) {
      alert('Keine Fall-ID gefunden.');
      return;
    }

    setSaving(true);
    try {
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
        transcript,
        result,
        template: selectedTemplate || null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('cases')
        .update(payload)
        .eq('id', caseId);

      if (error) throw error;

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
          category,
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
    } catch (err) {
      console.error(err);
      alert('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: brand.bg,
        padding: '40px',
        fontFamily: 'Arial'
      }}
    >
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        {['clinical', 'communication', 'internal'].map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setCategory(cat);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              background: category === cat ? '#0F6B74' : '#fff',
              color: category === cat ? '#fff' : '#000',
              cursor: 'pointer'
            }}
          >
            {categoryLabels[cat]}
          </button>
        ))}
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
        <select
          value={selectedTemplate}
          onChange={(e) => {
            const selected = templates.find((t) => t.content === e.target.value);
            setSelectedTemplate(e.target.value);
            setTemplateStructure(selected?.structure || null);
          }}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '10px',
            border: `1px solid ${brand.border}`
          }}
        >
          <option value=''>Vorlage wählen</option>
          {templates.map((t) => (
            <option key={t.id} value={t.content}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 18 }}>
        <button
          onClick={() => setShowContext((v) => !v)}
          style={{
            background: showContext ? brand.primary : '#fff',
            color: showContext ? '#fff' : brand.primary,
            border: `1px solid ${brand.primary}`,
            borderRadius: 10,
            padding: '8px 18px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 8
          }}
        >
          {showContext ? 'Kontext ausblenden' : 'Kontext hinzufügen (optional)'}
        </button>

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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => setShowPatientAssign((v) => !v)}
                  style={{
                    border: `1px solid ${brand.primary}`,
                    borderRadius: '8px',
                    background: showPatientAssign ? brand.primary : '#fff',
                    color: showPatientAssign ? '#fff' : brand.primary,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px'
                  }}
                >
                  {showPatientAssign ? 'Patienten-Auswahl schließen' : 'Patient zuordnen'}
                </button>

                <div style={{ fontSize: '12px', color: '#475569' }}>
                  {formatPatientLabel(selectedPatient)}
                </div>

                {selectedPatientId && (
                  <button
                    onClick={() => setSelectedPatientId(null)}
                    style={{
                      border: '1px solid #d1dbe4',
                      borderRadius: '8px',
                      background: '#fff',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Zuordnung entfernen
                  </button>
                )}
              </div>

              {showPatientAssign && (
                <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setPatientAction('existing')}
                      style={{
                        border: '1px solid #d1dbe4',
                        borderRadius: '8px',
                        background: patientAction === 'existing' ? '#eef6f7' : '#fff',
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Bestehenden Patienten auswählen
                    </button>

                    <button
                      onClick={() => {
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
                      style={{
                        border: '1px solid #d1dbe4',
                        borderRadius: '8px',
                        background: patientAction === 'new' ? '#eef6f7' : '#fff',
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Neuen Patienten anlegen
                    </button>

                    {patientSuggestion && (
                      <button
                        onClick={() => {
                          setPatientAction('new');
                          setNewPatient((prev) => ({
                            ...prev,
                            name: patientSuggestion.name,
                            tierart: patientSuggestion.tierart,
                            external_id: patientSuggestion.external_id
                          }));
                        }}
                        style={{
                          border: '1px dashed #94a3b8',
                          borderRadius: '8px',
                          background: '#fff',
                          padding: '6px 10px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        {patientSuggestion.label}
                      </button>
                    )}
                  </div>

                  {patientAction === 'existing' ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <input
                        type='text'
                        placeholder='Nach Name oder PMS-ID suchen'
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />

                      <div style={{ maxHeight: '180px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                        {filteredPatients.length === 0 ? (
                          <div style={{ padding: '10px', fontSize: '12px', color: '#6b7280' }}>Keine passenden Patienten gefunden.</div>
                        ) : (
                          filteredPatients.map((patient) => (
                            <button
                              key={patient.id}
                              onClick={() => {
                                setSelectedPatientId(patient.id);
                                applyPatientToContext(patient);
                                setShowPatientAssign(false);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px',
                                border: 'none',
                                borderBottom: '1px solid #f1f5f9',
                                background: selectedPatientId === patient.id ? '#f1f8f9' : '#fff',
                                cursor: 'pointer'
                              }}
                            >
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>{formatPatientLabel(patient)}</div>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                {patient.tierart || 'Tierart offen'}{patient.rasse ? ` · ${patient.rasse}` : ''}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                      <input
                        type='text'
                        value={newPatient.name}
                        onChange={(e) => setNewPatient((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder='Name *'
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />

                      <select
                        value={newPatient.tierart}
                        onChange={(e) => setNewPatient((prev) => ({ ...prev, tierart: e.target.value }))}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      >
                        <option value=''>Tierart (optional)</option>
                        <option value='Hund'>Hund</option>
                        <option value='Katze'>Katze</option>
                        <option value='Heimtier'>Heimtier</option>
                      </select>

                      <div style={{ position: 'relative' }}>
                        <input
                          type='text'
                          value={newPatient.rasse}
                          onChange={(e) => setNewPatient((prev) => ({ ...prev, rasse: e.target.value }))}
                          placeholder='Rasse (Autocomplete, optional)'
                          style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
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
                              <button
                                key={breed}
                                onClick={() => setNewPatient((prev) => ({ ...prev, rasse: breed }))}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  border: 'none',
                                  background: '#fff',
                                  padding: '8px 10px',
                                  cursor: 'pointer'
                                }}
                              >
                                {breed}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <input
                        type='text'
                        value={newPatient.alter}
                        onChange={(e) => setNewPatient((prev) => ({ ...prev, alter: e.target.value }))}
                        placeholder='Alter (optional)'
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />

                      <select
                        value={newPatient.geschlecht}
                        onChange={(e) => setNewPatient((prev) => ({ ...prev, geschlecht: e.target.value }))}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      >
                        <option value=''>Geschlecht (optional)</option>
                        {genderOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>

                      <input
                        type='text'
                        value={newPatient.external_id}
                        onChange={(e) => setNewPatient((prev) => ({ ...prev, external_id: e.target.value }))}
                        placeholder='PMS-ID / external_id (optional)'
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />

                      <input
                        type='text'
                        value={newPatient.owner_name}
                        onChange={(e) => setNewPatient((prev) => ({ ...prev, owner_name: e.target.value }))}
                        placeholder='Besitzername (optional)'
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />

                      <button
                        onClick={createPatient}
                        disabled={savingPatient}
                        style={{
                          border: 'none',
                          borderRadius: 8,
                          background: brand.primary,
                          color: '#fff',
                          padding: '8px 12px',
                          cursor: savingPatient ? 'wait' : 'pointer',
                          fontWeight: 600
                        }}
                      >
                        {savingPatient ? 'Speichert...' : 'Patient anlegen und zuordnen'}
                      </button>
                    </div>
                  )}
                </div>
              )}
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
        <label style={{ cursor: 'pointer' }}>
          📎 Datei hinzufügen
          <input
            type='file'
            hidden
            onChange={async (e) => {
              const inputEl = e.currentTarget;
              const file = inputEl.files?.[0];
              if (!file) return;

              const formData = new FormData();
              formData.append('file', file);

              try {
                const res = await fetch('/api/analyze-image', {
                  method: 'POST',
                  body: formData
                });
                const data = await res.json();
                const extracted = data?.result || data?.text || '';
                if (extracted) {
                  setAttachments((prev) => [...prev, extracted]);
                } else {
                  alert('Datei wurde hochgeladen, aber es konnte kein Text extrahiert werden.');
                }
              } catch (err) {
                console.error(err);
                alert('Fehler bei Dateianalyse');
              } finally {
                inputEl.value = '';
              }
            }}
          />
        </label>

        {attachments.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '13px' }}>{attachments.length} Datei(en) hinzugefügt</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={generate}
          style={{
            padding: '12px',
            background: brand.primary,
            color: '#fff',
            borderRadius: '10px',
            border: 'none'
          }}
        >
          {loading ? '...' : '🧠 Generieren'}
        </button>

        <button
          onClick={saveCase}
          disabled={saving}
          style={{
            padding: '12px',
            background: '#fff',
            color: '#111827',
            borderRadius: '10px',
            border: '1px solid #E5E7EB',
            fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer'
          }}
        >
          {saving ? 'Speichert...' : '💾 Konsultation speichern'}
        </button>

        <button
          onClick={() => router.push('/konsultation/start')}
          style={{
            padding: '12px',
            background: '#fff',
            color: '#111827',
            borderRadius: '10px',
            border: '1px solid #E5E7EB',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          ➕ Neue Aufnahme
        </button>
      </div>

      <div
        style={{
          background: '#fff',
          padding: '16px',
          borderRadius: '12px',
          border: `1px solid ${brand.border}`
        }}
      >
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
            🧠 Konsultation: {caseTitle || 'Unbenannt'}
            {' — '}
            {formatPatientLabel(selectedPatient)}
            {' — '}
            {formatSessionDateTime(sessionCreatedAt) || 'Datum offen'}
            {' — '}
            {formatDuration(totalDurationSeconds)} min
            {recording ? ' (läuft)' : ''}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowTranscriptEditor((v) => !v)}
              style={{
                border: '1px solid #d1dbe4',
                borderRadius: '8px',
                background: showTranscriptEditor ? '#eef6f7' : '#fff',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              📝 Transkript bearbeiten
            </button>

            <button
              onClick={recording ? stopRecording : startRecording}
              style={{
                border: '1px solid #d1dbe4',
                borderRadius: '8px',
                background: recording ? '#fff1f2' : '#fff',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              {recording ? '⏹ Aufnahme stoppen' : '🎤 Weiter aufnehmen'}
            </button>

            <button
              onClick={() => recordingAudioUrl && window.open(recordingAudioUrl, '_blank', 'noopener,noreferrer')}
              disabled={!recordingAudioUrl}
              style={{
                border: '1px solid #d1dbe4',
                borderRadius: '8px',
                background: '#fff',
                padding: '6px 10px',
                cursor: recordingAudioUrl ? 'pointer' : 'not-allowed',
                fontSize: '12px',
                opacity: recordingAudioUrl ? 1 : 0.6
              }}
            >
              🎧 Aufnahme anhören
            </button>
          </div>
        </div>

        {showTranscriptEditor && (
          <div style={{ marginBottom: '12px' }}>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder='Transkript hier bearbeiten...'
              style={{
                width: '100%',
                minHeight: '120px',
                border: '1px solid #E5E7EB',
                borderRadius: '10px',
                padding: '10px',
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
            whiteSpace: 'pre-wrap'
          }}
        >
          {result}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginTop: '16px',
            flexWrap: 'wrap'
          }}
        >
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(result);
            }}
            style={{
              padding: '14px 24px',
              borderRadius: '16px',
              background: '#1E6F73',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            📋 Kopieren
          </button>

          <button
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
            style={{
              padding: '14px 24px',
              borderRadius: '16px',
              background: '#fff',
              border: '1px solid #E5E7EB',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🤖 In VetMind öffnen
          </button>

          <button
            onClick={shareText}
            style={{
              padding: '14px 24px',
              borderRadius: '16px',
              background: '#fff',
              border: '1px solid #E5E7EB',
              color: '#111827',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            📤 Teilen
          </button>

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
                <button
                  onClick={downloadPdf}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  📄 Als PDF herunterladen
                </button>

                <button
                  onClick={copyResultText}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  📋 Text kopieren
                </button>

                <button
                  onClick={openEmailClient}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  📧 Per E-Mail öffnen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
