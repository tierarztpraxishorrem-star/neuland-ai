import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../../lib/server/hrUtils';
import { isManagerRole } from '../../../../../../lib/hr/permissions';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: absenceId } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role, userId } = auth.context;

    if (!isManagerRole(role)) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.alternative_starts_on || !body.alternative_ends_on) {
      return NextResponse.json({ error: 'Alternativdaten sind erforderlich.' }, { status: 400 });
    }

    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

    // Get the absence's employee for the modification record
    const { data: absence } = await supabase
      .from('absences')
      .select('employee_id')
      .eq('id', absenceId)
      .eq('practice_id', practiceId)
      .single();

    if (!absence) {
      return NextResponse.json({ error: 'Abwesenheit nicht gefunden.' }, { status: 404 });
    }

    // Create a counter-proposal as modification
    const { data, error } = await supabase
      .from('absence_modifications')
      .insert({
        practice_id: practiceId,
        absence_id: absenceId,
        employee_id: absence.employee_id,
        modification_type: 'change_dates',
        reason: body.note || 'Alternativvorschlag vom Team',
        alternative_starts_on: body.alternative_starts_on,
        alternative_ends_on: body.alternative_ends_on,
        alternative_note: body.note || null,
        status: 'pending',
        reviewed_by: empRes.employee.id,
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Gegenvorschlag konnte nicht erstellt werden.' }, { status: 500 });
    }

    // Reject the original absence request
    await supabase
      .from('absences')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', absenceId);

    return NextResponse.json({ ok: true, modification: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/absences/[id]/counter-proposal] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
