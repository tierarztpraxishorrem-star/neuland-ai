import { NextResponse } from 'next/server';
import {
  getUserPractice,
} from '../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
  getOrCreateEmployee,
} from '../../../../lib/server/hrUtils';

type AbsenceRow = {
  id: string;
  employee_id: string;
  type: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type CreateAbsenceBody = {
  type?: string;
  starts_on?: string;
  ends_on?: string;
  note?: string;
};

const ALLOWED_TYPES = ['vacation', 'sick', 'school', 'other'];

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!employeeRes.ok) {
      return NextResponse.json({ error: employeeRes.error }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('absences')
      .select('id, employee_id, type, starts_on, ends_on, note, status, created_at, updated_at')
      .eq('practice_id', practiceId)
      .eq('employee_id', employeeRes.employee.id)
      .order('starts_on', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden der Abwesenheiten.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, absences: (data || []) as AbsenceRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/absences] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!employeeRes.ok) {
      return NextResponse.json({ error: employeeRes.error }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as CreateAbsenceBody;

    if (!body.type || !ALLOWED_TYPES.includes(body.type)) {
      return NextResponse.json({ error: 'Ungültiger Abwesenheitstyp.' }, { status: 400 });
    }

    if (!body.starts_on || !body.ends_on) {
      return NextResponse.json({ error: 'Start- und Enddatum sind erforderlich.' }, { status: 400 });
    }

    const startsOn = body.starts_on;
    const endsOn = body.ends_on;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
      return NextResponse.json({ error: 'Datumsformat muss YYYY-MM-DD sein.' }, { status: 400 });
    }

    if (startsOn > endsOn) {
      return NextResponse.json({ error: 'Startdatum darf nicht nach dem Enddatum liegen.' }, { status: 400 });
    }

    // Check for overlapping absences
    const { data: overlapping } = await supabase
      .from('absences')
      .select('id')
      .eq('practice_id', practiceId)
      .eq('employee_id', employeeRes.employee.id)
      .neq('status', 'rejected')
      .lte('starts_on', endsOn)
      .gte('ends_on', startsOn)
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
        starts_on: startsOn,
        ends_on: endsOn,
        note,
      })
      .select('id, employee_id, type, starts_on, ends_on, note, status, created_at, updated_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Abwesenheit konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, absence: data as AbsenceRow }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/absences] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
