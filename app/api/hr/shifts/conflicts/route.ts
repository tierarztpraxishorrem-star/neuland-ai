import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../../lib/server/hrUtils';
import { isManagerRole } from '../../../../../lib/hr/permissions';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    if (!isManagerRole(role)) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const url = new URL(req.url);
    const employeeId = url.searchParams.get('employee_id');
    const date = url.searchParams.get('date');
    const startsAt = url.searchParams.get('starts_at');
    const endsAt = url.searchParams.get('ends_at');
    const excludeShiftId = url.searchParams.get('exclude_shift_id');

    if (!employeeId || !date || !startsAt || !endsAt) {
      return NextResponse.json({ error: 'employee_id, date, starts_at und ends_at sind erforderlich.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('check_shift_conflicts', {
      p_practice_id: practiceId,
      p_employee_id: employeeId,
      p_date: date,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_exclude_shift_id: excludeShiftId || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, conflicts: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/shifts/conflicts] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
