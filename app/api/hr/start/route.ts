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
};

type StartBody = {
  source?: string;
};

const normalizeSource = (value: unknown) => {
  if (typeof value !== 'string') return 'api';
  const normalized = value.trim().toLowerCase();
  return normalized || 'api';
};

export async function POST(req: Request) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;

  const { supabase, practiceId, userId } = auth.context;

  if (!isHrActionAllowed('start', userId)) {
    return NextResponse.json({ error: 'Bitte warte kurz, bevor du erneut startest.' }, { status: 429 });
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
    .select('id, started_at, ended_at')
    .eq('practice_id', practiceId)
    .eq('employee_id', employee.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openSessionRes.error) {
    return NextResponse.json({ error: openSessionRes.error.message || 'Offene Session konnte nicht geprüft werden.' }, { status: 500 });
  }

  if (openSessionRes.data) {
    const existing = openSessionRes.data as WorkSessionRow;
    return NextResponse.json(
      {
        error: 'Es existiert bereits eine offene Session.',
        session: existing,
      },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as StartBody;
  const source = normalizeSource(body?.source);

  const insertRes = await supabase
    .from('work_sessions')
    .insert({
      practice_id: practiceId,
      employee_id: employee.id,
      source,
    })
    .select('id, started_at, ended_at')
    .single();

  if (insertRes.error || !insertRes.data) {
    return NextResponse.json({ error: insertRes.error?.message || 'Session konnte nicht gestartet werden.' }, { status: 500 });
  }

  const created = insertRes.data as WorkSessionRow;
  let warning: string | undefined;

  const service = getServiceSupabaseClient();

  if (!service) {
    warning = 'Audit fehlgeschlagen';
    console.error('HR start audit skipped: SUPABASE_SERVICE_ROLE_KEY fehlt');
  } else {
    const auditRes = await service.rpc('hr_write_audit_log', {
      p_practice_id: practiceId,
      p_actor_user_id: userId,
      p_action: 'hr.work_session.start',
      p_entity_type: 'work_session',
      p_entity_id: created.id,
      p_metadata: {
        employee_id: employee.id,
        source,
        started_at: created.started_at,
      },
    });

    if (auditRes.error) {
      warning = 'Audit fehlgeschlagen';
      console.error('HR start audit failed', auditRes.error);
    }
  }

  return NextResponse.json({
    ok: true,
    session: created,
    ...(warning ? { warning } : {}),
  });
}
