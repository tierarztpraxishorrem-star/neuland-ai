import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../../lib/server/hrUtils';
import { countWorkdays } from '../../../../../../lib/hr/workdays';

export async function GET(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId, role } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!employeeRes.ok) return NextResponse.json({ error: employeeRes.error }, { status: 500 });

    // Load group
    const { data: group } = await supabase
      .from('employee_groups')
      .select('id, name, color, min_coverage')
      .eq('id', groupId)
      .eq('practice_id', practiceId)
      .single();

    if (!group) return NextResponse.json({ error: 'Gruppe nicht gefunden.' }, { status: 404 });

    // Check membership (any role)
    const isPracticeAdmin = role === 'owner' || role === 'admin';
    if (!isPracticeAdmin) {
      const { data: membership } = await supabase
        .from('employee_group_members')
        .select('employee_id')
        .eq('employee_id', employeeRes.employee.id)
        .eq('group_id', groupId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: 'Kein Zugriff auf diese Gruppe.' }, { status: 403 });
      }
    }

    const url = new URL(req.url);
    const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()), 10);

    // Load members
    const { data: memberships } = await supabase
      .from('employee_group_members')
      .select('employee_id, role')
      .eq('group_id', groupId);

    const memberIds = (memberships || []).map((m: { employee_id: string }) => m.employee_id);
    if (memberIds.length === 0) {
      return NextResponse.json({
        ok: true,
        group,
        members: [],
        holidays: [],
        year,
      });
    }

    // Load employee names
    const { data: employees } = await supabase
      .from('employees')
      .select('id, display_name, user_id')
      .in('id', memberIds);

    // Determine visibility: group_admin or practice admin sees pending too
    const myMembership = (memberships || []).find(
      (m: { employee_id: string }) => m.employee_id === employeeRes.employee.id
    ) as { role: string } | undefined;
    const canSeePending = isPracticeAdmin || myMembership?.role === 'group_admin';

    // Load absences for all members in this year
    let absQuery = supabase
      .from('absences')
      .select('id, employee_id, type, starts_on, ends_on, status')
      .eq('practice_id', practiceId)
      .in('employee_id', memberIds)
      .gte('ends_on', `${year}-01-01`)
      .lte('starts_on', `${year}-12-31`);

    if (!canSeePending) {
      absQuery = absQuery.eq('status', 'approved');
    } else {
      absQuery = absQuery.in('status', ['approved', 'pending']);
    }

    const { data: absences } = await absQuery;

    // Load holidays
    const { data: holidays } = await supabase
      .from('public_holidays')
      .select('date, name')
      .eq('practice_id', practiceId)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date');

    const holidayDates = (holidays || []).map((h: { date: string }) => h.date);

    // Load entitlements
    const { data: entitlements } = await supabase
      .from('vacation_entitlements')
      .select('employee_id, days_total, days_carry')
      .in('employee_id', memberIds)
      .eq('year', year);

    const entMap = new Map(
      (entitlements || []).map((e: { employee_id: string; days_total: number; days_carry: number }) => [
        e.employee_id,
        e,
      ])
    );

    const empMap = new Map(
      (employees || []).map((e: { id: string; display_name: string | null; user_id: string }) => [e.id, e])
    );

    // Build member data
    const members = memberIds.map((id: string) => {
      const emp = empMap.get(id);
      const memberAbsences = (absences || []).filter(
        (a: { employee_id: string }) => a.employee_id === id
      );
      const ent = entMap.get(id);

      let daysUsed = 0;
      let daysPending = 0;
      for (const a of memberAbsences as { type: string; status: string; starts_on: string; ends_on: string }[]) {
        if (a.type !== 'vacation') continue;
        const wd = countWorkdays(a.starts_on, a.ends_on, holidayDates);
        if (a.status === 'approved') daysUsed += wd;
        if (a.status === 'pending') daysPending += wd;
      }

      return {
        id,
        name: emp?.display_name || emp?.user_id?.slice(0, 8) + '…' || id.slice(0, 8),
        absences: memberAbsences.map((a: { starts_on: string; ends_on: string; type: string; status: string }) => ({
          starts_on: a.starts_on,
          ends_on: a.ends_on,
          type: a.type,
          status: a.status,
        })),
        entitlement: {
          days_total: ent?.days_total ?? 30,
          days_carry: ent?.days_carry ?? 0,
          days_used: daysUsed,
          days_pending: daysPending,
        },
      };
    });

    return NextResponse.json({
      ok: true,
      group,
      members,
      holidays: holidays || [],
      year,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/group/[groupId]] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
