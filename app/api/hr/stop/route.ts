import { NextResponse } from 'next/server';
import {
  getServiceSupabaseClient,
  getUserPractice,
} from '../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
  getOrCreateEmployee,
  isHrActionAllowed,
} from '../../../../lib/server/hrUtils';

type WorkSessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  source: string;
};

export async function POST(req: Request) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;

  const { supabase, practiceId, userId } = auth.context;

  if (!isHrActionAllowed('stop', userId)) {
    return NextResponse.json({ error: 'Bitte warte kurz, bevor du erneut stoppst.' }, { status: 429 });
  }

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

  const employee = employeeRes.employee;

  const openSessionRes = await supabase
    .from('work_sessions')
    .select('id, started_at, ended_at, source')
    .eq('practice_id', practiceId)
    .eq('employee_id', employee.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openSessionRes.error) {
    return NextResponse.json({ error: openSessionRes.error.message || 'Offene Session konnte nicht geladen werden.' }, { status: 500 });
  }

  if (!openSessionRes.data) {
    return NextResponse.json({ error: 'Keine offene Session gefunden.' }, { status: 404 });
  }

  const openSession = openSessionRes.data as WorkSessionRow;
  const endedAtIso = new Date().toISOString();

  const updateRes = await supabase
    .from('work_sessions')
    .update({ ended_at: endedAtIso })
    .eq('id', openSession.id)
    .eq('practice_id', practiceId)
    .is('ended_at', null)
    .select('id, started_at, ended_at, source')
    .single();

  if (updateRes.error || !updateRes.data) {
    return NextResponse.json({ error: updateRes.error?.message || 'Session konnte nicht beendet werden.' }, { status: 500 });
  }

  const closedSession = updateRes.data as WorkSessionRow;
  let warning: string | undefined;

  const service = getServiceSupabaseClient();

  if (!service) {
    warning = 'Audit fehlgeschlagen';
    console.error('HR stop audit skipped: SUPABASE_SERVICE_ROLE_KEY fehlt');
  } else {
    const auditRes = await service.rpc('hr_write_audit_log', {
      p_practice_id: practiceId,
      p_actor_user_id: userId,
      p_action: 'hr.work_session.stop',
      p_entity_type: 'work_session',
      p_entity_id: closedSession.id,
      p_metadata: {
        employee_id: employee.id,
        source: closedSession.source,
        started_at: closedSession.started_at,
        ended_at: closedSession.ended_at,
      },
    });

    if (auditRes.error) {
      warning = 'Audit fehlgeschlagen';
      console.error('HR stop audit failed', auditRes.error);
    }
  }

  return NextResponse.json({
    ok: true,
    session: closedSession,
    ...(warning ? { warning } : {}),
  });
}
