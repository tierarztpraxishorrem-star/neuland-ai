import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readYeastarWebhookEvents } from '../../../../lib/yeastarWebhookStore';

const getBearerToken = (req: Request) => {
  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const getSupabaseClientForToken = (token: string) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  return createClient(url, anon, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
};

const ensureAuthenticatedMembership = async (req: Request) => {
  const token = getBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 }) };
  }

  const supabase = getSupabaseClientForToken(token);
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Supabase-Konfiguration fehlt.' }, { status: 500 }) };
  }

  const userRes = await supabase.auth.getUser(token);
  if (!userRes.data.user) {
    return { error: NextResponse.json({ error: 'Ungültige Sitzung.' }, { status: 401 }) };
  }

  const membershipsRes = await supabase
    .from('practice_memberships')
    .select('practice_id')
    .limit(1);

  if (membershipsRes.error || !membershipsRes.data || membershipsRes.data.length === 0) {
    return { error: NextResponse.json({ error: 'Keine Praxiszuordnung gefunden.' }, { status: 403 }) };
  }

  return { ok: true };
};

export async function GET(req: Request) {
  const auth = await ensureAuthenticatedMembership(req);
  if ('error' in auth) return auth.error;

  const events = await readYeastarWebhookEvents();
  return NextResponse.json({ ok: true, events: events.slice(0, 50) });
}