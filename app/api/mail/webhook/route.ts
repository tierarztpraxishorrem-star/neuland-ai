import { NextResponse } from 'next/server';
import { getServiceSupabaseClient } from '../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

// Microsoft Graph ruft diesen Endpunkt bei Subscription-Validation + Change-Notifications auf.
// 1. Validation: GET-Query `validationToken=...` → als plain text zurückgeben (200) innerhalb 10s.
// 2. Notifications: POST-Body mit `value: [{ subscriptionId, clientState, resourceData, ... }]`.
//    clientState wird gegen die gespeicherte Subscription geprüft.

type GraphNotification = {
  subscriptionId: string;
  clientState?: string;
  changeType: string;
  resource: string;
  resourceData?: { id?: string };
};

async function handleValidation(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get('validationToken');
  if (!validationToken) return null;
  return new Response(validationToken, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(req: Request) {
  try {
    const validationResponse = await handleValidation(req);
    if (validationResponse) return validationResponse;

    const service = getServiceSupabaseClient();
    if (!service) {
      return NextResponse.json({ error: 'Service-Konfiguration fehlt.' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({} as unknown));
    const notifications: GraphNotification[] = Array.isArray((body as { value?: unknown }).value)
      ? ((body as { value: GraphNotification[] }).value)
      : [];

    if (notifications.length === 0) {
      return NextResponse.json({ ok: true });
    }

    // clientState-Validation pro Subscription (cached via Map)
    const subsRes = await service
      .from('mail_subscriptions')
      .select('subscription_id, client_state')
      .in('subscription_id', [...new Set(notifications.map((n) => n.subscriptionId))]);

    const knownStates = new Map<string, string>();
    for (const row of (subsRes.data || []) as Array<{ subscription_id: string; client_state: string }>) {
      knownStates.set(row.subscription_id, row.client_state);
    }

    const inserts: Array<{ message_id: string; change_type: string }> = [];
    for (const n of notifications) {
      const expected = knownStates.get(n.subscriptionId);
      if (!expected) continue; // unbekannte Subscription → ignorieren
      if (n.clientState !== expected) continue; // falsches secret → ignorieren
      const messageId = n.resourceData?.id;
      if (!messageId) continue;
      inserts.push({ message_id: messageId, change_type: n.changeType || 'unknown' });
    }

    if (inserts.length > 0) {
      await service.from('mail_notifications').insert(inserts);
    }

    return NextResponse.json({ ok: true, processed: inserts.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/webhook] POST Fehler:', error);
    // Bei Fehlern trotzdem 200 zurückgeben, damit Graph keine Retries schickt (optional).
    // Wir loggen stattdessen und setzen 500, damit Graph retried.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Manche Graph-Validierungen kommen als GET. Spiegel gleich mit.
export async function GET(req: Request) {
  const validationResponse = await handleValidation(req);
  if (validationResponse) return validationResponse;
  return NextResponse.json({ ok: true });
}
