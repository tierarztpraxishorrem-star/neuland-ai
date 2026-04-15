import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../../../lib/server/hrUtils';

type PatchBody = {
  name?: string;
  color?: string;
  min_coverage?: number;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const updates: Record<string, unknown> = {};

    if (body.name && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) updates.color = body.color;
    if (typeof body.min_coverage === 'number' && body.min_coverage >= 0 && body.min_coverage <= 100) {
      updates.min_coverage = body.min_coverage;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Keine Änderungen angegeben.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('employee_groups')
      .update(updates)
      .eq('id', groupId)
      .eq('practice_id', practiceId)
      .select('id, name, color, min_coverage, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Gruppe nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, group: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/groups/[groupId]] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const { error } = await supabase
      .from('employee_groups')
      .delete()
      .eq('id', groupId)
      .eq('practice_id', practiceId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/groups/[groupId]] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
