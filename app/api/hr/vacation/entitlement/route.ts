import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';
import { countWorkdays } from '../../../../../lib/hr/workdays';

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

    // Load entitlement
    const { data: entitlement } = await supabase
      .from('vacation_entitlements')
      .select('days_total, days_carry')
      .eq('employee_id', employeeRes.employee.id)
      .eq('year', year)
      .maybeSingle();

    // Load holidays
    const { data: holidays } = await supabase
      .from('public_holidays')
      .select('date')
      .eq('practice_id', practiceId)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`);

    const holidayDates = (holidays || []).map((h: { date: string }) => h.date);

    // Load vacation absences
    const { data: absences } = await supabase
      .from('absences')
      .select('starts_on, ends_on, status')
      .eq('practice_id', practiceId)
      .eq('employee_id', employeeRes.employee.id)
      .eq('type', 'vacation')
      .neq('status', 'rejected')
      .gte('ends_on', `${year}-01-01`)
      .lte('starts_on', `${year}-12-31`);

    let daysUsed = 0;
    let daysPending = 0;
    for (const a of (absences || []) as { starts_on: string; ends_on: string; status: string }[]) {
      const wd = countWorkdays(a.starts_on, a.ends_on, holidayDates);
      if (a.status === 'approved') daysUsed += wd;
      if (a.status === 'pending') daysPending += wd;
    }

    return NextResponse.json({
      ok: true,
      entitlement: {
        days_total: entitlement?.days_total ?? 30,
        days_carry: entitlement?.days_carry ?? 0,
        days_used: daysUsed,
        days_pending: daysPending,
      },
      year,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/entitlement] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
