'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { uiTokens } from '../../../../components/ui/System';
import {
  ANAMNESIS_TEMPLATES,
  ANAMNESIS_TEMPLATE_META,
  AnamnesisQuestion,
  extractFinalNotes,
  TemplateKey,
  TEMPLATE_KEYS,
  EMPTY_ANALYSIS,
  formatAnalysisNarrative,
  formatAnalysisForCaseResult,
  LiveAnamnesisAnalysis,
  normalizeAnalysis,
} from '../../../../lib/liveAnamnesis';

const CHUNK_MS = 7000;
const ANALYSIS_TICK_MS = 3000;
const ANALYSIS_FORCED_REFRESH_MS = 20000;
const ANALYSIS_MIN_INTERVAL_MS = 4000;
const AUTOSAVE_INTERVAL_MS = 60000;
const ANALYSIS_MIN_TRANSCRIPT_CHARS = 20;
const ANALYSIS_MIN_DELTA_CHARS = 30;
const TRANSCRIBE_TIMEOUT_MS = 25000;
const MAX_VISIBLE_OPEN_QUESTIONS = 6;
const MAX_QUESTION_HISTORY = 60;
const MAX_TRANSCRIBE_BATCH_SEGMENTS = 2;
const FINALIZE_QUEUE_TIMEOUT_MS = 60000;

type LiveQuestionItem = {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  key?: string;
  reason?: string;
  checked: boolean;
  irrelevant: boolean;
  createdAt: number;
};

