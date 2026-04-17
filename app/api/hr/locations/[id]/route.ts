import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../../lib/hr/permissions';

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
    const updateData: Record<string, unknown> = {};

    const allowedFields = ['name', 'address_street', 'address_zip', 'address_city', 'phone', 'email', 'is_active'] as const;
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] === '' ? null : body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Keine Felder zum Aktualisieren.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('practice_units')
      .update(updateData)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Standort nicht gefunden.' }, { status: error ? 500 : 404 });
    }

    return NextResponse.json({ ok: true, location: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/locations/[id]] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
