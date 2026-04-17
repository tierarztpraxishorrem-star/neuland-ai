import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Toggle task done
    if (body.task_id && typeof body.task_id === 'string') {
      const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
      const done = body.done === true;

      const { error } = await supabase
        .from('offboarding_tasks')
        .update({
          done,
          done_at: done ? new Date().toISOString() : null,
          done_by: done && empRes.ok ? empRes.employee.id : null,
        })
        .eq('id', body.task_id)
        .eq('offboarding_process_id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const { data: full } = await supabase
        .from('offboarding_processes')
        .select('*, offboarding_tasks(*)')
        .eq('id', id)
        .single();

      return NextResponse.json({ ok: true, process: full });
    }

    // Update process
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status && ['active', 'completed', 'cancelled'].includes(body.status as string)) {
      updateData.status = body.status;

      // If completed, set employee to terminated
      if (body.status === 'completed') {
        const { data: proc } = await supabase
          .from('offboarding_processes')
          .select('employee_id')
          .eq('id', id)
          .single();
        if (proc) {
          await supabase
            .from('employees')
            .update({ employment_status: 'terminated' })
            .eq('id', proc.employee_id);
        }
      }
    }
    if (typeof body.last_working_day === 'string') updateData.last_working_day = body.last_working_day || null;
    if (typeof body.notes === 'string') updateData.notes = body.notes || null;

    const { data, error } = await supabase
      .from('offboarding_processes')
      .update(updateData)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('*, offboarding_tasks(*)')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Prozess nicht gefunden.' }, { status: error ? 500 : 404 });
    }

    return NextResponse.json({ ok: true, process: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/offboarding/[id]] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
