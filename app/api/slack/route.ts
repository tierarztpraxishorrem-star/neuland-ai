// Diese Route ist lokal erreichbar unter:
//   http://localhost:3000/api/slack
// (Port ggf. anpassen, falls Next.js auf anderem Port läuft)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

const rankRole = (role: string) => {
  if (role === 'owner') return 0;
  if (role === 'admin') return 1;
  return 2;
};

const resolveAccess = async (req: Request) => {
  const token = getBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 }) };
  }

  const supabase = getSupabaseClientForToken(token);
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Supabase-Konfiguration fehlt.' }, { status: 500 }) };
  }

  const userRes = await supabase.auth.getUser(token);
  const user = userRes.data.user;
  if (!user) {
    return { error: NextResponse.json({ error: 'Ungültige Sitzung.' }, { status: 401 }) };
  }

  const userMeta = (user.user_metadata || {}) as {
    full_name?: string;
    first_name?: string;
    last_name?: string;
  };
  const metaFullName = String(userMeta.full_name || '').trim();
  const metaFirstName = String(userMeta.first_name || '').trim();
  const metaLastName = String(userMeta.last_name || '').trim();
  const senderName =
    metaFullName || [metaFirstName, metaLastName].filter(Boolean).join(' ') || user.email || 'Unbekannt';

  const membershipsRes = await supabase
    .from('practice_memberships')
    .select('practice_id, role, created_at')
    .order('created_at', { ascending: true });

  const memberships = (membershipsRes.data || []) as PracticeMembershipRow[];
  if (membershipsRes.error || memberships.length === 0) {
    return { error: NextResponse.json({ error: 'Keine Praxiszuordnung gefunden.' }, { status: 403 }) };
  }

  const sortedMemberships = [...memberships].sort((a, b) => {
    const ra = rankRole(a.role);
    const rb = rankRole(b.role);
    if (ra !== rb) return ra - rb;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  const practiceId = sortedMemberships[0]?.practice_id || null;
  if (!practiceId) {
    return { error: NextResponse.json({ error: 'Praxis-ID fehlt.' }, { status: 403 }) };
  }

  return { practiceId, senderName };
};

export async function POST(req: Request) {
  try {
    const access = await resolveAccess(req);
    if ('error' in access) return access.error;

    const webhookUrl = process.env.SLACK_INCOMING_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: 'SLACK_INCOMING_WEBHOOK_URL fehlt.' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'text ist erforderlich.' }, { status: 400 });
    }

    const payload = {
      text: `Von ${access.senderName}: ${text}`,
      username: 'Neuland Kommunikation',
      icon_emoji: ':telephone_receiver:',
    };

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!slackRes.ok) {
      const detail = await slackRes.text();
      return NextResponse.json(
        { error: 'Slack-Nachricht konnte nicht gesendet werden.', detail: detail.slice(0, 2000) },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, practiceId: access.practiceId, senderName: access.senderName });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/slack] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
