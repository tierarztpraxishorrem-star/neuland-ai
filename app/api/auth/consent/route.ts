import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type ConsentItem = {
  type: string;
  accepted: boolean;
  acceptedAt?: string;
};

type ConsentPayload = {
  consents?: ConsentItem[];
  source?: string;
};

type PracticeMembershipRow = {
  practice_id: string;
  role: string;
  created_at: string;
};

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

export async function POST(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const supabase = getSupabaseClientForToken(token);
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase-Konfiguration fehlt.' }, { status: 500 });
  }

  const userRes = await supabase.auth.getUser(token);
  const userId = userRes.data.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Ungültige Sitzung.' }, { status: 401 });
  }

  const membershipsRes = await supabase
    .from('practice_memberships')
    .select('practice_id, role, created_at')
    .order('created_at', { ascending: true });

  const memberships = (membershipsRes.data || []) as PracticeMembershipRow[];
  const rankRole = (role: string) => {
    if (role === 'owner') return 0;
    if (role === 'admin') return 1;
    return 2;
  };

  const sortedMemberships = [...memberships].sort((a, b) => {
    const ra = rankRole(a.role);
    const rb = rankRole(b.role);
    if (ra !== rb) return ra - rb;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  const practiceId = sortedMemberships[0]?.practice_id || null;

  const body = (await req.json().catch(() => ({}))) as ConsentPayload;
  const source = String(body.source || 'registration').trim() || 'registration';
  const consents = Array.isArray(body.consents) ? body.consents : [];

  if (!consents.length) {
    return NextResponse.json({ error: 'consents ist erforderlich.' }, { status: 400 });
  }

  const rows = consents
    .map((item) => {
      const type = String(item.type || '').trim();
      if (!type) return null;

      const acceptedAt = item.acceptedAt ? new Date(item.acceptedAt).toISOString() : new Date().toISOString();

      return {
        user_id: userId,
        practice_id: practiceId,
        consent_type: type,
        accepted: Boolean(item.accepted),
        accepted_at: acceptedAt,
        source,
      };
    })
    .filter(
      (
        item,
      ): item is {
        user_id: string;
        practice_id: string | null;
        consent_type: string;
        accepted: boolean;
        accepted_at: string;
        source: string;
      } => Boolean(item),
    );

  if (!rows.length) {
    return NextResponse.json({ error: 'Keine gültigen consents übergeben.' }, { status: 400 });
  }

  const { error } = await supabase.from('user_consents').insert(rows);
  if (error) {
    return NextResponse.json(
      {
        error: 'Consent-Audit konnte nicht gespeichert werden.',
        details: error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
