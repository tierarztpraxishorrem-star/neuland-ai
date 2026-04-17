import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../lib/server/hrUtils';

const DEFAULT_OFFBOARDING_TASKS = [
  { title: 'Kündigungsschreiben/Aufhebungsvertrag archivieren', category: 'documents' },
  { title: 'Arbeitszeugnis erstellen', category: 'documents' },
  { title: 'Restliche Lohnabrechnungen vorbereiten', category: 'documents' },
  { title: 'System-Zugänge deaktivieren', category: 'access' },
  { title: 'E-Mail-Konto sichern/deaktivieren', category: 'access' },
  { title: 'Schlüssel/Chipkarte zurückgeben', category: 'equipment' },
  { title: 'Arbeitskleidung zurückgeben', category: 'equipment' },
  { title: 'Wissenstransfer/Übergabe durchführen', category: 'handover' },
  { title: 'Resturlaub prüfen und abrechnen', category: 'other' },
  { title: 'Überstundenkonto prüfen und abrechnen', category: 'other' },
];

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const { data, error } = await supabase
      .from('offboarding_processes')
      .select('*, offboarding_tasks(*)')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with employee names
    const empIds = [...new Set((data || []).map((p) => p.employee_id))];
    const { data: employees } = await supabase
      .from('employees')
      .select('id, display_name, first_name, last_name')
      .in('id', empIds.length > 0 ? empIds : ['00000000-0000-0000-0000-000000000000']);

    const empMap = new Map<string, string>();
    for (const e of employees || []) {
      empMap.set(e.id, e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : e.display_name || e.id.slice(0, 6));
    }

    const enriched = (data || []).map((p) => ({ ...p, employee_name: empMap.get(p.employee_id) || 'Unbekannt' }));
    return NextResponse.json({ ok: true, processes: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/offboarding] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.employee_id || typeof body.employee_id !== 'string') {
      return NextResponse.json({ error: 'employee_id ist erforderlich.' }, { status: 400 });
    }

    const initiatorRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!initiatorRes.ok) return NextResponse.json({ error: initiatorRes.error }, { status: 500 });

    // Get vacation + overtime balance for the employee
    const { data: vacBalance } = await supabase
      .from('vacation_entitlements')
      .select('days_total, days_carry')
      .eq('employee_id', body.employee_id)
      .eq('year', new Date().getFullYear())
      .maybeSingle();

    const { data: usedVac } = await supabase
      .from('absences')
      .select('starts_on, ends_on')
      .eq('employee_id', body.employee_id)
      .eq('type', 'vacation')
      .eq('status', 'approved');

    let usedDays = 0;
    for (const a of usedVac || []) {
      const start = new Date(a.starts_on);
      const end = new Date(a.ends_on);
      usedDays += Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
    }
    const totalVacDays = (vacBalance?.days_total || 30) + (vacBalance?.days_carry || 0);
    const remainingVacation = totalVacDays - usedDays;

    const { data: otBalance } = await supabase.rpc('get_overtime_balance', { p_employee_id: body.employee_id });

    const { data: process, error } = await supabase
      .from('offboarding_processes')
      .insert({
        practice_id: practiceId,
        employee_id: body.employee_id,
        initiated_by: initiatorRes.employee.id,
        last_working_day: body.last_working_day || null,
        exit_reason: body.exit_reason || null,
        remaining_vacation_days: remainingVacation,
        overtime_balance_minutes: otBalance?.[0]?.balance_minutes || 0,
        notes: body.notes || null,
      })
      .select('*')
      .single();

    if (error || !process) {
      return NextResponse.json({ error: error?.message || 'Offboarding konnte nicht erstellt werden.' }, { status: 500 });
    }

    // Create default tasks
    const tasks = DEFAULT_OFFBOARDING_TASKS.map((t) => ({
      offboarding_process_id: process.id,
      practice_id: practiceId,
      title: t.title,
      category: t.category,
    }));

    await supabase.from('offboarding_tasks').insert(tasks);

    // Update employee status
    await supabase
      .from('employees')
      .update({ employment_status: 'offboarding' })
      .eq('id', body.employee_id);

    // Re-fetch with tasks
    const { data: full } = await supabase
      .from('offboarding_processes')
      .select('*, offboarding_tasks(*)')
      .eq('id', process.id)
      .single();

    return NextResponse.json({ ok: true, process: full }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/offboarding] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
