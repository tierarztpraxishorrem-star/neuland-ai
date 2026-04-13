'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import {
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
const ANALYSIS_TICK_MS = 1500;
const ANALYSIS_FORCED_REFRESH_MS = 20000;
const ANALYSIS_MIN_INTERVAL_MS = 3500;
const ANALYSIS_MIN_TRANSCRIPT_CHARS = 20;
const ANALYSIS_MIN_DELTA_CHARS = 30;
const TRANSCRIBE_TIMEOUT_MS = 25000;
const MAX_VISIBLE_OPEN_QUESTIONS = 3;
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
  const [showDebugPanel, setShowDebugPanel] = useState(true);
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
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const refillCheckpointRef = useRef(0);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

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
          currentState: analysis.state,
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
    analysis.state,
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
      setStatus('Live-Anamnese läuft');
    } catch (error) {
      console.error(error);
      setStatus('Mikrofonzugriff nicht möglich');
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

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f3f7f8',
        color: '#0f172a',
        fontFamily: 'Arial',
        padding: '24px',
      }}
    >
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ margin: 0, color: '#0F6B74' }}>Anamnese Assistent (Live)</h1>
            <div style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
              Strukturierte Live-Anamnese ohne Diagnosevorschläge
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: '#334155' }}>Vorstellungsgrund</label>
            <select
              value={chiefComplaint}
              onChange={(event) => setChiefComplaint(event.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#fff',
              }}
            >
              {CHIEF_COMPLAINT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <label style={{ fontSize: 13, color: '#334155' }}>Template</label>
            <select
              value={templateOverride}
              onChange={(event) => setTemplateOverride(event.target.value as 'auto' | TemplateKey)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#fff',
              }}
            >
              <option value='auto'>Auto ({ANAMNESIS_TEMPLATE_META[analysis.templateKey].label})</option>
              {TEMPLATE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {ANAMNESIS_TEMPLATE_META[key].label}
                </option>
              ))}
            </select>

            {!recording ? (
              <button
                type='button'
                onClick={startRecording}
                disabled={finalizing}
                style={primaryButtonStyle}
              >
                Aufnahme starten
              </button>
            ) : (
              <button
                type='button'
                onClick={stopRecordingAndSave}
                disabled={finalizing}
                style={{ ...primaryButtonStyle, background: '#b91c1c' }}
              >
                {finalizing ? 'Speichere ...' : 'Aufnahme stoppen'}
              </button>
            )}

            <button
              type='button'
              onClick={() => {
                goToDocumentation().catch((error) => {
                  console.error(error);
                  setStatus('Übergabe zur Dokumentation fehlgeschlagen');
                });
              }}
              disabled={finalizing}
              style={{ ...primaryButtonStyle, background: '#111827' }}
            >
              {finalizing ? 'Übergebe ...' : 'Zur Dokumentation'}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 12, fontSize: 13, color: '#334155' }}>
          Status: {status} {queueSize > 0 ? `| Segmente in Queue: ${queueSize}` : ''}{' '}
          {analysisRunning ? '| Analyse wird aktualisiert ...' : ''}
          {checkedCount > 0 ? `| Als gefragt markiert: ${checkedCount}` : ''}
          {openQuestionCount > 0 ? `| Offen: ${openQuestionCount}` : ''}
          {transcriptionStalled ? ' | Warnung: Transkription scheint zu hängen' : ''}
        </div>

        {analysisError ? (
          <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 13 }}>
            Analyse-Fehler: {analysisError}
          </div>
        ) : null}

        {showSavedHint && lastSavedAt ? (
          <div style={{ marginBottom: 12, color: '#166534', fontSize: 13 }}>
            Zuletzt gespeichert: {new Date(lastSavedAt).toLocaleTimeString('de-DE')}
          </div>
        ) : null}

        <div
          style={{
            marginBottom: 12,
            border: '1px solid #dbe3e8',
            borderRadius: 10,
            background: '#fff',
            padding: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Debug (Live-Anamnese)</div>
            <button
              type='button'
              onClick={() => setShowDebugPanel((prev) => !prev)}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                background: '#fff',
                padding: '4px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {showDebugPanel ? 'ausblenden' : 'einblenden'}
            </button>
          </div>

          {showDebugPanel ? (
            <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 12, color: '#334155' }}>
              <div>Template-Key: {analysis.templateKey}</div>
              <div>Template-Name: {ANAMNESIS_TEMPLATE_META[analysis.templateKey].label}</div>
              <div>Override: {templateOverride === 'auto' ? 'Auto' : templateOverride}</div>
              <div>Letzte Analyse: {lastAnalyzedAt ? new Date(lastAnalyzedAt).toLocaleTimeString('de-DE') : 'noch keine'}</div>
              <div>Segmente empfangen: {transcribeStats.received}</div>
              <div>Transkription erfolgreich: {transcribeStats.success}</div>
              <div>Transkription leer: {transcribeStats.empty}</div>
              <div>Transkriptionsfehler: {transcribeStats.failed}</div>
              <div>Letzte erfolgreiche Transkription: {transcribeStats.lastSuccessAt ? new Date(transcribeStats.lastSuccessAt).toLocaleTimeString('de-DE') : 'noch keine'}</div>
              <div>Missing-Felder: {missingStateFields.length ? missingStateFields.join(', ') : 'keine'}</div>
              <div>Unclear-Felder: {unclearStateFields.length ? unclearStateFields.join(', ') : 'keine'}</div>
            </div>
          ) : null}
        </div>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Live-Transkript</h2>
            <div ref={transcriptScrollRef} style={scrollAreaStyle}>
              {transcript ? (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.45,
                    fontSize: 14,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                >
                  {transcript}
                </pre>
              ) : (
                <div style={{ color: '#64748b', fontSize: 14 }}>
                  Noch kein Transkript vorhanden. Starte die Aufnahme.
                </div>
              )}
            </div>
          </article>

          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Anamnese (Fließtext)</h2>
            <div style={scrollAreaStyle}>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: '#0f172a' }}>{narrativeAnamnesis}</div>

              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Vorerkrankungen</div>
                  <div style={{ fontSize: 14, color: '#0f172a' }}>{finalNotes.vorerkrankungen}</div>
                </div>

                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Aktuelle Medikation</div>
                  <div style={{ fontSize: 14, color: '#0f172a' }}>{finalNotes.medikation}</div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Interner Hinweis (fehlende Angaben)</div>
                {analysis.missingPoints.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, color: '#334155' }}>
                    {analysis.missingPoints.map((item) => (
                      <li key={item} style={{ marginBottom: 4, fontSize: 14 }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: '#64748b', fontSize: 14 }}>Aktuell keine offenen Punkte erkannt.</div>
                )}
              </div>
            </div>
          </article>

          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Empfohlene nächste Fragen</h2>
            <div style={scrollAreaStyle}>
              {visibleQuestions.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {visibleQuestions.map((question) => {
                    const checked = question.checked;
                    const irrelevant = question.irrelevant;
                    const accent =
                      question.priority === 'high'
                        ? '#fecaca'
                        : question.priority === 'medium'
                          ? '#fde68a'
                          : '#dbeafe';
                    return (
                      <label
                        key={question.id}
                        style={{
                          display: 'flex',
                          gap: 10,
                          alignItems: 'flex-start',
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          padding: 10,
                          background: irrelevant ? '#f1f5f9' : checked ? '#ecfdf5' : '#fff',
                        }}
                      >
                        <input
                          type='checkbox'
                          checked={checked}
                          onChange={() => toggleQuestionChecked(question.id)}
                          disabled={irrelevant}
                        />
                        <div style={{ display: 'grid', gap: 6, width: '100%' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                borderRadius: 999,
                                padding: '2px 8px',
                                background: accent,
                                color: '#111827',
                                textTransform: 'uppercase',
                              }}
                            >
                              {question.priority}
                            </span>
                            {irrelevant ? (
                              <span style={{ fontSize: 11, color: '#475569' }}>irrelevant</span>
                            ) : null}
                          </div>

                          <span
                            style={{
                              fontSize: 14,
                              color: '#0f172a',
                              textDecoration: checked || irrelevant ? 'line-through' : 'none',
                              opacity: checked || irrelevant ? 0.75 : 1,
                            }}
                          >
                            {question.text}
                          </span>

                          {question.reason ? (
                            <div
                              style={{
                                fontSize: 12,
                                color: '#475569',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: '6px 8px',
                              }}
                            >
                              Warum diese Frage: {question.reason}
                            </div>
                          ) : null}

                          <div>
                            <button
                              type='button'
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleQuestionIrrelevant(question.id);
                              }}
                              style={{
                                border: '1px solid #cbd5e1',
                                background: '#fff',
                                color: '#334155',
                                borderRadius: 8,
                                padding: '4px 8px',
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                            >
                              {irrelevant ? 'nicht irrelevant' : 'als irrelevant markieren'}
                            </button>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : analysis.isComplete ? (
                <div
                  style={{
                    border: '1px solid #bbf7d0',
                    background: '#f0fdf4',
                    color: '#166534',
                    borderRadius: 12,
                    padding: 12,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  {analysis.completionText || 'Fertig - keine weiteren Fragen erforderlich.'}
                </div>
              ) : (
                <div style={{ color: '#64748b', fontSize: 14 }}>
                  Noch keine Fragevorschläge vorhanden.
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  background: '#0F6B74',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 600,
};

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dbe3e8',
  borderRadius: 14,
  padding: 14,
  minHeight: 520,
};

const panelTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 10,
  fontSize: 18,
  color: '#0F6B74',
};

const scrollAreaStyle: React.CSSProperties = {
  maxHeight: '68vh',
  overflowY: 'auto',
  paddingRight: 4,
};