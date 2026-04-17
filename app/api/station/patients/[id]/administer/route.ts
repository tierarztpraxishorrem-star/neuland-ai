import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId } = auth.context;
    const { id } = await ctx.params;

    const body = await req.json();
    const { medication_id, scheduled_hour, administered_by, status, notes, skip_reason } = body;

    if (!medication_id) {
      return NextResponse.json({ error: 'medication_id ist erforderlich.' }, { status: 400 });
    }
    if (scheduled_hour === undefined || scheduled_hour === null) {
      return NextResponse.json({ error: 'scheduled_hour ist erforderlich.' }, { status: 400 });
    }
    if (!administered_by?.trim()) {
      return NextResponse.json({ error: 'Kürzel ist erforderlich.' }, { status: 400 });
    }
    if (administered_by.trim().length < 2 || administered_by.trim().length > 4) {
      return NextResponse.json({ error: 'Kürzel muss 2-4 Zeichen lang sein.' }, { status: 400 });
    }

    // Check for duplicate administration
    const { data: existing } = await supabase
      .from('station_med_administrations')
      .select('id')
      .eq('medication_id', medication_id)
      .eq('scheduled_hour', scheduled_hour)
      .eq('station_patient_id', id)
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'Dieses Medikament wurde für diese Stunde bereits abgezeichnet.' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('station_med_administrations')
      .insert({
        medication_id,
        station_patient_id: id,
        practice_id: practiceId,
        scheduled_hour,
        administered_at: new Date().toISOString(),
        administered_by: administered_by.trim().toUpperCase(),
        user_id: userId,
        status: status || 'given',
        skip_reason: skip_reason || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[api/station/administer] POST Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Abzeichnen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, administration: data }, { status: 201 });
  } catch (error) {
    console.error('[api/station/administer] POST Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}
