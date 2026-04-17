import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../lib/hr/permissions';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const { data, error } = await supabase
      .from('qualifications')
      .select('*')
      .eq('practice_id', practiceId)
      .order('name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also fetch employee qualification counts
    const { data: empQuals } = await supabase
      .from('employee_qualifications')
      .select('qualification_id, status')
      .eq('practice_id', practiceId);

    const countMap = new Map<string, { active: number; expired: number; pending: number }>();
    for (const eq of empQuals || []) {
      const entry = countMap.get(eq.qualification_id) || { active: 0, expired: 0, pending: 0 };
      if (eq.status === 'active') entry.active++;
      else if (eq.status === 'expired') entry.expired++;
      else if (eq.status === 'pending_renewal') entry.pending++;
      countMap.set(eq.qualification_id, entry);
    }

    const enriched = (data || []).map((q) => ({
      ...q,
      counts: countMap.get(q.id) || { active: 0, expired: 0, pending: 0 },
    }));

    return NextResponse.json({ ok: true, qualifications: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/qualifications] GET Fehler:', error);
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
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Name ist erforderlich.' }, { status: 400 });
    }

    const validCategories = ['certification', 'license', 'training', 'skill'];
    if (!body.category || !validCategories.includes(body.category as string)) {
      return NextResponse.json({ error: 'Ungültige Kategorie.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('qualifications')
      .insert({
        practice_id: practiceId,
        name: (body.name as string).trim(),
        category: body.category,
        description: body.description || null,
        is_required_for_scheduling: body.is_required_for_scheduling === true,
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Qualifikation konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, qualification: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/qualifications] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
