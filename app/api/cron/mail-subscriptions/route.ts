import { NextResponse } from 'next/server';
import { getServiceSupabaseClient } from '../../../../lib/server/getUserPractice';
import { graphFetch, isMsGraphConfigured } from '../../../../lib/server/msGraph';

export const runtime = 'nodejs';

// Cron-Route: erneuert Subscriptions, die in < 24h ablaufen.
// Authentifizierung: CRON_SECRET als Bearer OR Vercel's x-vercel-cron-signature.
// Läuft z.B. alle 6h (siehe vercel.json).
const RENEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SUBSCRIPTION_MINUTES = 4230;

// Alte Notifications nach 7 Tagen aufräumen (verhindert Tabellen-Wildwuchs)
const NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron-signature')) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }

    const service = getServiceSupabaseClient();
    if (!service) return NextResponse.json({ error: 'Service-Konfiguration fehlt.' }, { status: 500 });

    const renewed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    let cleaned = 0;

    if (isMsGraphConfigured()) {
      // Fällige Subscriptions holen
      const cutoff = new Date(Date.now() + RENEW_WINDOW_MS).toISOString();
      const { data } = await service
        .from('mail_subscriptions')
        .select('subscription_id')
        .lt('expires_at', cutoff);

      const newExpiration = new Date(Date.now() + MAX_SUBSCRIPTION_MINUTES * 60_000).toISOString();
      for (const sub of (data || []) as Array<{ subscription_id: string }>) {
        try {
          const res = await graphFetch(`/subscriptions/${encodeURIComponent(sub.subscription_id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ expirationDateTime: newExpiration }),
          });
          if (!res.ok) {
            let msg = `Renew fehlgeschlagen (${res.status})`;
            try {
              const body = await res.json();
              if (body?.error?.message) msg = body.error.message;
            } catch {}
            failed.push({ id: sub.subscription_id, error: msg });
            continue;
          }
          const updated = (await res.json()) as { expirationDateTime?: string };
          await service
            .from('mail_subscriptions')
            .update({ expires_at: updated.expirationDateTime || newExpiration })
            .eq('subscription_id', sub.subscription_id);
          renewed.push(sub.subscription_id);
        } catch (err) {
          failed.push({ id: sub.subscription_id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    // Alte Notifications aufräumen
    const cleanCutoff = new Date(Date.now() - NOTIFICATION_RETENTION_MS).toISOString();
    const { count } = await service
      .from('mail_notifications')
      .delete({ count: 'exact' })
      .lt('occurred_at', cleanCutoff);
    cleaned = count || 0;

    return NextResponse.json({ ok: true, renewed, failed, cleaned });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/cron/mail-subscriptions] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
