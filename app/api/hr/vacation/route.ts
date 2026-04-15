import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../lib/server/hrUtils';
import { countWorkdays } from '../../../../lib/hr/workdays';

type CreateVacationBody = {
  type?: string;
  starts_on?: string;
  ends_on?: string;
  note?: string;
};

const REQUESTABLE_TYPES = ['vacation', 'school', 'other'];

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!employeeRes.ok) return NextResponse.json({ error: employeeRes.error }, { status: 500 });

    const url = new URL(req.url);
    const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()), 10);

    // Load absences for this year
    const { data: absences, error: absError } = await supabase
      .from('absences')
      .select('id, employee_id, type, starts_on, ends_on, note, status, reviewed_by, reviewed_at, created_at, updated_at')
      .eq('practice_id', practiceId)
      .eq('employee_id', employeeRes.employee.id)
      .gte('ends_on', `${year}-01-01`)
      .lte('starts_on', `${year}-12-31`)
      .order('starts_on', { ascending: false });

    if (absError) return NextResponse.json({ error: absError.message }, { status: 500 });

    // Load entitlement
    const { data: entitlement } = await supabase
      .from('vacation_entitlements')
      .select('days_total, days_carry')
      .eq('employee_id', employeeRes.employee.id)
      .eq('year', year)
      .maybeSingle();

    // Load holidays for workday calculation
    const { data: holidays } = await supabase
      .from('public_holidays')
      .select('date')
      .eq('practice_id', practiceId)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`);

    const holidayDates = (holidays || []).map((h: { date: string }) => h.date);

    // Calculate used and pending days (only vacation type)
    let daysUsed = 0;
    let daysPending = 0;
    for (const a of (absences || []) as { type: string; status: string; starts_on: string; ends_on: string }[]) {
      if (a.type !== 'vacation') continue;
      const wd = countWorkdays(a.starts_on, a.ends_on, holidayDates);
      if (a.status === 'approved') daysUsed += wd;
      if (a.status === 'pending') daysPending += wd;
    }

    // Load groups this employee is in
    const { data: groupMemberships } = await supabase
      .from('employee_group_members')
      .select('group_id, role')
      .eq('employee_id', employeeRes.employee.id);

    let groups: { id: string; name: string; color: string }[] = [];
    if (groupMemberships && groupMemberships.length > 0) {
      const groupIds = (groupMemberships as { group_id: string }[]).map((m) => m.group_id);
      const { data: groupData } = await supabase
        .from('employee_groups')
        .select('id, name, color')
        .in('id', groupIds);
      groups = (groupData || []) as typeof groups;
    }

    return NextResponse.json({
      ok: true,
      absences: absences || [],
      entitlement: {
        days_total: entitlement?.days_total ?? 30,
        days_carry: entitlement?.days_carry ?? 0,
        days_used: daysUsed,
        days_pending: daysPending,
      },
      groups,
      year,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!employeeRes.ok) return NextResponse.json({ error: employeeRes.error }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as CreateVacationBody;

    if (!body.type || !REQUESTABLE_TYPES.includes(body.type)) {
      return NextResponse.json({ error: 'Ungültiger Abwesenheitstyp. Erlaubt: Urlaub, Berufsschule, Sonstiges.' }, { status: 400 });
    }

    if (!body.starts_on || !body.ends_on) {
      return NextResponse.json({ error: 'Start- und Enddatum sind erforderlich.' }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.starts_on) || !/^\d{4}-\d{2}-\d{2}$/.test(body.ends_on)) {
      return NextResponse.json({ error: 'Datumsformat muss YYYY-MM-DD sein.' }, { status: 400 });
    }

    if (body.starts_on > body.ends_on) {
      return NextResponse.json({ error: 'Startdatum darf nicht nach dem Enddatum liegen.' }, { status: 400 });
    }

    // Check overlap
    const { data: overlapping } = await supabase
      .from('absences')
      .select('id')
      .eq('practice_id', practiceId)
      .eq('employee_id', employeeRes.employee.id)
      .neq('status', 'rejected')
      .lte('starts_on', body.ends_on)
      .gte('ends_on', body.starts_on)
      .limit(1);

    if (overlapping && overlapping.length > 0) {
      return NextResponse.json({ error: 'Es existiert bereits eine Abwesenheit in diesem Zeitraum.' }, { status: 409 });
    }

    const note = typeof body.note === 'string' ? body.note.trim() || null : null;

    const { data, error } = await supabase
      .from('absences')
      .insert({
        practice_id: practiceId,
        employee_id: employeeRes.employee.id,
        type: body.type,
        starts_on: body.starts_on,
        ends_on: body.ends_on,
        note,
      })
      .select('id, employee_id, type, starts_on, ends_on, note, status, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Antrag konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, absence: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
