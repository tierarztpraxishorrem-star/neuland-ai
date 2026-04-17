import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id: patientId } = await ctx.params;
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);

    const { data, error } = await supabase
      .from('station_feeding_log')
      .select('id, food_type, amount_offered_ml, amount_eaten_ml, tolerance, route, notes, recorded_by, created_at')
      .eq('station_patient_id', patientId)
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entries: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId } = auth.context;
    const { id: patientId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const foodType = typeof body?.food_type === 'string' ? body.food_type : null;
    const tolerance = ['good', 'partial', 'refused', 'vomited'].includes(body?.tolerance) ? body.tolerance : null;
    const route = ['oral', 'tube', 'iv'].includes(body?.route) ? body.route : null;

    const { data, error } = await supabase
      .from('station_feeding_log')
      .insert({
        station_patient_id: patientId,
        practice_id: practiceId,
        food_type: foodType,
        amount_offered_ml: typeof body?.amount_offered_ml === 'number' ? body.amount_offered_ml : null,
        amount_eaten_ml: typeof body?.amount_eaten_ml === 'number' ? body.amount_eaten_ml : null,
        tolerance,
        route,
        notes: typeof body?.notes === 'string' ? body.notes : null,
        recorded_by: typeof body?.recorded_by === 'string' ? body.recorded_by : null,
        user_id: userId,
      })
      .select('id, food_type, amount_offered_ml, amount_eaten_ml, tolerance, route, notes, recorded_by, created_at')
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || 'Speichern fehlgeschlagen.' }, { status: 500 });
    return NextResponse.json({ ok: true, entry: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
