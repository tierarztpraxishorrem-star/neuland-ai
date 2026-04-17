import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../../lib/server/getUserPractice';

type RouteContext = { params: Promise<{ id: string; medId: string }> };

const MED_UPDATE_FIELDS = [
  'name', 'dose', 'dose_mg_per_kg', 'route', 'scheduled_hours',
  'frequency_label', 'is_prn', 'is_dti', 'dti_rate_ml_h',
  'ordered_by', 'notes', 'sort_order', 'is_active', 'valid_to',
] as const;

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { medId } = await ctx.params;

    const body = await req.json();
    const update: Record<string, unknown> = {};
    for (const field of MED_UPDATE_FIELDS) {
      if (body[field] !== undefined) {
        update[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from('station_medications')
      .update(update)
      .eq('id', medId)
      .eq('practice_id', practiceId)
      .select()
      .single();

    if (error) {
      console.error('[api/station/medications/[medId]] PATCH Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, medication: data });
  } catch (error) {
    console.error('[api/station/medications/[medId]] PATCH Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { medId } = await ctx.params;

    const { error } = await supabase
      .from('station_medications')
      .update({ is_active: false, valid_to: new Date().toISOString() })
      .eq('id', medId)
      .eq('practice_id', practiceId);

    if (error) {
      console.error('[api/station/medications/[medId]] DELETE Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Deaktivieren.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/station/medications/[medId]] DELETE Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}
