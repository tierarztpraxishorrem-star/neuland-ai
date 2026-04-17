'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { Button, uiTokens } from '../../../../components/ui/System';

type RecordingSegment = {
  id: string;
  label: string;
  source: 'recording' | 'upload';
  blob: Blob;
  url: string;
  durationSeconds: number;
};

/* ── IndexedDB Offline-Puffer für Aufnahme-Chunks ── */
const IDB_NAME = 'neuland_recording_buffer';
const IDB_VERSION = 1;
const IDB_STORE = 'chunks';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbAppendChunk(caseId: string, chunk: Blob): Promise<void> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).add({ caseId, blob: chunk, ts: Date.now() });
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* best effort */ }
}

async function idbRecoverChunks(caseId: string): Promise<Blob[]> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const all: { caseId: string; blob: Blob; ts: number }[] = await new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return all
      .filter((r) => r.caseId === caseId)
      .sort((a, b) => a.ts - b.ts)
      .map((r) => r.blob);
  } catch {
    return [];
  }
}

async function idbClearChunks(caseId: string): Promise<void> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const keys: IDBValidKey[] = [];
    const all: { caseId: string }[] = await new Promise((res, rej) => {
      const entries: { caseId: string }[] = [];
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          entries.push(cursor.value);
          if ((cursor.value as { caseId: string }).caseId === caseId) {
            keys.push(cursor.key);
          }
          cursor.continue();
        } else {
          res(entries);
        }
      };
      cursorReq.onerror = () => rej(cursorReq.error);
    });
    for (const key of keys) {
      store.delete(key);
    }
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* best effort */ }
}

const TRANSCRIPTION_QUOTES = [
  'Die KI hoert sich das gerade an... hoffentlich war es kein Katzengejammer 🐱',
  'Whisper transkribiert... das dauert laenger als eine Katze die entscheidet ob sie rein oder raus will 🚪',
  'Noch ein bisschen Geduld – schneller als ein aufgeregter Labrador, aber langsamer als eine Katze die Hunger hat 🐕',
  'Transkription laeuft... der Tierarzt hat auch nicht immer sofort alle Antworten 🩺',
  'Fast fertig... oder wie der Hamster im Rad sagen wuerde: gleich gleich 🐹',
  'Audiodatei wird analysiert... selbst ein Papagei braucht Zeit zum Nachplappern 🦜',
  'Einen Moment noch – die KI lernt gerade Tieraerztisch 📚',
  'Das Transkript entsteht... Geduld ist eine Tugend, sagt auch jeder Golden Retriever 🐾',
  'Die Bits und Bytes arbeiten... nicht so elegant wie eine Katze, aber genauso gruendlich 🐈',
  'Spracherkennung aktiv... zum Glueck muss die KI nicht Hundeschrift entziffern 📝',
  'Noch einen Augenblick – auch Rom wurde nicht an einem Tag erbaut. Und kein Hund an einem Tag erzogen 🏛️',
  'Transkription im Gange... die KI ist aufmerksamer als ein Dackel der ein Leckerli riecht 🦴',
  'Audioverarbeitung... schneller als ein Tierarztbesuch, versprochen! ⏱️',
  'Die kuenstliche Intelligenz gibt ihr Bestes – nicht jeder Patient ist kooperativ 😅',
];

