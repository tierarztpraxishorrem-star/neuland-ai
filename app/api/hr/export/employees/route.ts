import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../../lib/hr/permissions';

/**
 * Mitarbeiter CSV-Export (alle Stammdaten)
 */
export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role, userId } = auth.context;

    if (!isAdminRole(role)) return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status');

    let query = supabase
      .from('employees')
      .select('*')
      .eq('practice_id', practiceId)
      .order('last_name');

    if (statusFilter) query = query.eq('employment_status', statusFilter);

    const { data: employees, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const headers = [
      'Personalnummer', 'Vorname', 'Nachname', 'Geburtsdatum', 'Geschlecht',
      'Straße', 'Hausnummer', 'PLZ', 'Ort', 'Telefon', 'E-Mail privat',
      'Vertragsart', 'Vertragsbeginn', 'Vertragsende', 'Wochenstunden',
      'Arbeitstage/Woche', 'Urlaubstage/Jahr', 'Abteilung', 'Position', 'Status', 'Rolle',
    ];

    const rows = (employees || []).map((e) => [
      e.personnel_number || '', e.first_name || '', e.last_name || '',
      e.date_of_birth || '', e.gender || '',
      e.address_street || '', e.address_number || '', e.address_zip || '', e.address_city || '',
      e.phone || '', e.email_private || '',
      e.contract_type || '', e.contract_start || '', e.contract_end || '',
      e.weekly_hours_target ? String(e.weekly_hours_target) : '',
      e.work_days_per_week ? String(e.work_days_per_week) : '',
      e.vacation_days_per_year ? String(e.vacation_days_per_year) : '',
      e.department || '', e.position_title || '', e.employment_status || '', e.role || '',
    ]);

    const csv = '\uFEFF' + [
      headers.join(';'),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')),
    ].join('\r\n');

    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    await supabase.from('hr_export_log').insert({
      practice_id: practiceId,
      export_type: 'csv',
      parameters: { type: 'employees', status: statusFilter },
      file_name: `mitarbeiter_export_${new Date().toISOString().slice(0, 10)}.csv`,
      row_count: rows.length,
      created_by: empRes.ok ? empRes.employee.id : null,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mitarbeiter_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/export/employees] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
