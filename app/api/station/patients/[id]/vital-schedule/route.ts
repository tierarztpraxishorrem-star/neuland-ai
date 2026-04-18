import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const STANDARD_PARAM_KEYS = ['heart_rate', 'resp_rate', 'temperature_c', 'pain_score', 'feces', 'urine', 'notes'];

// GET → Mess-Zeitpläne für Standard-Vitals dieses Patienten
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id: patientId } = await ctx.params;

    const { data, error } = await supabase
      .from('station_vital_schedule')
      .select('id, param_key, scheduled_hours, is_highlighted')
      .eq('station_patient_id', patientId)
      .eq('practice_id', practiceId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, schedules: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT → Mess-Zeitplan setzen/aktualisieren. Body: { param_key, scheduled_hours: number[], is_highlighted?: boolean }
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id: patientId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const paramKey = typeof body?.param_key === 'string' ? body.param_key : '';
    const hours = Array.isArray(body?.scheduled_hours) ? body.scheduled_hours.filter((h: unknown) => typeof h === 'number' && h >= 0 && h <= 23) : [];
    const isHighlighted = typeof body?.is_highlighted === 'boolean' ? body.is_highlighted : hours.length > 0;

    const isValid = STANDARD_PARAM_KEYS.includes(paramKey) || paramKey.startsWith('custom_');
    if (!paramKey || !isValid) {
      return NextResponse.json({ error: 'Ungültiger Parameter.' }, { status: 400 });
    }

    // Upsert
    const { data, error } = await supabase
      .from('station_vital_schedule')
      .upsert(
        {
          station_patient_id: patientId,
          practice_id: practiceId,
          param_key: paramKey,
          scheduled_hours: hours,
          is_highlighted: isHighlighted,
        },
        { onConflict: 'station_patient_id,param_key' }
      )
      .select('id, param_key, scheduled_hours, is_highlighted')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, schedule: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
