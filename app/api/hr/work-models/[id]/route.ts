import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../../lib/hr/permissions';

const MODEL_COLUMNS = 'id, practice_id, name, type, weekly_hours, daily_hours_target, work_days, break_rules, night_shift, weekend_work, holiday_work, is_active, created_at, updated_at';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const { data, error } = await supabase
      .from('work_time_models')
      .select(MODEL_COLUMNS)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Arbeitszeitmodell nicht gefunden.' }, { status: 404 });
    }

    // Also fetch current assignments
    const { data: assignments } = await supabase
      .from('employee_work_assignments')
      .select('id, employee_id, valid_from, valid_to')
      .eq('work_time_model_id', id)
      .order('valid_from', { ascending: false });

    return NextResponse.json({ ok: true, model: data, assignments: assignments || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/work-models/[id]] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const allowedFields = ['name', 'type', 'weekly_hours', 'daily_hours_target', 'work_days', 'break_rules', 'night_shift', 'weekend_work', 'holiday_work', 'is_active'] as const;
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'weekly_hours' || field === 'daily_hours_target') {
          updateData[field] = body[field] === null ? null : Number(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const { data, error } = await supabase
      .from('work_time_models')
      .update(updateData)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select(MODEL_COLUMNS)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Modell nicht gefunden.' }, { status: error ? 500 : 404 });
    }

    return NextResponse.json({ ok: true, model: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/work-models/[id]] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    if (!isAdminRole(role)) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    // Soft-delete: set is_active = false
    const { data, error } = await supabase
      .from('work_time_models')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('id')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Modell nicht gefunden.' }, { status: error ? 500 : 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/work-models/[id]] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
