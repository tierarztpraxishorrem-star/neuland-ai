import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../lib/server/hrUtils';
import { isManagerRole } from '../../../../lib/hr/permissions';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId, role } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const url = new URL(req.url);
    const isAdmin = url.searchParams.get('admin') === 'true';

    if (isAdmin && isManagerRole(role)) {
      const { data, error } = await supabase
        .from('work_session_corrections')
        .select('*')
        .eq('practice_id', practiceId)
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const { data: employees } = await supabase
        .from('employees')
        .select('id, display_name, first_name, last_name')
        .eq('practice_id', practiceId);

      const empMap = new Map<string, string>();
      for (const e of employees || []) {
        empMap.set(e.id, e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : e.display_name || e.id.slice(0, 6));
      }

      const enriched = (data || []).map((c) => ({ ...c, employee_name: empMap.get(c.employee_id) || 'Unbekannt' }));
      return NextResponse.json({ ok: true, corrections: enriched });
    }

    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

    const { data, error } = await supabase
      .from('work_session_corrections')
      .select('*')
      .eq('employee_id', empRes.employee.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, corrections: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/time-corrections] GET Fehler:', error);
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
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.work_session_id || typeof body.work_session_id !== 'string') {
      return NextResponse.json({ error: 'work_session_id ist erforderlich.' }, { status: 400 });
    }
    if (!body.reason || typeof body.reason !== 'string' || !(body.reason as string).trim()) {
      return NextResponse.json({ error: 'Begründung ist erforderlich.' }, { status: 400 });
    }

    // Fetch original session
    const { data: session, error: sessionError } = await supabase
      .from('work_sessions')
      .select('id, employee_id, started_at, ended_at')
      .eq('id', body.work_session_id)
      .eq('employee_id', empRes.employee.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Sitzung nicht gefunden oder nicht berechtigt.' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('work_session_corrections')
      .insert({
        practice_id: practiceId,
        work_session_id: session.id,
        employee_id: empRes.employee.id,
        original_started_at: session.started_at,
        original_ended_at: session.ended_at,
        requested_started_at: body.requested_started_at || session.started_at,
        requested_ended_at: body.requested_ended_at || session.ended_at,
        reason: (body.reason as string).trim(),
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Fehler beim Erstellen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, correction: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/time-corrections] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
