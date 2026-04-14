import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type MembershipRole = 'owner' | 'admin' | 'member';

type PracticeMembershipRow = {
  practice_id: string;
  role: MembershipRole;
  created_at: string;
};

type PracticeFeatureRow = {
  features: Record<string, unknown> | null;
};

export type UserPracticeContext = {
  token: string;
  userId: string;
  practiceId: string;
  role: MembershipRole;
  supabase: SupabaseClient;
};

type GetUserPracticeOptions = {
  allowedRoles?: MembershipRole[];
};

type GetUserPracticeResult =
  | { ok: true; context: UserPracticeContext }
  | { ok: false; response: NextResponse };

const rankRole = (role: MembershipRole) => {
  if (role === 'owner') return 0;
  if (role === 'admin') return 1;
  return 2;
};

export const getBearerToken = (req: Request) => {
  const header = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const getRuntimeSupabaseConfig = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url, anon };
};

export const getUserScopedSupabaseClient = (token: string) => {
  const cfg = getRuntimeSupabaseConfig();
  if (!cfg) return null;

  return createClient(cfg.url, cfg.anon, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export const getServiceSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export async function getUserPractice(req: Request, options?: GetUserPracticeOptions): Promise<GetUserPracticeResult> {
  const token = getBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 }),
    };
  }

  const supabase = getUserScopedSupabaseClient(token);
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Supabase-Konfiguration fehlt.' }, { status: 500 }),
    };
  }

  const userRes = await supabase.auth.getUser(token);
  const userId = userRes.data.user?.id || '';
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Ungültige Sitzung.' }, { status: 401 }),
    };
  }

  const membershipsRes = await supabase
    .from('practice_memberships')
    .select('practice_id, role, created_at')
    .order('created_at', { ascending: true });

  const rows = (membershipsRes.data || []) as PracticeMembershipRow[];
  if (membershipsRes.error || rows.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Keine Praxiszuordnung gefunden.' }, { status: 403 }),
    };
  }

  const requestedPracticeId =
    req.headers.get('x-practice-id') ||
    req.headers.get('X-Practice-Id') ||
    null;

  const selected = requestedPracticeId
    ? rows.find((entry) => entry.practice_id === requestedPracticeId)
    : [...rows].sort((a, b) => {
        const ra = rankRole(a.role);
        const rb = rankRole(b.role);
        if (ra !== rb) return ra - rb;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      })[0];

  if (!selected?.practice_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Praxis-ID fehlt.' }, { status: 403 }),
    };
  }

  if (options?.allowedRoles && !options.allowedRoles.includes(selected.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 }),
    };
  }

  return {
    ok: true,
    context: {
      token,
      userId,
      practiceId: selected.practice_id,
      role: selected.role,
      supabase,
    },
  };
}

export async function assertHrFeatureEnabled(supabase: SupabaseClient, practiceId: string) {
  const practiceRes = await supabase
    .from('practices')
    .select('features')
    .eq('id', practiceId)
    .maybeSingle();

  if (practiceRes.error || !practiceRes.data) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Praxis nicht gefunden.' }, { status: 404 }),
    } as const;
  }

  const row = practiceRes.data as PracticeFeatureRow;
  const enabled = Boolean(row.features && typeof row.features === 'object' && row.features['hr_module'] === true);
  if (!enabled) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 }),
    } as const;
  }

  return { ok: true } as const;
}
