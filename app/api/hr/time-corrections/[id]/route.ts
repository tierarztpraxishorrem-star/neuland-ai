import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';
import { getServiceSupabaseClient } from '../../../../../lib/server/getUserPractice';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin', 'groupleader'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.status || !['approved', 'rejected'].includes(body.status as string)) {
      return NextResponse.json({ error: 'Status muss "approved" oder "rejected" sein.' }, { status: 400 });
    }

    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

    // Update correction status
    const { data: correction, error } = await supabase
      .from('work_session_corrections')
      .update({
        status: body.status,
        reviewed_by: empRes.employee.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('practice_id', practiceId)
      .eq('status', 'pending')
      .select('*')
      .single();

    if (error || !correction) {
      return NextResponse.json({ error: error?.message || 'Korrektur nicht gefunden oder bereits bearbeitet.' }, { status: error ? 500 : 404 });
    }

    // If approved: apply correction to work_session using service client
    if (body.status === 'approved') {
      const serviceClient = getServiceSupabaseClient();
      if (serviceClient) {
        await serviceClient
          .from('work_sessions')
          .update({
            started_at: correction.requested_started_at,
            ended_at: correction.requested_ended_at,
          })
          .eq('id', correction.work_session_id);
      }
    }

    return NextResponse.json({ ok: true, correction });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/time-corrections/[id]] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
