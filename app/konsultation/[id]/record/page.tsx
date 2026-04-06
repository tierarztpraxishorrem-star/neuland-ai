'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

type RecordingSegment = {
  id: string;
  label: string;
  source: 'recording' | 'upload';
  blob: Blob;
  url: string;
  durationSeconds: number;
};

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const segmentsRef = useRef<RecordingSegment[]>([]);

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
      }
    };

    recorder.start();

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
    setStatus('Aufnahme laeuft');
  };

  const endCurrentSegment = async () => {
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

      audio.onloadedmetadata = () => {
        const duration = Number.isFinite(audio.duration) ? Math.max(1, Math.floor(audio.duration)) : 1;
        URL.revokeObjectURL(url);
        resolve(duration);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(1);
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

  const transcribeSegment = async (segment: RecordingSegment) => {
    const formData = new FormData();
    const extension = segment.source === 'upload' ? 'upload' : 'webm';
    formData.append('file', segment.blob, `${segment.id}.${extension}`);

    const res = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
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

    setProcessing(true);
    setStatus('Segmente werden verarbeitet ...');

    try {
      const transcripts: string[] = [];

      for (let i = 0; i < activeSegments.length; i++) {
        const segment = activeSegments[i];
        setStatus(`Transkribiere ${segment.label} (${i + 1}/${activeSegments.length}) ...`);
        const text = await transcribeSegment(segment);
        if (text) {
          transcripts.push(text);
        }
      }

      const combinedTranscript = transcripts.join('\n\n').trim();
      const template = localStorage.getItem('selectedTemplate') || '';

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

      localStorage.setItem('consultation_result', combinedTranscript);
      localStorage.setItem('consultation_template', template);
      localStorage.setItem(`case_${caseId}_autosave_recording_session`, JSON.stringify(recordingSession));

      const existingContext = localStorage.getItem(`case_context_${caseId}`);
      if (existingContext) {
        try {
          const parsed = JSON.parse(existingContext);
          localStorage.setItem(
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

      router.push(`/konsultation/${caseId}/result`);
    } catch (error) {
      console.error(error);
      alert('Fehler bei der Verarbeitung der Segmente.');
      setStatus('Fehler bei der Verarbeitung');
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
      closeMediaResources();
      segmentsRef.current.forEach((segment) => {
        if (previewAudioUrlRef.current && segment.url === previewAudioUrlRef.current) return;
        URL.revokeObjectURL(segment.url);
      });
    };
  }, []);

  return (
    <main style={{
      minHeight: '100vh',
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "center",
      background: "linear-gradient(180deg, #0F6B74, #0c555c)",
      color: "#fff",
      fontFamily: "Arial",
      padding: '28px 20px'
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

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '12px' }}>
        {!recording && !paused && (
          <button
            onClick={beginSegmentRecording}
            disabled={processing}
            style={{
              padding: '14px 20px',
              borderRadius: '12px',
              border: 'none',
              background: '#fff',
              color: '#0F6B74',
              fontWeight: 700,
              fontSize: '16px',
              cursor: processing ? 'wait' : 'pointer'
            }}
          >
            🎤 Aufnahme beginnen
          </button>
        )}

        {recording && (
          <button
            onClick={pauseRecording}
            disabled={processing}
            style={{
              padding: '14px 20px',
              borderRadius: '12px',
              border: 'none',
              background: '#f59e0b',
              color: '#fff',
              fontWeight: 700,
              cursor: processing ? 'wait' : 'pointer'
            }}
          >
            ⏸ Pause
          </button>
        )}

        {!recording && paused && (
          <button
            onClick={resumeRecording}
            disabled={processing}
            style={{
              padding: '14px 20px',
              borderRadius: '12px',
              border: 'none',
              background: '#10b981',
              color: '#fff',
              fontWeight: 700,
              cursor: processing ? 'wait' : 'pointer'
            }}
          >
            🎤 Aufnahme fortsetzen
          </button>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          style={{
            padding: '14px 20px',
            borderRadius: '12px',
            border: 'none',
            background: '#e2e8f0',
            color: '#0f172a',
            fontWeight: 700,
            cursor: processing ? 'wait' : 'pointer'
          }}
        >
          📤 Aufnahme hochladen
        </button>

        <input
          ref={fileInputRef}
          type='file'
          accept='audio/*'
          style={{ display: 'none' }}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await addUploadSegment(file);
            event.currentTarget.value = '';
          }}
        />

        <button
          onClick={goToDocumentation}
          disabled={processing || (!recording && segments.length === 0)}
          style={{
            padding: '14px 20px',
            borderRadius: '12px',
            border: 'none',
            background: '#111827',
            color: '#fff',
            fontWeight: 700,
            cursor: processing || (!recording && segments.length === 0) ? 'not-allowed' : 'pointer',
            opacity: processing || (!recording && segments.length === 0) ? 0.7 : 1
          }}
        >
          {processing ? 'Verarbeite ...' : '🧠 Zur Dokumentation'}
        </button>
      </div>

      {paused && !recording && (
        <div style={{ fontSize: '13px', opacity: 0.95, marginBottom: '10px' }}>
          Du kannst jederzeit weitere Teile aufnehmen oder Dateien hinzufuegen.
        </div>
      )}

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

                <button
                  onClick={() => removeSegment(segment.id)}
                  style={{
                    border: 'none',
                    borderRadius: '8px',
                    background: '#ef4444',
                    color: '#fff',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Loeschen
                </button>
              </div>

              <audio controls src={segment.url} style={{ width: '100%' }} />
            </div>
          ))}
        </div>
      </div>

    </main>
  );
}