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
      .from('practice_units')
      .select('id, practice_id, name, address_street, address_zip, address_city, phone, email, is_active, created_at')
      .eq('practice_id', practiceId)
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden der Standorte.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, locations: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/locations] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
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

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Standortname ist erforderlich.' }, { status: 400 });
    }

    const insertData: Record<string, unknown> = {
      practice_id: practiceId,
      name: (body.name as string).trim(),
    };

    const optionalFields = ['address_street', 'address_zip', 'address_city', 'phone', 'email'] as const;
    for (const field of optionalFields) {
      if (body[field] && typeof body[field] === 'string') {
        insertData[field] = (body[field] as string).trim();
      }
    }

    const { data, error } = await supabase
      .from('practice_units')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Standort konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, location: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/locations] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
