import { NextResponse } from 'next/server';
import {
  getUserPractice,
} from '../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
  getOrCreateEmployee,
} from '../../../../lib/server/hrUtils';

type OnboardingTaskRow = {
  id: string;
  employee_id: string;
  title: string;
  done: boolean;
  due_on: string | null;
  created_at: string;
};

type CreateTaskBody = {
  employee_id?: string;
  title?: string;
  due_on?: string;
};

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

    let query = supabase
      .from('onboarding_tasks')
      .select('id, employee_id, title, done, due_on, created_at')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: true });

    // Non-admins only see their own tasks
    if (role !== 'owner' && role !== 'admin') {
      const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
      if (!employeeRes.ok) {
        return NextResponse.json({ error: employeeRes.error }, { status: 500 });
      }
      query = query.eq('employee_id', employeeRes.employee.id);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden der Aufgaben.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tasks: (data || []) as OnboardingTaskRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/onboarding] GET Fehler:', error);
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

    const body = (await req.json().catch(() => ({}))) as CreateTaskBody;

    if (!body.employee_id) {
      return NextResponse.json({ error: 'Mitarbeiter-ID ist erforderlich.' }, { status: 400 });
    }

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'Titel ist erforderlich.' }, { status: 400 });
    }

    const dueOn = body.due_on && /^\d{4}-\d{2}-\d{2}$/.test(body.due_on) ? body.due_on : null;

    const { data, error } = await supabase
      .from('onboarding_tasks')
      .insert({
        practice_id: practiceId,
        employee_id: body.employee_id,
        title: body.title.trim(),
        due_on: dueOn,
      })
      .select('id, employee_id, title, done, due_on, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Aufgabe konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, task: data as OnboardingTaskRow }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/onboarding] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
