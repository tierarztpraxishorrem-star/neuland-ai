import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';
import { countWorkdays } from '../../../../../lib/hr/workdays';
import { isAdminRole } from '../../../../../lib/hr/permissions';

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

/**
 * PATCH: Admin setzt Urlaubsanspruch für einen Mitarbeiter
 * Body: { employee_id, year, days_total, days_carry }
 */
export async function PATCH(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    if (!isAdminRole(role)) return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.employee_id || typeof body.employee_id !== 'string') {
      return NextResponse.json({ error: 'employee_id ist erforderlich.' }, { status: 400 });
    }

    const year = Number(body.year) || new Date().getFullYear();
    const daysTotal = body.days_total !== undefined ? Number(body.days_total) : undefined;
    const daysCarry = body.days_carry !== undefined ? Number(body.days_carry) : undefined;

    if (daysTotal === undefined && daysCarry === undefined) {
      return NextResponse.json({ error: 'days_total oder days_carry erforderlich.' }, { status: 400 });
    }

    // Upsert entitlement
    const { data: existing } = await supabase
      .from('vacation_entitlements')
      .select('id')
      .eq('employee_id', body.employee_id)
      .eq('year', year)
      .maybeSingle();

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (daysTotal !== undefined) updateData.days_total = daysTotal;
      if (daysCarry !== undefined) updateData.days_carry = daysCarry;

      const { error } = await supabase
        .from('vacation_entitlements')
        .update(updateData)
        .eq('id', existing.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase
        .from('vacation_entitlements')
        .insert({
          practice_id: practiceId,
          employee_id: body.employee_id,
          year,
          days_total: daysTotal ?? 30,
          days_carry: daysCarry ?? 0,
        });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/entitlement] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
