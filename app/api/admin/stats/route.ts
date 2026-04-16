import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

// ───────────────────────────────── types ─────────────────────────────────

type DayCount = { date: string; count: number };

type StatsPayload = {
  practiceId: string;
  updatedAt: string;
  days: number;

  konsultationen: {
    heute: number;
    zeitraum: number;
    trend: number; // % vs Vorperiode
    proTag: DayCount[];
  };

  team: {
    proMitarbeiter: {
      userId: string;
      name: string;
      konsultationen: number;
      patientenbriefe: number;
      durchschnittMinuten: number;
    }[];
  };

  vorlagen: {
    nutzungsrate: number;
    top5: { name: string; count: number }[];
    ohneVorlage: number;
  };

  zeit: {
    durchschnittMinutenProFall: number;
    gespaarteStunden: number;
    gespaarteMinuten: number;
    patientenbriefeErstellt: number;
    verteilungNachDauer: { bucket: string; count: number }[];
  };

  vetmind: {
    chatsGesamt: number;
    chatsZeitraum: number;
    proTag: DayCount[];
    aktivNutzer: number;
  };

  qualitaet: {
    vollstaendig: number;
    fehlendePflichtfelder: number;
    ohnePatientenbrief: number;
    score: number;
  };
};

// ───────────────────────────────── helpers ─────────────────────────────────

const dayKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

