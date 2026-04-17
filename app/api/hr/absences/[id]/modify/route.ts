import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../../lib/server/hrUtils';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: absenceId } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const modType = body.modification_type as string;
    if (!modType || !['change_dates', 'cancel'].includes(modType)) {
      return NextResponse.json({ error: 'modification_type muss "change_dates" oder "cancel" sein.' }, { status: 400 });
    }

    if (!body.reason || typeof body.reason !== 'string' || !(body.reason as string).trim()) {
      return NextResponse.json({ error: 'Begründung ist erforderlich.' }, { status: 400 });
    }

    // Verify absence belongs to employee
    const { data: absence } = await supabase
      .from('absences')
      .select('id, employee_id, status')
      .eq('id', absenceId)
      .eq('employee_id', empRes.employee.id)
      .single();

    if (!absence) {
      return NextResponse.json({ error: 'Abwesenheit nicht gefunden.' }, { status: 404 });
    }

    if (absence.status === 'rejected') {
      return NextResponse.json({ error: 'Abgelehnte Abwesenheiten können nicht geändert werden.' }, { status: 400 });
    }

    const insertData: Record<string, unknown> = {
      practice_id: practiceId,
      absence_id: absenceId,
      employee_id: empRes.employee.id,
      modification_type: modType,
      reason: (body.reason as string).trim(),
    };

    if (modType === 'change_dates') {
      if (!body.new_starts_on || !body.new_ends_on) {
        return NextResponse.json({ error: 'Neue Daten sind für Datumsänderungen erforderlich.' }, { status: 400 });
      }
      insertData.new_starts_on = body.new_starts_on;
      insertData.new_ends_on = body.new_ends_on;
    }

    const { data, error } = await supabase
      .from('absence_modifications')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Änderungsantrag konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, modification: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/absences/[id]/modify] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