const normalizeQuestion = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const areQuestionsSimilar = (a: string, b: string) => {
  const na = normalizeQuestion(a);
  const nb = normalizeQuestion(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const tokensA = na.split(' ').filter((token) => token.length > 2);
  const tokensB = nb.split(' ').filter((token) => token.length > 2);
  if (!tokensA.length || !tokensB.length) return false;

  const setA = new Set(tokensA);
  const overlap = tokensB.filter((token) => setA.has(token)).length;
  const minLen = Math.min(tokensA.length, tokensB.length);
  return minLen > 0 && overlap / minLen >= 0.7;
};

const priorityWeight: Record<LiveQuestionItem['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const CHIEF_COMPLAINT_OPTIONS = [
  ...TEMPLATE_KEYS.map((key) => ({ value: key, label: ANAMNESIS_TEMPLATE_META[key].label })),
];

export default function LiveAnamnesisPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const caseId = String(params.id || '');

  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('Bereit für Live-Anamnese');
  const [transcript, setTranscript] = useState('');
  const [analysis, setAnalysis] = useState<LiveAnamnesisAnalysis>(EMPTY_ANALYSIS);
  const [questions, setQuestions] = useState<LiveQuestionItem[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [chiefComplaint, setChiefComplaint] = useState(searchParams.get('complaint') || 'allgemein');
  const [templateOverride, setTemplateOverride] = useState<'auto' | TemplateKey>('auto');
  const [finalizing, setFinalizing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showSavedHint, setShowSavedHint] = useState(false);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingElapsed, setRecordingElapsed] = useState('');
  const [transcribeStats, setTranscribeStats] = useState({
    received: 0,
    success: 0,
    empty: 0,
    failed: 0,
    lastSuccessAt: null as string | null,
  });

  const transcriptRef = useRef(transcript);
  const queueRef = useRef<Blob[]>([]);
  const processingQueueRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentStopTimeoutRef = useRef<number | null>(null);
  const recordingActiveRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const lastAnalyzedRef = useRef('');
  const lastAnalyzedLengthRef = useRef(0);
  const lastAnalyzedAtRef = useRef(0);
  const analysisInFlightRef = useRef(false);
  const analysisStateRef = useRef(analysis.state);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const refillCheckpointRef = useRef(0);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    analysisStateRef.current = analysis.state;
  }, [analysis.state]);

  // Recording duration timer
  useEffect(() => {
    if (!recordingStartedAt) { setRecordingElapsed(''); return; }
    const tick = () => {
      const secs = Math.floor((Date.now() - recordingStartedAt) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setRecordingElapsed(`${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [recordingStartedAt]);

  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript]);

  const checkedCount = useMemo(() => questions.filter((question) => question.checked).length, [questions]);
  const openQuestionCount = useMemo(
    () => questions.filter((question) => !question.checked && !question.irrelevant).length,
    [questions],
  );
  const visibleQuestions = useMemo(() => {
    const open = questions
      .filter((question) => !question.checked && !question.irrelevant)
      .sort((a, b) => {
        const byPriority = priorityWeight[a.priority] - priorityWeight[b.priority];
        if (byPriority !== 0) return byPriority;
        return b.createdAt - a.createdAt;
      })
      .slice(0, MAX_VISIBLE_OPEN_QUESTIONS);
    const done = questions
      .filter((question) => question.checked || question.irrelevant)
      .sort((a, b) => b.createdAt - a.createdAt);
    return [...open, ...done];
  }, [questions]);

  const askedQuestions = useMemo(
    () => questions.filter((question) => question.checked || question.irrelevant).map((question) => question.text),
    [questions],
  );

  const existingOpenQuestions = useMemo(
    () => questions.filter((question) => !question.checked && !question.irrelevant).map((question) => question.text),
    [questions],
  );

  const askedQuestionKeys = useMemo(
    () => questions
      .filter((question) => (question.checked || question.irrelevant) && typeof question.key === 'string' && question.key.trim())
      .map((question) => String(question.key).trim()),
    [questions],
  );

  const existingOpenQuestionKeys = useMemo(
    () => questions
      .filter((question) => !question.checked && !question.irrelevant && typeof question.key === 'string' && question.key.trim())
      .map((question) => String(question.key).trim()),
    [questions],
  );

  const missingStateFields = useMemo(
    () => Object.entries(analysis.state).filter(([, entry]) => entry.status === 'missing').map(([key]) => key),
    [analysis.state],
  );

  const unclearStateFields = useMemo(
    () => Object.entries(analysis.state).filter(([, entry]) => entry.status === 'unclear').map(([key]) => key),
    [analysis.state],
  );

  const transcriptionStalled = useMemo(() => {
    if (!recording) return false;
    if (!transcribeStats.received) return false;
    if (!transcribeStats.lastSuccessAt) return transcribeStats.received >= 3;
    const delta = Date.now() - new Date(transcribeStats.lastSuccessAt).getTime();
    return delta > 30000;
  }, [recording, transcribeStats.lastSuccessAt, transcribeStats.received]);

  const narrativeAnamnesis = useMemo(
    () => formatAnalysisNarrative(analysis, { includeMissing: false, omitFieldKeys: ['vorerkrankungen', 'medikation'] }),
    [analysis],
  );
  const finalNotes = useMemo(() => extractFinalNotes(analysis), [analysis]);

  const mergeIncomingQuestions = useCallback((incoming: AnamnesisQuestion[]) => {
    setQuestions((prev) => {
      const next = [...prev];

      for (const rawQuestion of incoming) {
        const text = rawQuestion.text.trim();
        if (!text) continue;

        const key = typeof rawQuestion.key === 'string' ? rawQuestion.key.trim() : '';
        const duplicateByKey = key ? next.some((existing) => (existing.key || '').trim() === key) : false;
        const duplicateByText = next.some((existing) => areQuestionsSimilar(existing.text, text));
        if (duplicateByKey || duplicateByText) continue;

        next.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          text,
          priority: rawQuestion.priority || 'medium',
          category: rawQuestion.category || 'allgemein',
          key: key || undefined,
          reason: rawQuestion.reason,
          checked: false,
          irrelevant: false,
          createdAt: Date.now(),
        });
      }

      if (next.length > MAX_QUESTION_HISTORY) {
        const unchecked = next.filter((question) => !question.checked);
        const checked = next.filter((question) => question.checked);
        const trimmedChecked = checked.slice(Math.max(0, checked.length - (MAX_QUESTION_HISTORY - unchecked.length)));
        return [...unchecked, ...trimmedChecked].slice(0, MAX_QUESTION_HISTORY);
      }

      return next;
    });
  }, []);

  useEffect(() => {
    setQuestions((prev) => prev.map((question) => {
      if (question.checked || question.irrelevant) return question;
      const key = (question.key || '').trim();
      if (!key) return question;
      const status = analysis.state[key]?.status;
      if (status !== 'known') return question;
      return { ...question, checked: true };
    }));
  }, [analysis.state]);

  const toggleQuestionChecked = (id: string) => {
    setQuestions((prev) => prev.map((question) => (
      question.id === id ? { ...question, checked: !question.checked } : question
    )));
  };

  const toggleQuestionIrrelevant = (id: string) => {
    setQuestions((prev) => prev.map((question) => (
      question.id === id
        ? { ...question, irrelevant: !question.irrelevant, checked: question.irrelevant ? question.checked : false }
        : question
    )));
  };

  const setQueueWithCount = (next: Blob[]) => {
    queueRef.current = next;
    setQueueSize(next.length);
  };

  const transcribeBlob = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', blob, `live-${Date.now()}.webm`);
      formData.append('mode', 'live');

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      }).finally(() => window.clearTimeout(timeout));

      const contentType = res.headers.get('content-type') || '';
      const json = contentType.includes('application/json') ? await res.json() : null;

      if (!res.ok) {
        const apiMessage =
          (json && typeof json.error === 'string' && json.error) ||
          `Transkription fehlgeschlagen (HTTP ${res.status})`;
        console.warn('Live transcribe chunk failed:', apiMessage);
        return '';
      }

      return (json?.text || '').trim();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Live transkribieren: Zeitüberschreitung, Abschnitt wird übersprungen');
        return '';
      }
      console.error('Live transcribe request failed:', error);
      return '';
    }
  };

  const processQueue = async () => {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;

    try {
      while (queueRef.current.length > 0) {
        const batch = queueRef.current.splice(0, MAX_TRANSCRIBE_BATCH_SEGMENTS);
        setQueueWithCount([...queueRef.current]);

        const mergedBlob = new Blob(batch, { type: 'audio/webm' });

        try {
          let text = await transcribeBlob(mergedBlob);

          // If a merged batch yields no text, retry each chunk to avoid losing an entire conversation segment.
          if (!text && batch.length > 1) {
            const parts: string[] = [];
            for (const chunk of batch) {
              const chunkText = await transcribeBlob(chunk);
              if (chunkText) parts.push(chunkText);
            }
            text = parts.join('\n\n').trim();
          }

          if (text) {
            setTranscript((prev) => (prev ? `${prev}\n\n${text}` : text));
            setStatus('Live-Anamnese läuft');
            setTranscribeStats((prev) => ({
              ...prev,
              success: prev.success + 1,
              lastSuccessAt: new Date().toISOString(),
            }));
            continue;
          }

          setStatus('Audio erkannt, warte auf nächsten verwertbaren Abschnitt ...');
          setTranscribeStats((prev) => ({ ...prev, empty: prev.empty + 1 }));
        } catch (error) {
          console.error(error);
          setStatus('Transkription teilweise fehlgeschlagen, Aufnahme läuft weiter');
          setTranscribeStats((prev) => ({ ...prev, failed: prev.failed + 1 }));
        }
      }
    } finally {
      processingQueueRef.current = false;
    }
  };

  const enqueueChunk = (blob: Blob) => {
    if (!blob || blob.size === 0) return;
    setTranscribeStats((prev) => ({ ...prev, received: prev.received + 1 }));
    const next = [...queueRef.current, blob];
    setQueueWithCount(next);
    processQueue().catch((error) => {
      console.error(error);
      setStatus('Fehler in der Transkriptions-Warteschlange');
    });
  };

  const runAnalysis = useCallback(async (options?: { force?: boolean }) => {
    if (analysisInFlightRef.current) return;

    const currentTranscript = transcriptRef.current.trim();
    const shouldForce = Boolean(options?.force);

    if (!currentTranscript) return;
    if (currentTranscript.length < ANALYSIS_MIN_TRANSCRIPT_CHARS && !shouldForce) return;
    if (!shouldForce && currentTranscript.length - lastAnalyzedLengthRef.current < ANALYSIS_MIN_DELTA_CHARS) return;
    if (currentTranscript === lastAnalyzedRef.current && !shouldForce) return;
    if (Date.now() - lastAnalyzedAtRef.current < ANALYSIS_MIN_INTERVAL_MS) return;

    analysisInFlightRef.current = true;
    setAnalysisRunning(true);
    setAnalysisError(null);

    try {
      const res = await fetch('/api/anamnesis/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: currentTranscript,
          chiefComplaint,
          templateOverride: templateOverride === 'auto' ? null : templateOverride,
          currentState: analysisStateRef.current,
          askedQuestions,
          existingOpenQuestions,
          askedQuestionKeys,
          existingOpenQuestionKeys,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      const json = contentType.includes('application/json')
        ? ((await res.json()) as Partial<LiveAnamnesisAnalysis> & { error?: string; analyzedAt?: string })
        : ({} as Partial<LiveAnamnesisAnalysis> & { error?: string; analyzedAt?: string });

      if (!res.ok) {
        const message = json.error || 'Analyse fehlgeschlagen';
        if (res.status === 400 && message.toLowerCase().includes('transcript fehlt')) {
          return;
        }
        setAnalysisError(message);
        return;
      }

      const normalized = normalizeAnalysis(json);
      setAnalysis(normalized);
      mergeIncomingQuestions(normalized.nextQuestions);
      setLastAnalyzedAt(typeof json.analyzedAt === 'string' ? json.analyzedAt : new Date().toISOString());

      lastAnalyzedRef.current = currentTranscript;
      lastAnalyzedLengthRef.current = currentTranscript.length;
      lastAnalyzedAtRef.current = Date.now();
    } catch (error) {
      console.error(error);
      setAnalysisError(error instanceof Error ? error.message : 'Analyse nicht verfügbar');
    } finally {
      analysisInFlightRef.current = false;
      setAnalysisRunning(false);
    }
  }, [
    askedQuestionKeys,
    askedQuestions,
    chiefComplaint,
    existingOpenQuestionKeys,
    existingOpenQuestions,
    mergeIncomingQuestions,
    templateOverride,
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      runAnalysis().catch((error) => {
        console.error(error);
      });
    }, ANALYSIS_TICK_MS);

    return () => window.clearInterval(interval);
  }, [runAnalysis]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!recording) return;
      runAnalysis({ force: true }).catch((error) => {
        console.error(error);
      });
    }, ANALYSIS_FORCED_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [recording, runAnalysis]);

  useEffect(() => {
    const needsRefill = openQuestionCount < MAX_VISIBLE_OPEN_QUESTIONS;
    const completedSinceCheckpoint = checkedCount - refillCheckpointRef.current;
    const reachedRefillThreshold = completedSinceCheckpoint >= 3;
    if (!needsRefill && !reachedRefillThreshold) return;

    if (analysis.isComplete) return;

    refillCheckpointRef.current = checkedCount;
    runAnalysis({ force: true }).catch((error) => {
      console.error(error);
    });
  }, [analysis.isComplete, checkedCount, openQuestionCount, runAnalysis]);

  // Auto-save during recording to prevent data loss
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      persistLiveResult().then(() => {
        setLastSavedAt(new Date().toISOString());
      }).catch((err) => {
        console.warn('Auto-save fehlgeschlagen:', err);
      });
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const stopTracks = () => {
    if (segmentStopTimeoutRef.current) {
      window.clearTimeout(segmentStopTimeoutRef.current);
      segmentStopTimeoutRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      setStatus('Mikrofon wird initialisiert ...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const scheduleSegmentStop = (recorder: MediaRecorder) => {
        if (segmentStopTimeoutRef.current) {
          window.clearTimeout(segmentStopTimeoutRef.current);
        }
        segmentStopTimeoutRef.current = window.setTimeout(() => {
          if (recordingActiveRef.current && recorder.state === 'recording') {
            try {
              recorder.stop();
            } catch {
              // Ignore stop timing issues.
            }
          }
        }, CHUNK_MS);
      };

      const createSegmentRecorder = (activeStream: MediaStream) => {
        const supportsOpus =
          typeof MediaRecorder !== 'undefined' &&
          typeof MediaRecorder.isTypeSupported === 'function' &&
          MediaRecorder.isTypeSupported('audio/webm;codecs=opus');

        const recorder = supportsOpus
          ? new MediaRecorder(activeStream, { mimeType: 'audio/webm;codecs=opus' })
          : new MediaRecorder(activeStream);

        recorder.ondataavailable = (event) => {
          if (event.data?.size) {
            enqueueChunk(event.data);
          }
        };

        recorder.onstop = () => {
          if (!recordingActiveRef.current) {
            setRecording(false);
            stopTracks();
            return;
          }

          try {
            const nextRecorder = createSegmentRecorder(activeStream);
            mediaRecorderRef.current = nextRecorder;
            nextRecorder.start();
            scheduleSegmentStop(nextRecorder);
          } catch (error) {
            console.error(error);
            recordingActiveRef.current = false;
            setRecording(false);
            setStatus('Aufnahme konnte nicht fortgesetzt werden');
            stopTracks();
          }
        };

        return recorder;
      };

      recordingActiveRef.current = true;
      setTranscribeStats({ received: 0, success: 0, empty: 0, failed: 0, lastSuccessAt: null });

      const recorder = createSegmentRecorder(stream);

      mediaRecorderRef.current = recorder;
      recorder.start();
      scheduleSegmentStop(recorder);

      setRecording(true);
      setRecordingStartedAt(Date.now());
      setStatus('Live-Anamnese läuft');
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setStatus('Mikrofonzugriff verweigert – bitte in den Browser-Einstellungen erlauben');
      } else if (msg.includes('NotFound')) {
        setStatus('Kein Mikrofon gefunden – bitte ein Mikrofon anschließen');
      } else {
        setStatus('Mikrofonzugriff nicht möglich – bitte Berechtigung prüfen');
      }
    }
  };

  const waitForQueueDrain = async (timeoutMs: number) => {
    const started = Date.now();
    while (
      (queueRef.current.length > 0 || processingQueueRef.current) &&
      Date.now() - started < timeoutMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  };

  const waitForRecorderStop = async (timeoutMs: number) => {
    const started = Date.now();
    while (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive' &&
      Date.now() - started < timeoutMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  const persistLiveResult = async () => {
    const structuredText = formatAnalysisForCaseResult(analysis);
    const safeTranscript = transcriptRef.current.trim();
    const payload = {
      transcript: safeTranscript,
      result: structuredText,
      status: 'draft',
      source: 'live',
      analysis_json: analysis,
    };

    const { error } = await supabase.from('cases').update(payload).eq('id', caseId);
    if (error) {
      throw new Error(error.message || 'Speichern fehlgeschlagen');
    }

    const snapshot = {
      caseId,
      transcript: safeTranscript,
      analysis,
      chiefComplaint,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(`case_${caseId}_live_anamnesis`, JSON.stringify(snapshot));
    localStorage.setItem(`case_${caseId}_autosave_transcript`, safeTranscript);
    localStorage.setItem(`case_${caseId}_autosave_result`, structuredText);
    localStorage.setItem(
      `case_${caseId}_anamnesis_handoff`,
      JSON.stringify({
        caseId,
        transcript: safeTranscript,
        result: structuredText,
        source: 'live',
        updatedAt: new Date().toISOString(),
      }),
    );
    localStorage.setItem('consultation_result', safeTranscript);
  };

  const goToDocumentation = async () => {
    if (finalizing) return;
    if (recording || queueRef.current.length > 0 || processingQueueRef.current) {
      await stopRecordingAndSave();
    }

    router.push(`/konsultation/${caseId}/result?source=live`);
  };

  const stopRecordingAndSave = async () => {
    setFinalizing(true);
    setStatus('Session wird abgeschlossen ...');
    setRecordingStartedAt(null);

    try {
      recordingActiveRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      await waitForRecorderStop(5000);

      await waitForQueueDrain(FINALIZE_QUEUE_TIMEOUT_MS);
      await runAnalysis({ force: true });
      await persistLiveResult();
      setLastSavedAt(new Date().toISOString());
      setShowSavedHint(true);
      setStatus('Live-Anamnese gespeichert');
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Fehler beim Speichern');
    } finally {
      setFinalizing(false);
    }
  };

  useEffect(() => {
    return () => {
      recordingActiveRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      stopTracks();
    };
  }, []);

  const templateFields = useMemo(
    () => ANAMNESIS_TEMPLATES[analysis.templateKey] || [],
    [analysis.templateKey],
  );

  const fieldProgress = useMemo(() => {
    const known = templateFields.filter((f) => analysis.state[f.key]?.status === 'known').length;
    const unclear = templateFields.filter((f) => analysis.state[f.key]?.status === 'unclear').length;
    const missing = templateFields.filter((f) => !analysis.state[f.key] || analysis.state[f.key]?.status === 'missing').length;
    const total = templateFields.length;
    const pct = total > 0 ? Math.round(((known + unclear * 0.5) / total) * 100) : 0;
    return { known, unclear, missing, total, pct };
  }, [templateFields, analysis.state]);

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {recording && (
              <span style={recordingDotStyle} />
            )}
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: uiTokens.brand }}>
                Anamnese Assistent
              </h1>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                {ANAMNESIS_TEMPLATE_META[analysis.templateKey].label}
                {recordingElapsed ? ` · ${recordingElapsed}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              style={selectStyle}
              aria-label='Vorstellungsgrund'
            >
              {CHIEF_COMPLAINT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>

            <select
              value={templateOverride}
              onChange={(e) => setTemplateOverride(e.target.value as 'auto' | TemplateKey)}
              style={selectStyle}
              aria-label='Template'
            >
              <option value='auto'>Auto</option>
              {TEMPLATE_KEYS.map((key) => (
                <option key={key} value={key}>{ANAMNESIS_TEMPLATE_META[key].label}</option>
              ))}
            </select>

            {!recording ? (
              <button type='button' onClick={startRecording} disabled={finalizing} style={btnPrimary}>
                ● Aufnahme starten
              </button>
            ) : (
              <button type='button' onClick={stopRecordingAndSave} disabled={finalizing} style={btnDanger}>
                {finalizing ? 'Speichere …' : '■ Stoppen & Speichern'}
              </button>
            )}

            <button
              type='button'
              onClick={() => {
                goToDocumentation().catch((err) => {
                  console.error(err);
                  setStatus('Übergabe zur Dokumentation fehlgeschlagen');
                });
              }}
              disabled={finalizing}
              style={btnDark}
            >
              Zur Dokumentation →
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={progressContainerStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
              Vollständigkeit: {fieldProgress.pct}%
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {fieldProgress.known} erhoben · {fieldProgress.unclear} unklar · {fieldProgress.missing} fehlend
            </span>
          </div>
          <div style={progressBarBg}>
            <div style={{ ...progressBarFill, width: `${fieldProgress.pct}%`, background: fieldProgress.pct >= 80 ? '#16a34a' : fieldProgress.pct >= 50 ? '#eab308' : '#ef4444' }} />
          </div>
        </div>

        {/* Field chips */}
        <div style={fieldChipsContainerStyle}>
          {templateFields.map((field) => {
            const entry = analysis.state[field.key];
            const status = entry?.status || 'missing';
            const chipStyle = status === 'known' ? chipKnown : status === 'unclear' ? chipUnclear : chipMissing;
            const value = entry?.value?.trim();
            const displayValue = status === 'known' && value && value.toLowerCase() !== 'erwaehnt' && value.toLowerCase() !== 'bekannt'
              ? value : undefined;
            return (
              <span key={field.key} style={chipStyle} title={displayValue || field.label}>
                {status === 'known' ? '✓' : status === 'unclear' ? '?' : '·'} {field.label}
                {displayValue && <span style={{ fontWeight: 400, opacity: 0.85 }}> — {displayValue.length > 30 ? displayValue.slice(0, 30) + '…' : displayValue}</span>}
              </span>
            );
          })}
        </div>

        {/* Status line */}
        {(analysisError || queueSize > 0 || analysisRunning || transcriptionStalled) && (
          <div style={statusBarStyle}>
            {analysisError && <span style={{ color: '#dc2626' }}>Analyse-Fehler: {analysisError}</span>}
            {queueSize > 0 && <span>Segmente in Queue: {queueSize}</span>}
            {analysisRunning && <span style={{ color: uiTokens.brand }}>Analyse wird aktualisiert …</span>}
            {transcriptionStalled && <span style={{ color: '#dc2626' }}>⚠ Transkription scheint zu hängen</span>}
          </div>
        )}

        {showSavedHint && lastSavedAt && (
          <div style={{ marginBottom: 8, color: '#16a34a', fontSize: 12, fontWeight: 500 }}>
            ✓ Gespeichert um {new Date(lastSavedAt).toLocaleTimeString('de-DE')}
          </div>
        )}

        {/* Main grid: 2-column – left=questions, right=transcript+anamnese */}
        <div style={gridStyle}>
          {/* LEFT: Questions panel (primary for TFA) */}
          <div style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={panelTitleStyle}>
                Nächste Fragen
                {openQuestionCount > 0 && <span style={badgeStyle}>{openQuestionCount}</span>}
              </h2>
              {checkedCount > 0 && (
                <span style={{ fontSize: 12, color: '#64748b' }}>{checkedCount} erledigt</span>
              )}
            </div>

            <div style={questionAreaStyle}>
              {visibleQuestions.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {visibleQuestions.map((q) => {
                    const isOpen = !q.checked && !q.irrelevant;
                    const accentBg = q.priority === 'high' ? '#fef2f2' : q.priority === 'medium' ? '#fffbeb' : '#f0f9ff';
                    const accentBorder = q.priority === 'high' ? '#fecaca' : q.priority === 'medium' ? '#fde68a' : '#bfdbfe';
                    const accentPill = q.priority === 'high' ? '#dc2626' : q.priority === 'medium' ? '#ca8a04' : '#2563eb';
                    return (
                      <div
                        key={q.id}
                        style={{
                          border: `1px solid ${isOpen ? accentBorder : '#e2e8f0'}`,
                          borderRadius: 12,
                          padding: '12px 14px',
                          background: q.irrelevant ? '#f8fafc' : q.checked ? '#f0fdf4' : accentBg,
                          opacity: isOpen ? 1 : 0.7,
                          transition: 'opacity 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <input
                            type='checkbox'
                            checked={q.checked}
                            onChange={() => toggleQuestionChecked(q.id)}
                            disabled={q.irrelevant}
                            style={{ marginTop: 3, accentColor: uiTokens.brand }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 7px',
                                color: '#fff', background: accentPill, textTransform: 'uppercase', letterSpacing: '0.04em',
                              }}>
                                {q.priority}
                              </span>
                              {q.irrelevant && <span style={{ fontSize: 11, color: '#94a3b8' }}>irrelevant</span>}
                            </div>
                            <div style={{
                              fontSize: 15, lineHeight: 1.45, color: '#0f172a', fontWeight: isOpen ? 600 : 400,
                              textDecoration: q.checked || q.irrelevant ? 'line-through' : 'none',
                            }}>
                              {q.text}
                            </div>
                            {q.reason && isOpen && (
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                {q.reason}
                              </div>
                            )}
                            <button
                              type='button'
                              onClick={() => toggleQuestionIrrelevant(q.id)}
                              style={chipButton}
                            >
                              {q.irrelevant ? 'wiederherstellen' : 'irrelevant'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : analysis.isComplete ? (
                <div style={completeBannerStyle}>
                  ✓ {analysis.completionText || 'Alle Fragen gestellt – Anamnese vollständig.'}
                </div>
              ) : (
                <div style={{ color: '#94a3b8', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>
                  {recording ? 'Warte auf erste Analyse …' : 'Starte die Aufnahme für Fragevorschläge.'}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Transcript + Structured anamnesis */}
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Transcript */}
            <div style={{ ...panelStyle, minHeight: 200 }}>
              <h2 style={panelTitleStyle}>Live-Transkript</h2>
              <div ref={transcriptScrollRef} style={scrollAreaStyle}>
                {transcript ? (
                  <pre style={transcriptPre}>{transcript}</pre>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: 14 }}>
                    Noch kein Transkript vorhanden.
                  </div>
                )}
              </div>
            </div>

            {/* Structured anamnesis */}
            <div style={panelStyle}>
              <h2 style={panelTitleStyle}>Strukturierte Anamnese</h2>
              <div style={scrollAreaStyle}>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: '#1e293b' }}>
                  {narrativeAnamnesis}
                </div>

                <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                  {finalNotes.vorerkrankungen !== 'nicht erhoben' && (
                    <div>
                      <div style={sectionLabel}>Vorerkrankungen</div>
                      <div style={{ fontSize: 14, color: '#1e293b' }}>{finalNotes.vorerkrankungen}</div>
                    </div>
                  )}
                  {finalNotes.medikation !== 'nicht erhoben' && (
                    <div>
                      <div style={sectionLabel}>Aktuelle Medikation</div>
                      <div style={{ fontSize: 14, color: '#1e293b' }}>{finalNotes.medikation}</div>
                    </div>
                  )}
                </div>

                {analysis.missingPoints.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={sectionLabel}>Fehlende Angaben</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {analysis.missingPoints.map((item) => (
                        <span key={item} style={missingChip}>{item}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Debug panel (collapsed) */}
        <details style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
          <summary style={{ cursor: 'pointer' }}>Debug</summary>
          <div style={{ marginTop: 6, display: 'grid', gap: 4, padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div>Template: {analysis.templateKey} ({ANAMNESIS_TEMPLATE_META[analysis.templateKey].label})</div>
            <div>Override: {templateOverride === 'auto' ? 'Auto' : templateOverride}</div>
            <div>Letzte Analyse: {lastAnalyzedAt ? new Date(lastAnalyzedAt).toLocaleTimeString('de-DE') : '–'}</div>
            <div>Segmente: {transcribeStats.received} empfangen, {transcribeStats.success} OK, {transcribeStats.empty} leer, {transcribeStats.failed} Fehler</div>
            <div>Missing: {missingStateFields.join(', ') || 'keine'}</div>
            <div>Unclear: {unclearStateFields.join(', ') || 'keine'}</div>
          </div>
        </details>
      </div>
    </main>
  );
}

/* ── Styles ── */

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: uiTokens.pageBackground,
  color: uiTokens.textPrimary,
  padding: '20px 24px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  marginBottom: 14,
  flexWrap: 'wrap',
};

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 8,
  border: uiTokens.cardBorder,
  background: '#fff',
  fontSize: 13,
  color: '#334155',
};

const btnPrimary: React.CSSProperties = {
  background: uiTokens.brand,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '9px 16px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  background: '#dc2626',
};

const btnDark: React.CSSProperties = {
  ...btnPrimary,
  background: '#1e293b',
};

const recordingDotStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: '#dc2626',
  flexShrink: 0,
  animation: 'pulse-dot 1.2s ease-in-out infinite',
};

const progressContainerStyle: React.CSSProperties = {
  marginBottom: 10,
};

const progressBarBg: React.CSSProperties = {
  height: 6,
  borderRadius: 3,
  background: '#e5e7eb',
  overflow: 'hidden',
};

const progressBarFill: React.CSSProperties = {
  height: '100%',
  borderRadius: 3,
  transition: 'width 0.6s ease, background 0.4s ease',
};

const fieldChipsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginBottom: 14,
};

const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 999,
  padding: '3px 10px',
  lineHeight: 1.4,
};

const chipKnown: React.CSSProperties = {
  ...chipBase,
  background: '#dcfce7',
  color: '#166534',
  border: '1px solid #bbf7d0',
};

const chipUnclear: React.CSSProperties = {
  ...chipBase,
  background: '#fef9c3',
  color: '#854d0e',
  border: '1px solid #fde68a',
};

const chipMissing: React.CSSProperties = {
  ...chipBase,
  background: '#fff',
  color: '#94a3b8',
  border: '1px solid #e5e7eb',
};

const statusBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  fontSize: 12,
  color: '#64748b',
  marginBottom: 10,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 14,
  alignItems: 'start',
};

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: uiTokens.cardBorder,
  borderRadius: uiTokens.radiusCard,
  padding: 16,
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: uiTokens.brand,
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 8,
  fontSize: 11,
  fontWeight: 700,
  background: uiTokens.brand,
  color: '#fff',
  borderRadius: 999,
  minWidth: 20,
  height: 20,
  padding: '0 6px',
};

const questionAreaStyle: React.CSSProperties = {
  maxHeight: '72vh',
  overflowY: 'auto',
  paddingRight: 4,
};

const scrollAreaStyle: React.CSSProperties = {
  maxHeight: '36vh',
  overflowY: 'auto',
  paddingRight: 4,
};

const transcriptPre: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  color: '#334155',
};

const chipButton: React.CSSProperties = {
  marginTop: 6,
  border: '1px solid #e5e7eb',
  background: 'transparent',
  color: '#94a3b8',
  borderRadius: 6,
  padding: '2px 8px',
  fontSize: 11,
  cursor: 'pointer',
};

const completeBannerStyle: React.CSSProperties = {
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  color: '#166534',
  borderRadius: 12,
  padding: '16px 14px',
  fontWeight: 700,
  fontSize: 15,
  textAlign: 'center',
};

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 4,
};

const missingChip: React.CSSProperties = {
  fontSize: 12,
  background: '#fef2f2',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 999,
  padding: '2px 10px',
};

// Inject pulse animation
if (typeof document !== 'undefined') {
  const styleId = 'live-anamnesis-pulse';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }`;
    document.head.appendChild(style);
  }
}