import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { appendYeastarWebhookEvent } from '../../../../lib/yeastarWebhookStore';

const extractSecret = (req: Request, body: any, url: URL) => {
  const headerSecret = req.headers.get('x-yeastar-secret') || req.headers.get('x-webhook-secret') || '';
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const querySecret = url.searchParams.get('secret') || '';
  const bodySecret = typeof body?.secret === 'string' ? body.secret : '';

  return headerSecret || bearer || querySecret || bodySecret;
};

const normalizePayload = (input: unknown) => {
  if (!input || typeof input !== 'object') return {};
  return input as Record<string, unknown>;
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Handle Yeastar event 30012 (Call End Details):
 * Insert a new call_recordings row as `pending`. The cron worker picks it up
 * every 5 min and runs the transcription/summary pipeline.
 */
async function handleCallEnd(payload: Record<string, unknown>) {
  const sb = getServiceClient();
  if (!sb) {
    console.error('[Yeastar Webhook] Supabase Service-Client fehlt – call_recordings können nicht gespeichert werden.');
    return;
  }

  const practiceId = process.env.YEASTAR_DEFAULT_PRACTICE_ID || '';
  if (!practiceId) {
    console.error('[Yeastar Webhook] YEASTAR_DEFAULT_PRACTICE_ID fehlt – call_recordings-INSERT übersprungen.');
    return;
  }

  // Yeastar 30012 payload structure
  const sn = String(payload.sn || '');
  const callId = String(payload.callid || payload.call_id || sn || '');
  const caller = String(payload.callfrom || payload.caller || payload.from || '');
  const callee = String(payload.callto || payload.callee || payload.to || '');
  const duration = Number(payload.callduraction || payload.duration || 0);
  const timeStart = String(payload.timestart || payload.start_time || '');
  const timeEnd = String(payload.timeend || payload.end_time || '');
  const recording = String(payload.recording || payload.recording_file || '');
  const callDir = String(payload.calldirection || payload.direction || '');
  const direction = callDir.toLowerCase().includes('inbound')
    ? 'inbound'
    : callDir.toLowerCase().includes('outbound')
      ? 'outbound'
      : 'internal';

  // Skip calls without recording
  if (!recording) {
    console.log(`[Yeastar Webhook] Anruf ${callId} ohne Aufnahme – übersprungen.`);
    return;
  }

  const { error } = await sb.from('call_recordings').insert({
    practice_id: practiceId,
    yeastar_call_id: callId,
    yeastar_recording_id: recording,
    caller,
    callee,
    direction,
    duration_seconds: duration,
    started_at: timeStart || null,
    ended_at: timeEnd || null,
    status: 'pending',
    raw_event: payload,
  });

  if (error) {
    console.error('[Yeastar Webhook] call_recordings insert Fehler:', error.message);
  }
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, message: 'Yeastar webhook endpoint is reachable.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/yeastar/webhook] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const expectedSecret = process.env.YEASTAR_WEBHOOK_SECRET || '';
    const providedSecret = extractSecret(req, body, url);

    if (expectedSecret && providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Invalid webhook secret.' }, { status: 401 });
    }

    const payload = normalizePayload(body);
    const eventType = String(payload.event || payload.event_type || payload.type || payload.msgType || 'unknown');
    const number = String(payload.number || payload.caller || payload.from || payload.callee || 'unknown');

    // Store event in file-based log (backward compat)
    await appendYeastarWebhookEvent({
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      eventType,
      number,
      payload,
    });

    // Handle call-end event (30012) → store `pending` row; cron worker processes it.
    if (eventType === '30012' || eventType === 'CallEndDetails' || eventType === 'call_end') {
      await handleCallEnd(payload);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/yeastar/webhook] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