function TranscriptionOverlay({ totalDurationSeconds }: { totalDurationSeconds: number }) {
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * TRANSCRIPTION_QUOTES.length));
  const [progress, setProgress] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const startTimeRef = useRef(Date.now());

  // ~3 sec transcription per 1 min audio, minimum 15s
  const estimatedSeconds = Math.max(15, Math.ceil(totalDurationSeconds * 0.05));
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  // Rotate quotes every 4 seconds with fade
  useEffect(() => {
    const interval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % TRANSCRIPTION_QUOTES.length);
        setFadeIn(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Animate progress bar – ease out, max 95%
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const ratio = Math.min(elapsed / estimatedSeconds, 1);
      // ease-out curve: fast start, slow end, caps at 95%
      const eased = 1 - Math.pow(1 - ratio, 2.5);
      setProgress(Math.min(eased * 95, 95));
    }, 200);
    return () => clearInterval(interval);
  }, [estimatedSeconds]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Pulsating icon */}
      <div style={{
        fontSize: '48px',
        marginBottom: '24px',
        animation: 'pulse 2s ease-in-out infinite',
      }}>
        🎙️
      </div>

      {/* Quote */}
      <div style={{
        fontSize: '16px',
        fontWeight: 500,
        color: '#fff',
        textAlign: 'center',
        maxWidth: '480px',
        minHeight: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity 0.4s ease',
        marginBottom: '32px',
        lineHeight: 1.5,
      }}>
        {TRANSCRIPTION_QUOTES[quoteIndex]}
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        height: '8px',
        background: 'rgba(255, 255, 255, 0.15)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '16px',
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #10b981, #34d399)',
          borderRadius: '4px',
          transition: 'width 0.3s ease-out',
        }} />
      </div>

      {/* Time estimate */}
      <div style={{
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
      }}>
        ca. {estimatedMinutes} {estimatedMinutes === 1 ? 'Minute' : 'Minuten'} geschaetzt
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

