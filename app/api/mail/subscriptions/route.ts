import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getUserPractice, getServiceSupabaseClient } from '../../../../lib/server/getUserPractice';
import { graphFetch, isMsGraphConfigured, MsGraphError } from '../../../../lib/server/msGraph';
import { MAILBOX_ADDRESS } from '../../../../lib/server/mail';

export const runtime = 'nodejs';

// Max. Laufzeit für Mail-Subscriptions laut Graph-Docs: 4230 Minuten (~2.9 Tage).
const MAX_SUBSCRIPTION_MINUTES = 4230;

function resourcePath(): string {
  return `users/${MAILBOX_ADDRESS}/mailFolders/inbox/messages`;
}

function webhookUrl(): string {
  const base = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://neuland-ai-snowy.vercel.app';
  return `${base.replace(/\/$/, '')}/api/mail/webhook`;
}

function expiryIso(): string {
  return new Date(Date.now() + MAX_SUBSCRIPTION_MINUTES * 60_000).toISOString();
}

// GET → laufende Subscriptions dieser App (DB-Sicht) + Gesundheitsstatus
export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const service = getServiceSupabaseClient();
    if (!service) return NextResponse.json({ error: 'Service-Konfiguration fehlt.' }, { status: 500 });

    const { data, error } = await service
      .from('mail_subscriptions')
      .select('id, subscription_id, resource, change_types, expires_at, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const now = Date.now();
    const enriched = (data || []).map((s) => ({
      ...s,
      minutes_until_expiry: Math.round((new Date(s.expires_at).getTime() - now) / 60_000),
      active: new Date(s.expires_at).getTime() > now,
    }));

    return NextResponse.json({ ok: true, subscriptions: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/subscriptions] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST → neue Subscription anlegen (oder bestehende ersetzen)
export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Microsoft Graph ist nicht konfiguriert.' }, { status: 503 });
    }

    const service = getServiceSupabaseClient();
    if (!service) return NextResponse.json({ error: 'Service-Konfiguration fehlt.' }, { status: 500 });

    const clientState = randomUUID();
    const expiration = expiryIso();
    const resource = resourcePath();

    const res = await graphFetch('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        changeType: 'created,updated',
        notificationUrl: webhookUrl(),
        resource,
        expirationDateTime: expiration,
        clientState,
      }),
    });

    if (!res.ok) {
      let message = `Subscription-Anlage fehlgeschlagen (${res.status}).`;
      try {
        const body = await res.json();
        if (body?.error?.message) message = `Graph: ${body.error.message}`;
      } catch {}
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const sub = (await res.json()) as { id: string; expirationDateTime?: string };

    // In DB ablegen (upsert nach subscription_id)
    await service
      .from('mail_subscriptions')
      .upsert(
        {
          subscription_id: sub.id,
          resource,
          change_types: 'created,updated',
          client_state: clientState,
          expires_at: sub.expirationDateTime || expiration,
          created_by: auth.context.userId,
        },
        { onConflict: 'subscription_id' }
      );

    return NextResponse.json({ ok: true, subscriptionId: sub.id, expiresAt: sub.expirationDateTime });
  } catch (error) {
    if (error instanceof MsGraphError) {
      return NextResponse.json({ error: error.message }, { status: error.status || 500 });
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/subscriptions] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH → alle Subscriptions erneuern (oder eine per ?id=)
export async function PATCH(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Microsoft Graph ist nicht konfiguriert.' }, { status: 503 });
    }

    const service = getServiceSupabaseClient();
    if (!service) return NextResponse.json({ error: 'Service-Konfiguration fehlt.' }, { status: 500 });

    const url = new URL(req.url);
    const onlyId = url.searchParams.get('id');

    let query = service.from('mail_subscriptions').select('subscription_id');
    if (onlyId) query = query.eq('subscription_id', onlyId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const renewed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    const expiration = expiryIso();

    for (const sub of (data || []) as Array<{ subscription_id: string }>) {
      try {
        const res = await graphFetch(`/subscriptions/${encodeURIComponent(sub.subscription_id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ expirationDateTime: expiration }),
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
          .update({ expires_at: updated.expirationDateTime || expiration })
          .eq('subscription_id', sub.subscription_id);
        renewed.push(sub.subscription_id);
      } catch (err) {
        failed.push({ id: sub.subscription_id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({ ok: true, renewed, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/subscriptions] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE → Subscription bei Graph löschen (+ Zeile) via ?id=
export async function DELETE(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const service = getServiceSupabaseClient();
    if (!service) return NextResponse.json({ error: 'Service-Konfiguration fehlt.' }, { status: 500 });

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id Query-Parameter fehlt.' }, { status: 400 });

    // Bei Graph löschen (soft-fail – falls schon weg, egal)
    try {
      await graphFetch(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // ignorieren
    }

    await service.from('mail_subscriptions').delete().eq('subscription_id', id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/subscriptions] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
