import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';

type RouteContext = { params: Promise<{ id: string }> };

const MED_INSERT_FIELDS = [
  'name', 'dose', 'dose_mg_per_kg', 'route', 'scheduled_hours',
  'frequency_label', 'is_prn', 'is_dti', 'dti_rate_ml_h',
  'ordered_by', 'notes', 'sort_order',
] as const;

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth.context;
    const { id } = await ctx.params;

    const { data, error } = await supabase
      .from('station_medications')
      .select('*')
      .eq('station_patient_id', id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[api/station/medications] GET Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Laden der Medikamente.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, medications: data || [] });
  } catch (error) {
    console.error('[api/station/medications] GET Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id } = await ctx.params;

    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Medikamentenname ist erforderlich.' }, { status: 400 });
    }
    if (!body.dose?.trim()) {
      return NextResponse.json({ error: 'Dosierung ist erforderlich.' }, { status: 400 });
    }

    const insert: Record<string, unknown> = {
      station_patient_id: id,
      practice_id: practiceId,
    };
    for (const field of MED_INSERT_FIELDS) {
      if (body[field] !== undefined) {
        insert[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from('station_medications')
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error('[api/station/medications] POST Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Anlegen des Medikaments.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, medication: data }, { status: 201 });
  } catch (error) {
    console.error('[api/station/medications] POST Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}
