import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type PracticeMembershipRow = {
  practice_id: string;
  role: string;
  created_at: string;
};

type YeastarCallItem = {
  id: string;
  number: string;
  status: string;
  at: string;
  raw: Record<string, unknown>;
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

  return { practiceId };
};

const getYeastarConfig = () => {
  const baseUrl = (process.env.YEASTAR_API_BASE_URL || 'https://api.yeastar.com/openapi/v1.0').replace(/\/$/, '');
  const callsPath = process.env.YEASTAR_CALLS_PATH || '/calls?status=missed';
  const apiKey = process.env.YEASTAR_API_KEY || '';
  const token = process.env.YEASTAR_ACCESS_TOKEN || '';

  return { baseUrl, callsPath, apiKey, token };
};

const toAbsoluteUrl = (baseUrl: string, endpointPath: string) => {
  const path = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${baseUrl}${path}`;
};

const mapCallItem = (raw: any, index: number): YeastarCallItem => {
  const id = String(raw?.id || raw?.call_id || raw?.record_id || `yeastar-${index}`);
  const number = String(raw?.number || raw?.phone_number || raw?.from || raw?.caller || raw?.callee || 'Unbekannt');
  const status = String(raw?.status || raw?.state || raw?.result || 'unknown');
  const at = String(raw?.at || raw?.created_at || raw?.time || raw?.timestamp || new Date().toISOString());

  return {
    id,
    number,
    status,
    at,
    raw: raw && typeof raw === 'object' ? raw : {},
  };
};

export async function GET(req: Request) {
  const access = await resolveAccess(req);
  if ('error' in access) return access.error;

  const { baseUrl, callsPath, apiKey, token } = getYeastarConfig();
  const credential = token || apiKey;
  if (!credential) {
    return NextResponse.json({ error: 'YEASTAR_API_KEY oder YEASTAR_ACCESS_TOKEN fehlt.' }, { status: 500 });
  }

  const yeastarRes = await fetch(toAbsoluteUrl(baseUrl, callsPath), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${credential}`,
      'X-API-Key': credential,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!yeastarRes.ok) {
    const detail = await yeastarRes.text();
    return NextResponse.json(
      { error: 'Yeastar-Daten konnten nicht geladen werden.', detail: detail.slice(0, 2000) },
      { status: 502 },
    );
  }

  const payload = await yeastarRes.json().catch(() => null);

  if (payload && typeof payload === 'object' && 'errcode' in payload) {
    const errcode = Number((payload as any).errcode || 0);
    if (errcode !== 0) {
      return NextResponse.json(
        {
          error: 'Yeastar-API hat einen Fehler gemeldet.',
          detail: String((payload as any).errmsg || 'Unbekannter Yeastar-Fehler'),
          errcode,
        },
        { status: 502 },
      );
    }
  }

  const rawCalls = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.calls)
      ? payload.calls
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.records)
          ? payload.records
        : [];

  const calls = rawCalls.map(mapCallItem);
  return NextResponse.json({ ok: true, practiceId: access.practiceId, calls });
}