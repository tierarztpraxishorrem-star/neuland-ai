import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../../lib/hr/permissions';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const { data, error } = await supabase
      .from('onboarding_templates')
      .select('*')
      .eq('practice_id', practiceId)
      .order('name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, templates: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;
    if (!isAdminRole(role)) return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Name ist erforderlich.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('onboarding_templates')
      .insert({
        practice_id: practiceId,
        name: (body.name as string).trim(),
        description: body.description || null,
        employee_group: body.employee_group || 'standard',
        tasks: Array.isArray(body.tasks) ? body.tasks : [],
      })
      .select('*')
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || 'Fehler.' }, { status: 500 });

    return NextResponse.json({ ok: true, template: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