export default function RecordPage() {
  const { id } = useParams();
  const router = useRouter();
  const caseId = String(id || '');

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [currentSegmentStartedAtMs, setCurrentSegmentStartedAtMs] = useState<number | null>(null);
  const [status, setStatus] = useState('Bereit fuer eine neue Session');
  const [dragActive, setDragActive] = useState(false);
  const [transcriptionDuration, setTranscriptionDuration] = useState(0);

  const MAX_SEGMENT_SECONDS = 25 * 60; // Auto-Pause nach 25 Min pro Segment

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const segmentsRef = useRef<RecordingSegment[]>([]);
  const autoPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const previewAudioUrlRef = useRef<string | null>(null);
  const sessionCreatedAtRef = useRef<string>(new Date().toISOString());

  const totalSegmentSeconds = segments.reduce((sum, seg) => sum + seg.durationSeconds, 0);
  const liveSeconds = recording && currentSegmentStartedAtMs
    ? Math.max(0, Math.floor((nowMs - currentSegmentStartedAtMs) / 1000))
    : 0;
  const totalSeconds = totalSegmentSeconds + liveSeconds;

  useEffect(() => {
    if (!recording) return;

    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [recording]);

  // Recover orphaned chunks from IndexedDB after browser crash
  const [recoveredSegment, setRecoveredSegment] = useState<RecordingSegment | null>(null);
  useEffect(() => {
    if (!caseId) return;
    idbRecoverChunks(caseId).then((chunks) => {
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: 'audio/webm' });
      if (blob.size < 1000) {
        idbClearChunks(caseId);
        return;
      }
      const recovered: RecordingSegment = {
        id: `${Date.now()}_recovered`,
        label: 'Wiederhergestellt',
        source: 'recording',
        blob,
        url: URL.createObjectURL(blob),
        durationSeconds: Math.max(1, Math.floor(chunks.length * 10)) // ~10s per chunk
      };
      setRecoveredSegment(recovered);
      setStatus('Nicht gespeicherte Aufnahme gefunden – bitte bestätigen');
    });
  }, [caseId]);

  const formatTime = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const m = String(Math.floor(safe / 60)).padStart(2, '0');
    const s = String(safe % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const closeMediaResources = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
      analyserRef.current = null;
    }

    recordingRef.current = false;
  };

  const drawIdleLine = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerY = canvas.height / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.stroke();
  };

  const drawVisualizer = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;

    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    let smoothedAmplitude = 0;
    let phase = 0;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerY = canvas.height / 2;

      if (!recordingRef.current) {
        drawIdleLine();
        return;
      }

      analyser.getByteTimeDomainData(dataArray);

      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }

      const rms = Math.sqrt(sumSquares / bufferLength);
      const targetAmplitude = Math.min(canvas.height * 0.32, rms * canvas.height * 2.4 + 4);
      smoothedAmplitude += (targetAmplitude - smoothedAmplitude) * 0.14;
      phase += 0.2;

      const points = 48;
      const wavelength = canvas.width / 1.35;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.6;
      ctx.beginPath();

      for (let i = 0; i <= points; i++) {
        const x = (i / points) * canvas.width;
        const y =
          centerY +
          Math.sin((x / wavelength) * Math.PI * 2 + phase) * smoothedAmplitude;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(255,255,255,0.55)';
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    draw();
  };

  const beginSegmentRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const supportsOpus =
      typeof MediaRecorder !== 'undefined' &&
      typeof MediaRecorder.isTypeSupported === 'function' &&
      MediaRecorder.isTypeSupported('audio/webm;codecs=opus');

    const recorder = supportsOpus
      ? new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      : new MediaRecorder(stream);

    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
        idbAppendChunk(caseId, event.data);
      }
    };

    recorder.onerror = () => {
      console.error('[Recording] MediaRecorder Fehler – Notfall-Sicherung des Segments');
      const emergencyBlob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type: 'audio/webm' })
        : null;

      closeMediaResources();
      drawIdleLine();

      if (emergencyBlob) {
        const segmentNumber = segmentsRef.current.length + 1;
        const elapsed = currentSegmentStartedAtMs
          ? Math.max(1, Math.floor((Date.now() - currentSegmentStartedAtMs) / 1000))
          : 1;
        const emergencySegment: RecordingSegment = {
          id: `${Date.now()}_emergency_${segmentNumber}`,
          label: `Segment ${segmentNumber} (gerettet)`,
          source: 'recording',
          blob: emergencyBlob,
          url: URL.createObjectURL(emergencyBlob),
          durationSeconds: elapsed
        };
        setSegments((prev) => [...prev, emergencySegment]);
        setStatus('Aufnahme wurde unterbrochen – Segment gerettet');
      } else {
        setStatus('Aufnahme wurde unterbrochen – keine Daten vorhanden');
      }

      setRecording(false);
      setPaused(true);
      setCurrentSegmentStartedAtMs(null);
      chunksRef.current = [];
      mediaRecorderRef.current = null;
    };

    recorder.start(10000);

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);
    analyserRef.current = analyser;
    recordingRef.current = true;
    drawVisualizer();

    setCurrentSegmentStartedAtMs(Date.now());
    setRecording(true);
    setPaused(false);
    setStatus('Aufnahme läuft');

    // Auto-Pause nach MAX_SEGMENT_SECONDS, damit kein Datenverlust bei sehr langen Aufnahmen
    if (autoPauseTimerRef.current) clearTimeout(autoPauseTimerRef.current);
    autoPauseTimerRef.current = setTimeout(() => {
      if (recordingRef.current) {
        setStatus('Auto-Pause: Segment-Limit erreicht – Segment wird gesichert');
        pauseRecording();
      }
    }, MAX_SEGMENT_SECONDS * 1000);
  };

  const endCurrentSegment = async () => {
    if (autoPauseTimerRef.current) {
      clearTimeout(autoPauseTimerRef.current);
      autoPauseTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder) return null;

    const startedAt = currentSegmentStartedAtMs;
    const stoppedAt = Date.now();
    const elapsed = startedAt ? Math.max(1, Math.floor((stoppedAt - startedAt) / 1000)) : 1;

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const completeBlob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: 'audio/webm' })
          : null;
        resolve(completeBlob);
      };
      recorder.stop();
    });

    mediaRecorderRef.current = null;
    chunksRef.current = [];
    closeMediaResources();
    drawIdleLine();
    setRecording(false);
    setCurrentSegmentStartedAtMs(null);

    // Segment erfolgreich erstellt – IDB-Puffer leeren
    idbClearChunks(caseId);

    if (!blob) return null;

    const segmentNumber = segments.length + 1;
    const segment: RecordingSegment = {
      id: `${Date.now()}_${segmentNumber}`,
      label: `Segment ${segmentNumber}`,
      source: 'recording',
      blob,
      url: URL.createObjectURL(blob),
      durationSeconds: elapsed
    };

    return segment;
  };

  const pauseRecording = async () => {
    if (!recording) return;

    setStatus('Segment wird gespeichert ...');
    const segment = await endCurrentSegment();
    if (segment) {
      setSegments((prev) => [...prev, segment]);
    }
    setPaused(true);
    setStatus('Pausiert');

    return segment || null;
  };

  const resumeRecording = async () => {
    await beginSegmentRecording();
  };

  const getBlobDuration = (blob: Blob) => {
    return new Promise<number>((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      let resolved = false;

      const finish = (dur: number) => {
        if (resolved) return;
        resolved = true;
        URL.revokeObjectURL(url);
        resolve(dur);
      };

      const tryRead = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0.5) {
          finish(Math.max(1, Math.floor(audio.duration)));
        }
      };

      // Some formats (mp3, m4a) need the browser to scan further before duration is known.
      // loadedmetadata fires first but duration may still be Infinity.
      // durationchange fires when the browser finally resolves the real duration.
      audio.onloadedmetadata = tryRead;
      audio.ondurationchange = tryRead;

      // Fallback: estimate from file size if browser can't determine duration.
      // ~128kbps is a reasonable average for speech audio.
      const timeoutMs = 3000;
      setTimeout(() => {
        if (!resolved) {
          const estimatedBitrate = 128 * 1024 / 8; // 128kbps in bytes/sec
          const estimated = Math.max(1, Math.floor(blob.size / estimatedBitrate));
          finish(estimated);
        }
      }, timeoutMs);

      audio.onerror = () => {
        const estimatedBitrate = 128 * 1024 / 8;
        const estimated = Math.max(1, Math.floor(blob.size / estimatedBitrate));
        finish(estimated);
      };
    });
  };

  const addUploadSegment = async (file: File) => {
    const duration = await getBlobDuration(file);
    const uploadCount = segments.filter((seg) => seg.source === 'upload').length + 1;
    const segment: RecordingSegment = {
      id: `${Date.now()}_upload_${uploadCount}`,
      label: `Upload ${uploadCount}`,
      source: 'upload',
      blob: file,
      url: URL.createObjectURL(file),
      durationSeconds: duration
    };

    setSegments((prev) => [...prev, segment]);
    setStatus('Upload als Segment hinzugefuegt');
  };

  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    for (const file of files) {
      await addUploadSegment(file);
    }
  };

  const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MB – Vercel body limit is 4.5 MB

  const transcribeSegment = async (segment: RecordingSegment) => {
    const formData = new FormData();
    formData.append('mode', 'live');

    if (segment.blob.size > DIRECT_UPLOAD_LIMIT) {
      // Large file: upload to Supabase Storage first, then send signed URL to API
      const ext = segment.source === 'upload' ? 'upload' : 'webm';
      const path = `recordings/${caseId}/transcribe-${segment.id}.${ext}`;
      const uploadRes = await supabase.storage
        .from('recordings')
        .upload(path, segment.blob, {
          contentType: segment.blob.type || 'audio/webm',
          upsert: true
        });

      if (uploadRes.error) {
        throw new Error(`Storage-Upload fehlgeschlagen: ${uploadRes.error.message}`);
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from('recordings')
        .createSignedUrl(path, 600); // 10 min TTL

      if (signedError || !signedData?.signedUrl) {
        throw new Error('Keine signierte URL vom Storage erhalten');
      }

      formData.append('audio_url', signedData.signedUrl);
    } else {
      // Small file: send directly in request body
      const extension = segment.source === 'upload' ? 'upload' : 'webm';
      formData.append('file', segment.blob, `${segment.id}.${extension}`);
    }

    const res = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errorText = typeof data?.error === 'string' ? data.error : 'Transkription fehlgeschlagen';
      throw new Error(errorText);
    }

    return (data?.text || '').trim();
  };

  const uploadPreviewAudio = async (segment: RecordingSegment) => {
    try {
      const path = `recordings/${caseId}/session-preview-${Date.now()}.webm`;
      const uploadRes = await supabase.storage
        .from('recordings')
        .upload(path, segment.blob, { contentType: 'audio/webm', upsert: false });

      if (uploadRes.error) {
        return '';
      }

      const publicRes = supabase.storage.from('recordings').getPublicUrl(path);
      return publicRes?.data?.publicUrl || '';
    } catch {
      return '';
    }
  };

  const safeStorageGet = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const safeStorageSet = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };

  const goToDocumentation = async () => {
    let activeSegments = [...segments];

    if (recording) {
      const justRecorded = await pauseRecording();
      if (justRecorded) {
        activeSegments = [...activeSegments, justRecorded];
      }
    }

    if (activeSegments.length === 0) {
      alert('Bitte zuerst mindestens ein Segment aufnehmen oder hochladen.');
      return;
    }

    const totalAudioDuration = activeSegments.reduce((sum, s) => sum + s.durationSeconds, 0);
    setTranscriptionDuration(totalAudioDuration);
    setProcessing(true);
    setStatus('Segmente werden verarbeitet ...');

    try {
      const transcripts: string[] = [];
      const failedSegments: string[] = [];

      for (let i = 0; i < activeSegments.length; i++) {
        const segment = activeSegments[i];
        setStatus(`Transkribiere ${segment.label} (${i + 1}/${activeSegments.length}) ...`);
        try {
          const text = await transcribeSegment(segment);
          if (text) {
            transcripts.push(text);
          } else {
            failedSegments.push(`${segment.label}: kein Text erkannt`);
          }
        } catch (segmentError) {
          const message = segmentError instanceof Error ? segmentError.message : 'Unbekannter Fehler';
          failedSegments.push(`${segment.label}: ${message}`);
        }
      }

      const combinedTranscript = transcripts.join('\n\n').trim();
      const fallbackTranscript = [
        'Hinweis: Die automatische Transkription ist fehlgeschlagen.',
        'Bitte Audiosegment(e) manuell pruefen oder in kleinere Teile aufteilen und erneut hochladen.',
        '',
        'Fehlerdetails:',
        ...(failedSegments.length ? failedSegments.map((line) => `- ${line}`) : ['- Keine Details verfuegbar'])
      ].join('\n');

      const finalTranscript = combinedTranscript || fallbackTranscript;
      const template = safeStorageGet('selectedTemplate') || '';

      const previewSegment = activeSegments[0] || null;
      let previewAudioUrl = '';

      if (previewSegment) {
        previewAudioUrl = await uploadPreviewAudio(previewSegment);

        if (!previewAudioUrl) {
          previewAudioUrl = previewSegment.url;
        }
      }

      previewAudioUrlRef.current = previewAudioUrl || null;

      const recordingSession = {
        name: 'Aufnahme-Session',
        duration_seconds: totalSeconds,
        created_at: sessionCreatedAtRef.current,
        audio_url: previewAudioUrl || null,
        segment_count: activeSegments.length
      };

      safeStorageSet('consultation_result', finalTranscript);
      safeStorageSet('consultation_template', template);
      safeStorageSet(`case_${caseId}_autosave_recording_session`, JSON.stringify(recordingSession));
      safeStorageSet(`case_${caseId}_transcription_warnings`, JSON.stringify(failedSegments));

      const existingContext = safeStorageGet(`case_context_${caseId}`);
      if (existingContext) {
        try {
          const parsed = JSON.parse(existingContext);
          safeStorageSet(
            `case_context_${caseId}`,
            JSON.stringify({
              ...parsed,
              recordingSession
            })
          );
        } catch {
          // Ignore broken context payload and keep dedicated recording-session autosave key.
        }
      }

      if (failedSegments.length > 0) {
        setStatus('Teilweise verarbeitet - siehe Hinweis in der Dokumentation');
      } else {
        setStatus('Verarbeitung abgeschlossen');
      }

      router.push(`/konsultation/${caseId}/result`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      const emergencyTranscript = [
        'Hinweis: Die Verarbeitung der Segmente ist fehlgeschlagen.',
        'Bitte die Audiosegmente sichern und in kleinere Teile aufteilen.',
        '',
        `Technischer Hinweis: ${message}`
      ].join('\n');

      safeStorageSet('consultation_result', emergencyTranscript);
      safeStorageSet(`case_${caseId}_transcription_warnings`, JSON.stringify([message]));
      setStatus('Fehler bei der Verarbeitung - wechsle zur Dokumentation');
      router.push(`/konsultation/${caseId}/result`);
    } finally {
      setProcessing(false);
    }
  };

  const removeSegment = (segmentId: string) => {
    setSegments((prev) => {
      const next = prev.filter((segment) => segment.id !== segmentId);
      const removed = prev.find((segment) => segment.id === segmentId);
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
      return next;
    });
  };

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    drawIdleLine();

    return () => {
      if (autoPauseTimerRef.current) clearTimeout(autoPauseTimerRef.current);
      closeMediaResources();
      segmentsRef.current.forEach((segment) => {
        if (previewAudioUrlRef.current && segment.url === previewAudioUrlRef.current) return;
        URL.revokeObjectURL(segment.url);
      });
    };
  }, []);

  return (
    <>
    {processing && transcriptionDuration > 0 && (
      <TranscriptionOverlay totalDurationSeconds={transcriptionDuration} />
    )}
    <main style={{
      minHeight: '100vh',
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "center",
      background: uiTokens.brand,
      color: "#fff",
      padding: `${uiTokens.pagePadding} 20px`
    }}>

      <h1 style={{ marginBottom: "10px" }}>
        {recording ? 'Aufnahme laeuft' : paused ? 'Session pausiert' : 'Bereit fuer die Session'}
      </h1>

      <div style={{
        fontSize: "60px",
        fontWeight: 700,
        marginBottom: '8px'
      }}>
        {formatTime(totalSeconds)}
      </div>

      <div style={{ fontSize: '14px', marginBottom: '18px', opacity: 0.9 }}>
        🎙️ {segments.length} Segmente aufgenommen · {formatTime(totalSeconds)} min
      </div>

      {recording && liveSeconds > MAX_SEGMENT_SECONDS - 120 && (
        <div style={{
          background: 'rgba(245,158,11,0.9)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 600,
          marginBottom: '12px',
          textAlign: 'center'
        }}>
          ⚠️ Auto-Pause in {formatTime(MAX_SEGMENT_SECONDS - liveSeconds)} – Segment wird automatisch gesichert
        </div>
      )}

      {recoveredSegment && (
        <div style={{
          background: 'rgba(59,130,246,0.9)',
          color: '#fff',
          padding: '10px 16px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 600,
          marginBottom: '12px',
          textAlign: 'center',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          <span>💾 Nicht gespeicherte Aufnahme gefunden ({(recoveredSegment.blob.size / 1024 / 1024).toFixed(1)} MB)</span>
          <button
            onClick={() => {
              setSegments((prev) => [...prev, recoveredSegment]);
              setRecoveredSegment(null);
              idbClearChunks(caseId);
              setStatus('Wiederhergestelltes Segment übernommen');
            }}
            style={{ background: '#fff', color: '#1e40af', border: 'none', borderRadius: '6px', padding: '4px 12px', fontWeight: 700, cursor: 'pointer' }}
          >
            Übernehmen
          </button>
          <button
            onClick={() => {
              setRecoveredSegment(null);
              idbClearChunks(caseId);
              setStatus('Wiederherstellung verworfen');
            }}
            style={{ background: 'transparent', color: '#fff', border: '1px solid #fff', borderRadius: '6px', padding: '4px 12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Verwerfen
          </button>
        </div>
      )}

      {/* 🌊 VISUAL */}
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        style={{
          background: "rgba(255,255,255,0.15)",
          borderRadius: "12px",
          marginBottom: "18px"
        }}
      />

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: uiTokens.cardGap }}>
        {!recording && !paused && (
          <Button
            onClick={beginSegmentRecording}
            disabled={processing}
            variant='secondary'
            size='lg'
            style={{
              background: '#fff',
              color: '#0F6B74',
              fontWeight: 700,
              fontSize: '16px'
            }}
          >
            🎤 Aufnahme beginnen
          </Button>
        )}

        {recording && (
          <Button
            onClick={pauseRecording}
            disabled={processing}
            variant='primary'
            size='lg'
            style={{
              background: '#f59e0b',
              color: '#fff',
              fontWeight: 700
            }}
          >
            ⏸ Pause
          </Button>
        )}

        {!recording && paused && (
          <Button
            onClick={resumeRecording}
            disabled={processing}
            variant='primary'
            size='lg'
            style={{
              background: '#10b981',
              color: '#fff',
              fontWeight: 700
            }}
          >
            🎤 Aufnahme fortsetzen
          </Button>
        )}

        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          variant='secondary'
          size='lg'
          style={{
            background: '#e2e8f0',
            color: '#0f172a',
            fontWeight: 700
          }}
        >
          📤 Aufnahme hochladen
        </Button>

        <input
          ref={fileInputRef}
          type='file'
          accept='audio/*'
          multiple
          style={{ display: 'none' }}
          onChange={async (event) => {
            const files = Array.from(event.target.files || []);
            await handleUploadFiles(files);
            event.currentTarget.value = '';
          }}
        />

        <Button
          onClick={goToDocumentation}
          disabled={processing || (!recording && segments.length === 0)}
          variant='primary'
          size='lg'
          style={{
            background: '#111827',
            color: '#fff',
            fontWeight: 700,
            opacity: processing || (!recording && segments.length === 0) ? 0.7 : 1
          }}
        >
          {processing ? 'Verarbeite ...' : '🧠 Zur Dokumentation'}
        </Button>
      </div>

      {paused && !recording && (
        <div style={{ fontSize: '13px', opacity: 0.95, marginBottom: '10px' }}>
          Du kannst jederzeit weitere Teile aufnehmen oder Dateien hinzufuegen.
        </div>
      )}

      <div
        onClick={() => !processing && fileInputRef.current?.click()}
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
          if (processing) return;
          const files = Array.from(e.dataTransfer.files || []);
          await handleUploadFiles(files);
        }}
        style={{
          width: '100%',
          maxWidth: '720px',
          border: dragActive ? '2px dashed rgba(255,255,255,0.95)' : '1px dashed rgba(255,255,255,0.45)',
          borderRadius: '12px',
          background: dragActive ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
          padding: '12px',
          marginBottom: '12px',
          cursor: processing ? 'wait' : 'pointer'
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '14px' }}>Audio hier ablegen oder klicken</div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>Uploads werden als Segmente hinzugefuegt und mit transkribiert.</div>
      </div>

      <div style={{ fontSize: '13px', opacity: 0.85, marginBottom: '14px' }}>{status}</div>

      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          background: 'rgba(255,255,255,0.14)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '12px',
          padding: '12px'
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>Segmente</div>

        {segments.length === 0 && (
          <div style={{ fontSize: '13px', opacity: 0.9 }}>
            Noch keine Segmente vorhanden.
          </div>
        )}

        <div style={{ display: 'grid', gap: '8px' }}>
          {segments.map((segment) => (
            <div
              key={segment.id}
              style={{
                background: 'rgba(0,0,0,0.15)',
                borderRadius: '10px',
                padding: '10px',
                display: 'grid',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>
                  {segment.label} - {formatTime(segment.durationSeconds)} min
                </div>

                <Button
                  onClick={() => removeSegment(segment.id)}
                  size='sm'
                  variant='primary'
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                >
                  Loeschen
                </Button>
              </div>

              <audio controls src={segment.url} style={{ width: '100%' }} />
            </div>
          ))}
        </div>
      </div>

    </main>
    </>
  );
}