import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type PracticeMembershipRow = {
  user_id?: string | null;
  practice_id: string;
  role: string;
  created_at: string;
};

type CaseRow = {
  created_at: string | null;
  updated_at: string | null;
  template: string | null;
  user_id?: string | null;
  title?: string | null;
  result?: string | null;
};

type InvitationRow = {
  accepted_at: string | null;
  expires_at: string | null;
};

type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

type JoinRequestRow = {
  status: JoinRequestStatus;
};

type ApiRequestLogRow = {
  status_code: number | null;
  latency_ms: number | null;
};

type AdminStatsPayload = {
  practiceId: string;
  updatedAt: string;
  cases: {
    total: number;
    last7Days: number;
    last30Days: number;
    missingTitle: number;
    missingRequiredFields: number;
    estimatedTimeSavedMinutes: number;
    averageProcessingMinutes: number | null;
    perWeek: Array<{ week: string; count: number }>;
    perMonth: Array<{ month: string; count: number }>;
    byPractice: Array<{ practiceId: string; label: string; total: number; last30Days: number }>;
  };
  templates: {
    total: number;
    usage: Array<{ template: string; count: number; sharePercent: number }>;
  };
  invitations: {
    total: number;
    open: number;
    accepted: number;
    expired: number;
  };
  joinRequests: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  memberships: {
    total: number;
    owners: number;
    admins: number;
    members: number;
  };
  activityByRole: {
    owner: number;
    admin: number;
    member: number;
    unknown: number;
  };
  systemStability: {
    windowDays: number;
    dataAvailable: boolean;
    totalRequests: number;
    errorRequests: number;
    errorRatePercent: number | null;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
  };
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const weekKey = (value: Date) => {
  const d = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const monthKey = (value: Date) => `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;

const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx] ?? null;
};

const safeDate = (value: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
    auth: {
      autoRefreshToken: false,
      persistSession: false,
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

  const sorted = [...memberships].sort((a, b) => {
    const ra = rankRole(a.role);
    const rb = rankRole(b.role);
    if (ra !== rb) return ra - rb;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  const practiceId = sorted[0]?.practice_id || null;
  if (!practiceId) {
    return { error: NextResponse.json({ error: 'Praxis-ID fehlt.' }, { status: 403 }) };
  }

  return {
    supabase,
    practiceId,
  };
};

export async function GET(req: Request) {
  const access = await resolvePracticeAccess(req);
  if ('error' in access) return access.error;

  const { supabase, practiceId } = access;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const from7Days = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const from30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const from365Days = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();

  const [
    casesTotalRes,
    cases7Res,
    cases30Res,
    casesMissingTitleRes,
    templatesTotalRes,
    invitationsRes,
    joinRequestsRes,
    membershipsRes,
  ] = await Promise.all([
    supabase.from('cases').select('id', { count: 'exact', head: true }).eq('practice_id', practiceId),
    supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practiceId)
      .gte('created_at', from7Days),
    supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practiceId)
      .gte('created_at', from30Days),
    supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practiceId)
      .or('title.is.null,title.eq.'),
    supabase.from('templates').select('id', { count: 'exact', head: true }).eq('practice_id', practiceId),
    supabase
      .from('practice_invitations')
      .select('accepted_at, expires_at')
      .eq('practice_id', practiceId)
      .limit(2000),
    supabase
      .from('practice_join_requests')
      .select('status')
      .eq('practice_id', practiceId)
      .limit(2000),
    supabase.from('practice_memberships').select('role, user_id').eq('practice_id', practiceId).limit(5000),
  ]);

  if (
    casesTotalRes.error ||
    cases7Res.error ||
    cases30Res.error ||
    casesMissingTitleRes.error ||
    templatesTotalRes.error ||
    invitationsRes.error ||
    joinRequestsRes.error ||
    membershipsRes.error
  ) {
    return NextResponse.json({ error: 'Statistiken konnten nicht geladen werden.' }, { status: 500 });
  }

  const [casesMissingRequiredRes, casesRowsRes, practiceSettingsRes] = await Promise.all([
    supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practiceId)
      .or('title.is.null,title.eq.,result.is.null,result.eq.'),
    supabase
      .from('cases')
      .select('created_at, updated_at, template, user_id, title, result')
      .eq('practice_id', practiceId)
      .gte('created_at', from365Days)
      .limit(20000),
    supabase.from('practice_settings').select('practice_name').eq('practice_id', practiceId).maybeSingle(),
  ]);

  const invitations = (invitationsRes.data || []) as InvitationRow[];
  const joinRequests = (joinRequestsRes.data || []) as JoinRequestRow[];
  const memberships = (membershipsRes.data || []) as Array<{ role: string | null; user_id: string | null }>;
  const cases = casesRowsRes.error ? [] : ((casesRowsRes.data || []) as CaseRow[]);
  const practiceName = typeof practiceSettingsRes.data?.practice_name === 'string'
    ? practiceSettingsRes.data.practice_name
    : null;

  const invitationAccepted = invitations.filter((item) => Boolean(item.accepted_at)).length;
  const invitationExpired = invitations.filter((item) => {
    if (!item.expires_at || item.accepted_at) return false;
    return new Date(item.expires_at).getTime() < Date.now();
  }).length;
  const invitationOpen = Math.max(invitations.length - invitationAccepted - invitationExpired, 0);

  const pending = joinRequests.filter((item) => item.status === 'pending').length;
  const approved = joinRequests.filter((item) => item.status === 'approved').length;
  const rejected = joinRequests.filter((item) => item.status === 'rejected').length;

  const owners = memberships.filter((item) => item.role === 'owner').length;
  const admins = memberships.filter((item) => item.role === 'admin').length;
  const members = memberships.filter((item) => item.role === 'member').length;

  const last30Boundary = new Date(from30Days).getTime();
  const templateCounts = new Map<string, number>();
  const weeklyCounts = new Map<string, number>();
  const monthlyCounts = new Map<string, number>();
  const processingMinutes: number[] = [];
  let roleOwnerActivity = 0;
  let roleAdminActivity = 0;
  let roleMemberActivity = 0;
  let roleUnknownActivity = 0;

  const roleByUserId = new Map<string, string>();
  for (const membership of memberships) {
    if (membership.user_id) roleByUserId.set(membership.user_id, membership.role || '');
  }

  for (const row of cases) {
    const created = safeDate(row.created_at);
    if (!created) continue;

    const wk = weekKey(created);
    weeklyCounts.set(wk, (weeklyCounts.get(wk) || 0) + 1);

    const mk = monthKey(created);
    monthlyCounts.set(mk, (monthlyCounts.get(mk) || 0) + 1);

    const template = (row.template || '').trim();
    if (template) {
      templateCounts.set(template, (templateCounts.get(template) || 0) + 1);
    }

    const updated = safeDate(row.updated_at);
    if (updated && updated.getTime() > created.getTime()) {
      const minutes = (updated.getTime() - created.getTime()) / 60000;
      if (Number.isFinite(minutes) && minutes >= 0 && minutes <= 60 * 24 * 30) {
        processingMinutes.push(minutes);
      }
    }

    if (created.getTime() >= last30Boundary) {
      const role = row.user_id ? (roleByUserId.get(row.user_id) || '') : '';
      if (role === 'owner') roleOwnerActivity += 1;
      else if (role === 'admin') roleAdminActivity += 1;
      else if (role === 'member') roleMemberActivity += 1;
      else roleUnknownActivity += 1;
    }
  }

  const templateUsageTotal = [...templateCounts.values()].reduce((sum, value) => sum + value, 0);
  const topTemplateUsage = [...templateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([template, count]) => ({
      template,
      count,
      sharePercent: templateUsageTotal > 0 ? clampPercent((count / templateUsageTotal) * 100) : 0,
    }));

  const perWeek = [...weeklyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([week, count]) => ({ week, count }));

  const perMonth = [...monthlyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, count]) => ({ month, count }));

  const avgProcessingMinutes = processingMinutes.length
    ? Number((processingMinutes.reduce((sum, value) => sum + value, 0) / processingMinutes.length).toFixed(1))
    : null;

  let systemStability: AdminStatsPayload['systemStability'] = {
    windowDays: 30,
    dataAvailable: false,
    totalRequests: 0,
    errorRequests: 0,
    errorRatePercent: null,
    p50LatencyMs: null,
    p95LatencyMs: null,
  };

  const apiLogsRes = await supabase
    .from('api_request_logs')
    .select('status_code, latency_ms')
    .eq('practice_id', practiceId)
    .gte('created_at', from30Days)
    .limit(10000);

  if (!apiLogsRes.error) {
    const logs = (apiLogsRes.data || []) as ApiRequestLogRow[];
    const totalRequests = logs.length;
    const errorRequests = logs.filter((row) => (row.status_code || 0) >= 500).length;
    const latencies = logs
      .map((row) => row.latency_ms)
      .filter((value): value is number => Number.isFinite(value ?? NaN) && (value ?? 0) >= 0);

    systemStability = {
      windowDays: 30,
      dataAvailable: true,
      totalRequests,
      errorRequests,
      errorRatePercent: totalRequests > 0 ? Number((((errorRequests / totalRequests) * 100)).toFixed(2)) : 0,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
    };
  }

  const caseTotal = casesTotalRes.count ?? 0;

  const payload: AdminStatsPayload = {
    practiceId,
    updatedAt: nowIso,
    cases: {
      total: caseTotal,
      last7Days: cases7Res.count ?? 0,
      last30Days: cases30Res.count ?? 0,
      missingTitle: casesMissingTitleRes.count ?? 0,
      missingRequiredFields: casesMissingRequiredRes.error ? (casesMissingTitleRes.count ?? 0) : (casesMissingRequiredRes.count ?? 0),
      estimatedTimeSavedMinutes: caseTotal * 15,
      averageProcessingMinutes: avgProcessingMinutes,
      perWeek,
      perMonth,
      byPractice: [
        {
          practiceId,
          label: practiceName || 'Aktive Praxis',
          total: caseTotal,
          last30Days: cases30Res.count ?? 0,
        },
      ],
    },
    templates: {
      total: templatesTotalRes.count ?? 0,
      usage: topTemplateUsage,
    },
    invitations: {
      total: invitations.length,
      open: invitationOpen,
      accepted: invitationAccepted,
      expired: invitationExpired,
    },
    joinRequests: {
      total: joinRequests.length,
      pending,
      approved,
      rejected,
    },
    memberships: {
      total: memberships.length,
      owners,
      admins,
      members,
    },
    activityByRole: {
      owner: roleOwnerActivity,
      admin: roleAdminActivity,
      member: roleMemberActivity,
      unknown: roleUnknownActivity,
    },
    systemStability,
  };

  return NextResponse.json(payload);
}
