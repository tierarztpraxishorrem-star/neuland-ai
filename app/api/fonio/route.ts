import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type PracticeMembershipRow = {
  practice_id: string;
  role: string;
  created_at: string;
};

type FonioCallItem = {
  id: string;
  phoneNumber: string;
  status: string;
  at: string;
  direction?: string;
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

const resolvePracticeAccess = async (req: Request) => {
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

  return {
    supabase,
    token,
    practiceId,
  };
};

const mapFonioCall = (raw: any, index: number): FonioCallItem => {
  const id = String(raw?.id || raw?.call_id || raw?.uuid || `call-${index}`);
  const phoneNumber = String(
    raw?.phoneNumber || raw?.phone_number || raw?.from || raw?.caller || raw?.number || 'Unbekannt',
  );
  const status = String(raw?.status || raw?.state || 'unknown');
  const at = String(raw?.at || raw?.created_at || raw?.timestamp || raw?.time || new Date().toISOString());
  const direction = raw?.direction ? String(raw.direction) : undefined;

  return { id, phoneNumber, status, at, direction };
};

const getFonioConfig = () => {
  const apiKey = process.env.FONIO_API_KEY || '';
  const baseUrl = (process.env.FONIO_API_BASE_URL || 'https://api.fonio.ai').replace(/\/$/, '');
  const missedCallsPath = process.env.FONIO_MISSED_CALLS_PATH || '/calls?status=missed';
  const callbackPath = process.env.FONIO_CALLBACK_PATH || '/callbacks';

  return { apiKey, baseUrl, missedCallsPath, callbackPath };
};

const toAbsoluteUrl = (baseUrl: string, endpointPath: string) => {
  const path = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${baseUrl}${path}`;
};

export async function GET(req: Request) {
  try {
    const access = await resolvePracticeAccess(req);
    if ('error' in access) return access.error;

    const { apiKey, baseUrl, missedCallsPath } = getFonioConfig();
    if (!apiKey) {
      return NextResponse.json({ error: 'FONIO_API_KEY fehlt.' }, { status: 500 });
    }

    const fonioRes = await fetch(toAbsoluteUrl(baseUrl, missedCallsPath), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!fonioRes.ok) {
      const detail = await fonioRes.text();
      return NextResponse.json(
        { error: 'Fonio-Anrufliste konnte nicht geladen werden.', detail: detail.slice(0, 2000) },
        { status: 502 },
      );
    }

    const payload = await fonioRes.json().catch(() => null);
    const rawCalls = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.calls)
        ? payload.calls
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    const calls = rawCalls.map(mapFonioCall);

    return NextResponse.json({ enabled: true, practiceId: access.practiceId, calls });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/fonio] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const access = await resolvePracticeAccess(req);
    if ('error' in access) return access.error;

    const { apiKey, baseUrl, callbackPath } = getFonioConfig();
    if (!apiKey) {
      return NextResponse.json({ error: 'FONIO_API_KEY fehlt.' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const phoneNumber = String(body?.phoneNumber || '').trim();
    if (!phoneNumber) {
      return NextResponse.json({ error: 'phoneNumber ist erforderlich.' }, { status: 400 });
    }

    const callbackPayload = {
      phoneNumber,
      phone_number: phoneNumber,
      number: phoneNumber,
      reason: String(body?.reason || 'Rueckruf aus Neuland AI Kommunikation').slice(0, 200),
    };

    const fonioRes = await fetch(toAbsoluteUrl(baseUrl, callbackPath), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(callbackPayload),
    });

    if (!fonioRes.ok) {
      const detail = await fonioRes.text();
      return NextResponse.json(
        { error: 'Fonio-Rueckruf konnte nicht erstellt werden.', detail: detail.slice(0, 2000) },
        { status: 502 },
      );
    }

    const payload = await fonioRes.json().catch(() => null);
    return NextResponse.json({ ok: true, payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/fonio] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
