import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { downloadRecording } from '../../../../lib/yeastarApi';
import { postMessage, isSlackConfigured } from '../../../../lib/server/slack';

export const maxDuration = 300;
export const runtime = 'nodejs';

/**
 * Background call processing pipeline:
 * 1. Download recording from Yeastar PBX
 * 2. Transcribe audio (OpenAI Whisper → AssemblyAI fallback)
 * 3. Generate veterinary-context AI summary (GPT-4o)
 * 4. Update call_recordings row with transcript + summary
 */

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateStatus(
  sb: any,
  id: string,
  status: string,
  extra?: Record<string, unknown>
) {
  await sb.from('call_recordings').update({ status, ...extra }).eq('id', id);
}

/** Download audio from Yeastar and return as blob/buffer */
async function fetchRecordingAudio(recordingId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const result = await downloadRecording(recordingId);
  if (!result?.url) return null;

  const res = await fetch(result.url, { headers: { 'User-Agent': 'OpenAPI' } });
  if (!res.ok) return null;

  const arrayBuf = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'audio/wav';
  return { buffer: Buffer.from(arrayBuf), contentType };
}

/** Transcribe audio via OpenAI Whisper */
async function transcribeWithOpenAI(buffer: Buffer, contentType: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const ext = contentType.includes('mp3') ? 'mp3' : contentType.includes('wav') ? 'wav' : 'webm';
  const bytes = new Uint8Array(buffer);
  const blob = new Blob([bytes], { type: contentType });
  const file = new File([blob], `call.${ext}`, { type: contentType });

  const body = new FormData();
  body.append('file', file);
  body.append('model', 'gpt-4o-mini-transcribe');
  body.append('language', 'de');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });

  if (!res.ok) return null;
  const json = await res.json();
  return typeof json?.text === 'string' ? json.text.trim() : null;
}

/** Transcribe audio via AssemblyAI (fallback) */
async function transcribeWithAssemblyAI(buffer: Buffer): Promise<string | null> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) return null;

  // Upload
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/octet-stream' },
    body: new Uint8Array(buffer),
  });
  if (!uploadRes.ok) return null;
  const { upload_url } = await uploadRes.json();
  if (!upload_url) return null;

  // Request transcription
  const txRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url, language_code: 'de' }),
  });
  if (!txRes.ok) return null;
  const { id } = await txRes.json();
  if (!id) return null;

  // Poll
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${encodeURIComponent(id)}`, {
      headers: { authorization: apiKey },
    });
    if (!pollRes.ok) continue;
    const data = await pollRes.json();
    if (data.status === 'completed') return data.text || null;
    if (data.status === 'error') return null;
  }
  return null;
}

/** Generate a veterinary-context call summary via GPT-4o */
async function generateSummary(transcript: string, caller: string, callee: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !transcript) return null;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `Du bist ein KI-Assistent in einer Tierarztpraxis (Neuland AI). Fasse das folgende Telefonat zwischen ${caller || 'Anrufer'} und ${callee || 'Empfänger'} prägnant zusammen.

Struktur:
- **Anliegen**: Worum ging es?
- **Details**: Wichtige Symptome, Tiere, Medikamente, Termine
- **Vereinbarung**: Was wurde besprochen/vereinbart?
- **Handlungsbedarf**: Offene To-dos für die Praxis

Halte die Zusammenfassung kurz und praxistauglich (max. 200 Wörter). Verwende medizinische Fachbegriffe wo angemessen.`,
        },
        {
          role: 'user',
          content: `Transkript des Telefonats:\n\n${transcript}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return json?.choices?.[0]?.message?.content?.trim() || null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { recordingId } = body as { recordingId?: string };

  if (!recordingId) {
    return NextResponse.json({ error: 'recordingId fehlt.' }, { status: 400 });
  }

  const sb = getServiceClient();
  if (!sb) {
    return NextResponse.json({ error: 'Supabase Service-Client nicht konfiguriert.' }, { status: 500 });
  }

  // Load the call_recordings row
  const { data: row, error: loadErr } = await sb
    .from('call_recordings')
    .select('*')
    .eq('id', recordingId)
    .single();

  if (loadErr || !row) {
    return NextResponse.json({ error: 'Aufnahme nicht gefunden.' }, { status: 404 });
  }

  // Skip already processed
  if (row.status === 'done') {
    return NextResponse.json({ ok: true, message: 'Bereits verarbeitet.' });
  }

  try {
    // --- 1. Download recording ---
    await updateStatus(sb, recordingId, 'downloading');
    const audio = await fetchRecordingAudio(row.yeastar_recording_id);
    if (!audio) {
      await updateStatus(sb, recordingId, 'failed', { error_message: 'Aufnahme konnte nicht heruntergeladen werden.' });
      return NextResponse.json({ error: 'Download fehlgeschlagen.' }, { status: 502 });
    }

    // --- 2. Transcribe ---
    await updateStatus(sb, recordingId, 'transcribing');
    let transcript = await transcribeWithOpenAI(audio.buffer, audio.contentType);
    if (!transcript) {
      transcript = await transcribeWithAssemblyAI(audio.buffer);
    }
    if (!transcript) {
      await updateStatus(sb, recordingId, 'failed', { error_message: 'Transkription fehlgeschlagen (OpenAI + AssemblyAI).' });
      return NextResponse.json({ error: 'Transkription fehlgeschlagen.' }, { status: 502 });
    }

    // --- 3. AI Summary ---
    await updateStatus(sb, recordingId, 'summarizing');
    const summary = await generateSummary(transcript, row.caller, row.callee);

    // --- 4. Done ---
    await updateStatus(sb, recordingId, 'done', {
      transcript,
      summary: summary || 'Zusammenfassung konnte nicht erstellt werden.',
      recording_url: null, // We don't persist the audio URL for privacy
    });

    // --- 5. Slack-Benachrichtigung (optional) ---
    const slackChannel = process.env.YEASTAR_SLACK_CHANNEL;
    if (slackChannel && summary && isSlackConfigured()) {
      try {
        const durationMin = Math.round((row.duration_seconds || 0) / 60);
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
        const linkLine = appUrl ? `\n→ <${appUrl}/kommunikation|In Neuland AI öffnen>` : '';
        const preview = summary.length > 500 ? `${summary.slice(0, 500)}…` : summary;
        const text =
          `📞 *Neuer Anruf zusammengefasst*\n` +
          `Von: ${row.caller || 'Unbekannt'} → ${row.callee || 'Unbekannt'}\n` +
          `Dauer: ${durationMin} Min\n\n` +
          `*Zusammenfassung:*\n${preview}${linkLine}`;
        await postMessage(slackChannel, text);
      } catch (slackErr) {
        console.error('[process-call] Slack-Benachrichtigung fehlgeschlagen:', slackErr);
      }
    }

    return NextResponse.json({ ok: true, transcript: transcript.slice(0, 200) + '...', hasSummary: !!summary });
  } catch (err: any) {
    console.error('[process-call] Pipeline Fehler:', err);
    await updateStatus(sb, recordingId, 'failed', { error_message: err?.message || 'Unbekannter Fehler' });
    return NextResponse.json({ error: 'Pipeline fehlgeschlagen.' }, { status: 500 });
  }
}