function fillDays(start: Date, end: Date, counts: Map<string, number>): DayCount[] {
  const result: DayCount[] = [];
  const d = new Date(start);
  while (d <= end) {
    const key = dayKey(d);
    result.push({ date: key, count: counts.get(key) || 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return result;
}

function safeDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function trendPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ───────────────────────────────── GET ─────────────────────────────────

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['admin', 'owner'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const url = new URL(req.url);
    const daysParam = Number(url.searchParams.get('days')) || 30;
    const days = [1, 7, 30, 90].includes(daysParam) ? daysParam : 30;

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevPeriodStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000);

    const periodIso = periodStart.toISOString();
    const prevIso = prevPeriodStart.toISOString();
    const todayIso = todayStart.toISOString();

    // ── Parallel: main data fetches ──
    const [
      casesAllRes,
      casesPrevRes,
      casesTodayRes,
      vetmindAllRes,
      vetmindPrevRes,
      vetmindTodayRes,
      membershipsRes,
    ] = await Promise.all([
      supabase
        .from('cases')
        .select('created_at, updated_at, template, user_id, title, result')
        .eq('practice_id', practiceId)
        .gte('created_at', periodIso)
        .order('created_at', { ascending: true })
        .limit(20000),
      supabase
        .from('cases')
        .select('id', { count: 'exact', head: true })
        .eq('practice_id', practiceId)
        .gte('created_at', prevIso)
        .lt('created_at', periodIso),
      supabase
        .from('cases')
        .select('id', { count: 'exact', head: true })
        .eq('practice_id', practiceId)
        .gte('created_at', todayIso),
      supabase
        .from('vetmind_sessions')
        .select('user_id, created_at')
        .eq('practice_id', practiceId)
        .gte('created_at', periodIso)
        .order('created_at', { ascending: true })
        .limit(20000),
      supabase
        .from('vetmind_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('practice_id', practiceId)
        .gte('created_at', prevIso)
        .lt('created_at', periodIso),
      supabase
        .from('vetmind_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('practice_id', practiceId)
        .gte('created_at', todayIso),
      supabase
        .from('practice_memberships')
        .select('user_id, role')
        .eq('practice_id', practiceId)
        .limit(500),
    ]);

    // Vetmind total count
    const vetmindTotalRes = await supabase
      .from('vetmind_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practiceId);

    type CaseRow = {
      created_at: string | null;
      updated_at: string | null;
      template: string | null;
      user_id: string | null;
      title: string | null;
      result: string | null;
    };

    const cases = (casesAllRes.data || []) as CaseRow[];
    const vetmindSessions = (vetmindPrevRes.error ? [] : (vetmindAllRes.data || [])) as Array<{
      user_id: string | null;
      created_at: string | null;
    }>;

    // ── Konsultationen ──
    const caseDayCounts = new Map<string, number>();
    const templateCounts = new Map<string, number>();
    const userStats = new Map<string, { konsultationen: number; patientenbriefe: number; totalMinutes: number }>();
    const processingMinutes: number[] = [];
    let patientenbriefe = 0;
    let ohneVorlage = 0;
    let ohnePatientenbrief = 0;
    let vollstaendig = 0;
    let fehlendePflichtfelder = 0;
    let bucketUnder5 = 0;
    let bucket5to15 = 0;
    let bucketOver15 = 0;

    const memberMap = new Map<string, string>();
    for (const m of (membershipsRes.data || []) as Array<{ user_id: string; role: string }>) {
      if (m.user_id) memberMap.set(m.user_id, m.role);
    }

    // Fetch user emails for names
    const userIds = [...new Set(cases.map((c) => c.user_id).filter(Boolean))] as string[];
    const userNameMap = new Map<string, string>();
    if (userIds.length > 0) {
      // We can't query auth.users directly via RLS. Use practice_memberships + a fallback.
      // For display we'll use userId short form
      for (const uid of userIds) {
        userNameMap.set(uid, uid.slice(0, 8));
      }
    }

    for (const row of cases) {
      const created = safeDate(row.created_at);
      if (!created) continue;

      const dk = dayKey(created);
      caseDayCounts.set(dk, (caseDayCounts.get(dk) || 0) + 1);

      const template = (row.template || '').trim();
      if (template) {
        templateCounts.set(template, (templateCounts.get(template) || 0) + 1);
      } else {
        ohneVorlage++;
      }

      const hasResult = Boolean(row.result && row.result.trim().length > 20);
      const hasTitle = Boolean(row.title && row.title.trim());

      const resultText = (row.result || '').toLowerCase();
      const hasBrief = resultText.includes('patientenbrief') || resultText.includes('liebe') || resultText.includes('lieber');
      if (hasBrief) patientenbriefe++;
      else ohnePatientenbrief++;

      if (hasResult && hasTitle) vollstaendig++;
      if (!hasResult || !hasTitle) fehlendePflichtfelder++;

      const updated = safeDate(row.updated_at);
      if (updated && updated.getTime() > created.getTime()) {
        const mins = (updated.getTime() - created.getTime()) / 60000;
        if (Number.isFinite(mins) && mins >= 0 && mins <= 1440) {
          processingMinutes.push(mins);
          if (mins < 5) bucketUnder5++;
          else if (mins <= 15) bucket5to15++;
          else bucketOver15++;
        }
      }

      if (row.user_id) {
        const existing = userStats.get(row.user_id) || { konsultationen: 0, patientenbriefe: 0, totalMinutes: 0 };
        existing.konsultationen++;
        if (hasBrief) existing.patientenbriefe++;
        if (updated && updated.getTime() > created.getTime()) {
          const m = (updated.getTime() - created.getTime()) / 60000;
          if (Number.isFinite(m) && m >= 0 && m <= 1440) existing.totalMinutes += m;
        }
        userStats.set(row.user_id, existing);
      }
    }

    // ── VetMind ──
    const vetmindDayCounts = new Map<string, number>();
    const vetmindUserSet = new Set<string>();
    for (const s of vetmindSessions) {
      const created = safeDate(s.created_at);
      if (!created) continue;
      vetmindDayCounts.set(dayKey(created), (vetmindDayCounts.get(dayKey(created)) || 0) + 1);
      if (s.user_id) vetmindUserSet.add(s.user_id);
    }

    // ── Trend ──
    const currentCount = cases.length;
    const prevCount = casesPrevRes.count ?? 0;
    const trend = trendPercent(currentCount, prevCount);

    // ── Gesparte Zeit ──
    const gespartMinuten = (currentCount * 15) + (patientenbriefe * 10) + (vetmindSessions.length * 5);
    const gespartStunden = Math.floor(gespartMinuten / 60);
    const gespartRest = gespartMinuten % 60;

    // ── Templates ──
    const totalWithTemplate = [...templateCounts.values()].reduce((s, c) => s + c, 0);
    const totalCases = cases.length || 1;
    const nutzungsrate = Math.round((totalWithTemplate / totalCases) * 100);
    const top5 = [...templateCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // ── Team ──
    const proMitarbeiter = [...userStats.entries()]
      .map(([userId, s]) => ({
        userId,
        name: userNameMap.get(userId) || userId.slice(0, 8),
        konsultationen: s.konsultationen,
        patientenbriefe: s.patientenbriefe,
        durchschnittMinuten: s.konsultationen > 0 ? Math.round(s.totalMinutes / s.konsultationen) : 0,
      }))
      .sort((a, b) => b.konsultationen - a.konsultationen)
      .slice(0, 15);

    // ── Datenqualität Score ──
    const totalForScore = cases.length || 1;
    const score = Math.round((vollstaendig / totalForScore) * 100);

    // ── Average processing ──
    const avgMinutes = processingMinutes.length
      ? Math.round(processingMinutes.reduce((s, v) => s + v, 0) / processingMinutes.length)
      : 0;

    const payload: StatsPayload = {
      practiceId,
      updatedAt: now.toISOString(),
      days,

      konsultationen: {
        heute: casesTodayRes.count ?? 0,
        zeitraum: currentCount,
        trend,
        proTag: fillDays(periodStart, now, caseDayCounts),
      },

      team: { proMitarbeiter },

      vorlagen: {
        nutzungsrate,
        top5,
        ohneVorlage,
      },

      zeit: {
        durchschnittMinutenProFall: avgMinutes,
        gespaarteStunden: gespartStunden,
        gespaarteMinuten: gespartRest,
        patientenbriefeErstellt: patientenbriefe,
        verteilungNachDauer: [
          { bucket: '< 5 min', count: bucketUnder5 },
          { bucket: '5–15 min', count: bucket5to15 },
          { bucket: '> 15 min', count: bucketOver15 },
        ],
      },

      vetmind: {
        chatsGesamt: vetmindTotalRes.count ?? 0,
        chatsZeitraum: vetmindSessions.length,
        proTag: fillDays(periodStart, now, vetmindDayCounts),
        aktivNutzer: vetmindUserSet.size,
      },

      qualitaet: {
        vollstaendig,
        fehlendePflichtfelder,
        ohnePatientenbrief,
        score,
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/admin/stats] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
