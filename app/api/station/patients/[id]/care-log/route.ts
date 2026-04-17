import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const CARE_TYPES = ['wound_care', 'catheter_care', 'bandage_change', 'mobilization', 'hygiene', 'monitoring', 'feeding', 'other'] as const;
const CARE_LABELS: Record<string, string> = {
  wound_care: 'Wundversorgung', catheter_care: 'Katheter-Pflege', bandage_change: 'Verbandswechsel',
  mobilization: 'Mobilisation', hygiene: 'Hygiene', monitoring: 'Kontrolle', feeding: 'Fütterung', other: 'Sonstiges',
};

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id: patientId } = await ctx.params;
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);

    const { data, error } = await supabase
      .from('station_care_log')
      .select('id, care_type, body_location, notes, recorded_by, created_at')
      .eq('station_patient_id', patientId)
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entries: data || [], care_labels: CARE_LABELS });
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
    const careType = typeof body?.care_type === 'string' ? body.care_type : '';
    if (!CARE_TYPES.includes(careType as typeof CARE_TYPES[number])) {
      return NextResponse.json({ error: `Ungültiger Typ. Erlaubt: ${CARE_TYPES.join(', ')}` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('station_care_log')
      .insert({
        station_patient_id: patientId,
        practice_id: practiceId,
        care_type: careType,
        body_location: typeof body?.body_location === 'string' ? body.body_location : null,
        notes: typeof body?.notes === 'string' ? body.notes : null,
        recorded_by: typeof body?.recorded_by === 'string' ? body.recorded_by : null,
        user_id: userId,
      })
      .select('id, care_type, body_location, notes, recorded_by, created_at')
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || 'Speichern fehlgeschlagen.' }, { status: 500 });
    return NextResponse.json({ ok: true, entry: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
