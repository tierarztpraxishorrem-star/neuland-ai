import { NextResponse } from 'next/server';
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

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Yeastar webhook endpoint is reachable.' });
}

export async function POST(req: Request) {
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

  await appendYeastarWebhookEvent({
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    eventType,
    number,
    payload,
  });

  return NextResponse.json({ ok: true });
}