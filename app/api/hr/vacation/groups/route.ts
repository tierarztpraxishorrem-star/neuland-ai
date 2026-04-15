import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../../lib/server/hrUtils';

type CreateGroupBody = {
  name?: string;
  color?: string;
  min_coverage?: number;
};

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const { data: groups, error } = await supabase
      .from('employee_groups')
      .select('id, name, color, min_coverage, created_at')
      .eq('practice_id', practiceId)
      .order('name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Load member counts
    const { data: members } = await supabase
      .from('employee_group_members')
      .select('group_id');

    const groupIds = new Set((groups || []).map((g: { id: string }) => g.id));
    const countMap = new Map<string, number>();
    for (const m of (members || []) as { group_id: string }[]) {
      if (groupIds.has(m.group_id)) {
        countMap.set(m.group_id, (countMap.get(m.group_id) || 0) + 1);
      }
    }

    const result = (groups || []).map((g: { id: string; name: string; color: string; min_coverage: number; created_at: string }) => ({
      ...g,
      member_count: countMap.get(g.id) || 0,
    }));

    return NextResponse.json({ ok: true, groups: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/groups] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as CreateGroupBody;

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Gruppenname ist erforderlich.' }, { status: 400 });
    }

    const color = typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : '#6366f1';
    const minCoverage = typeof body.min_coverage === 'number' && body.min_coverage >= 0 && body.min_coverage <= 100
      ? body.min_coverage : 50;

    const { data, error } = await supabase
      .from('employee_groups')
      .insert({
        practice_id: practiceId,
        name: body.name.trim(),
        color,
        min_coverage: minCoverage,
      })
      .select('id, name, color, min_coverage, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Gruppe konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, group: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/groups] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
