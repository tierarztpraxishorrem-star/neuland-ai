import { NextResponse } from 'next/server';
import {
  getUserPractice,
} from '../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
  getOrCreateEmployee,
} from '../../../../lib/server/hrUtils';

type ShiftRow = {
  id: string;
  employee_id: string;
  date: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
  location_id: string | null;
  shift_type: string | null;
  created_at: string;
};

type CreateShiftBody = {
  employee_id?: string;
  date?: string;
  starts_at?: string;
  ends_at?: string;
  note?: string;
  location_id?: string;
  shift_type?: string;
};

const SHIFT_COLUMNS = 'id, employee_id, date, starts_at, ends_at, note, location_id, shift_type, created_at';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId, role } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let query = supabase
      .from('shifts')
      .select(SHIFT_COLUMNS)
      .eq('practice_id', practiceId)
      .order('date', { ascending: true })
      .order('starts_at', { ascending: true });

    // Non-admins only see their own shifts
    if (role !== 'owner' && role !== 'admin') {
      const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
      if (!employeeRes.ok) {
        return NextResponse.json({ error: employeeRes.error }, { status: 500 });
      }
      query = query.eq('employee_id', employeeRes.employee.id);
    }

    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden der Schichten.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, shifts: (data || []) as ShiftRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/shifts] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as CreateShiftBody;

    if (!body.employee_id) {
      return NextResponse.json({ error: 'Mitarbeiter-ID ist erforderlich.' }, { status: 400 });
    }

    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: 'Datum im Format YYYY-MM-DD erforderlich.' }, { status: 400 });
    }

    if (!body.starts_at || !/^\d{2}:\d{2}$/.test(body.starts_at)) {
      return NextResponse.json({ error: 'Startzeit im Format HH:MM erforderlich.' }, { status: 400 });
    }

    if (!body.ends_at || !/^\d{2}:\d{2}$/.test(body.ends_at)) {
      return NextResponse.json({ error: 'Endzeit im Format HH:MM erforderlich.' }, { status: 400 });
    }

    const note = typeof body.note === 'string' ? body.note.trim() || null : null;

    const { data, error } = await supabase
      .from('shifts')
      .insert({
        practice_id: practiceId,
        employee_id: body.employee_id,
        date: body.date,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        note,
        location_id: body.location_id || null,
        shift_type: body.shift_type || null,
      })
      .select(SHIFT_COLUMNS)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Schicht konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, shift: data as ShiftRow }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/shifts] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
