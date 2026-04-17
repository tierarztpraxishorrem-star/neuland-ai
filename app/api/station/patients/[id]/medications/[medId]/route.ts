import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../../lib/server/getUserPractice';

type RouteContext = { params: Promise<{ id: string; medId: string }> };

const MED_UPDATE_FIELDS = [
  'name', 'dose', 'dose_mg_per_kg', 'route', 'scheduled_hours',
  'frequency_label', 'is_prn', 'is_dti', 'dti_rate_ml_h',
  'ordered_by', 'notes', 'sort_order', 'is_active', 'valid_to',
] as const;

// Fields that trigger auto-history (old med deactivated, new one created)
const HISTORY_TRIGGER_FIELDS = ['dose', 'dti_rate_ml_h', 'scheduled_hours', 'frequency_label', 'route', 'is_dti', 'is_prn'];

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id, medId } = await ctx.params;

    const body = await req.json();

    // Load the current medication to compare
    const { data: currentMed } = await supabase
      .from('station_medications')
      .select('*')
      .eq('id', medId)
      .eq('practice_id', practiceId)
      .single();

    if (!currentMed) {
      return NextResponse.json({ error: 'Medikament nicht gefunden.' }, { status: 404 });
    }

    // Check if any history-triggering field changed
    const hasHistoryChange = HISTORY_TRIGGER_FIELDS.some(field => {
      if (body[field] === undefined) return false;
      const oldVal = JSON.stringify(currentMed[field]);
      const newVal = JSON.stringify(body[field]);
      return oldVal !== newVal;
    });

    if (hasHistoryChange) {
      // Deactivate old medication (keeps history)
      await supabase
        .from('station_medications')
        .update({ is_active: false, valid_to: new Date().toISOString() })
        .eq('id', medId)
        .eq('practice_id', practiceId);

      // Create new medication with updated values
      const newMed: Record<string, unknown> = {
        station_patient_id: id,
        practice_id: practiceId,
        name: currentMed.name,
        dose: currentMed.dose,
        dose_mg_per_kg: currentMed.dose_mg_per_kg,
        route: currentMed.route,
        scheduled_hours: currentMed.scheduled_hours,
        frequency_label: currentMed.frequency_label,
        is_prn: currentMed.is_prn,
        is_dti: currentMed.is_dti,
        dti_rate_ml_h: currentMed.dti_rate_ml_h,
        ordered_by: currentMed.ordered_by,
        notes: currentMed.notes,
        sort_order: currentMed.sort_order,
      };

      // Apply the updates
      for (const field of MED_UPDATE_FIELDS) {
        if (body[field] !== undefined) {
          newMed[field] = body[field];
        }
      }
      // Ensure new med is active
      delete newMed.is_active;
      delete newMed.valid_to;

      const { data: created, error: createError } = await supabase
        .from('station_medications')
        .insert(newMed)
        .select()
        .single();

      if (createError) {
        console.error('[api/station/medications/[medId]] PATCH history Fehler:', createError);
        return NextResponse.json({ error: 'Fehler beim Erstellen der neuen Version.' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, medication: created, history: true });
    }

    // No history-triggering change: simple update (e.g. notes, sort_order)
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
