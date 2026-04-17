import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';

type RouteContext = { params: Promise<{ id: string }> };

const VITALS_FIELDS = [
  'measured_hour', 'heart_rate', 'resp_rate', 'temperature_c',
  'mucous_membrane', 'crt_seconds', 'pain_score',
  'food_offered', 'food_eaten', 'water_offered',
  'feces_amount', 'feces_color', 'feces_consistency',
  'urine', 'notes', 'recorded_by',
] as const;

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth.context;
    const { id } = await ctx.params;

    const url = new URL(req.url);
    const dateStr = url.searchParams.get('date');
    const startOfDay = dateStr
      ? new Date(`${dateStr}T00:00:00`)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const { data, error } = await supabase
      .from('station_vitals')
      .select('*')
      .eq('station_patient_id', id)
      .gte('measured_at', startOfDay.toISOString())
      .lt('measured_at', endOfDay.toISOString())
      .order('measured_hour', { ascending: true });

    if (error) {
      console.error('[api/station/vitals] GET Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Laden der Messungen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, vitals: data || [] });
  } catch (error) {
    console.error('[api/station/vitals] GET Fehler:', error);
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
    if (body.measured_hour === undefined) {
      return NextResponse.json({ error: 'measured_hour ist erforderlich.' }, { status: 400 });
    }

    const insert: Record<string, unknown> = {
      station_patient_id: id,
      practice_id: practiceId,
    };
    for (const field of VITALS_FIELDS) {
      if (body[field] !== undefined) {
        insert[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from('station_vitals')
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error('[api/station/vitals] POST Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Speichern der Messung.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, vital: data }, { status: 201 });
  } catch (error) {
    console.error('[api/station/vitals] POST Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}
