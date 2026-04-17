import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../lib/hr/permissions';

const MODEL_COLUMNS = 'id, practice_id, name, type, weekly_hours, daily_hours_target, work_days, break_rules, night_shift, weekend_work, holiday_work, is_active, created_at, updated_at';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('active') !== 'false';

    let query = supabase
      .from('work_time_models')
      .select(MODEL_COLUMNS)
      .eq('practice_id', practiceId)
      .order('name');

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden der Arbeitszeitmodelle.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, models: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/work-models] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    if (!isAdminRole(role)) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Modellname ist erforderlich.' }, { status: 400 });
    }

    const validTypes = ['vollzeit', 'teilzeit', 'minijob', 'azubi', 'schicht', 'custom'];
    if (!body.type || !validTypes.includes(body.type as string)) {
      return NextResponse.json({ error: 'Ungültiger Modelltyp.' }, { status: 400 });
    }

    if (body.weekly_hours === undefined || body.weekly_hours === null || Number(body.weekly_hours) <= 0) {
      return NextResponse.json({ error: 'Wochenstunden müssen angegeben werden.' }, { status: 400 });
    }

    const insertData: Record<string, unknown> = {
      practice_id: practiceId,
      name: (body.name as string).trim(),
      type: body.type,
      weekly_hours: Number(body.weekly_hours),
    };

    if (body.daily_hours_target !== undefined && body.daily_hours_target !== null) {
      insertData.daily_hours_target = Number(body.daily_hours_target);
    }
    if (Array.isArray(body.work_days)) {
      insertData.work_days = body.work_days;
    }
    if (Array.isArray(body.break_rules)) {
      insertData.break_rules = body.break_rules;
    }
    if (typeof body.night_shift === 'boolean') insertData.night_shift = body.night_shift;
    if (typeof body.weekend_work === 'boolean') insertData.weekend_work = body.weekend_work;
    if (typeof body.holiday_work === 'boolean') insertData.holiday_work = body.holiday_work;

    const { data, error } = await supabase
      .from('work_time_models')
      .insert(insertData)
      .select(MODEL_COLUMNS)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Modell konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, model: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/work-models] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
