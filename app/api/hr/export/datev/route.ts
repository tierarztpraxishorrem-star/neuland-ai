import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../../lib/hr/permissions';

/**
 * DATEV-Lohnexport (vereinfacht)
 * Erstellt eine CSV-Datei im DATEV-kompatiblen Format mit Mitarbeiterstammdaten
 * für den Import in Lohnabrechnungssoftware.
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
    const month = Number(url.searchParams.get('month')) || new Date().getMonth() + 1;
    const year = Number(url.searchParams.get('year')) || new Date().getFullYear();

    // Fetch active employees with full data
    const { data: employees, error } = await supabase
      .from('employees')
      .select('*')
      .eq('practice_id', practiceId)
      .eq('employment_status', 'active')
      .order('last_name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // DATEV Stammdaten-Header
    const headers = [
      'Personalnummer', 'Nachname', 'Vorname', 'Geburtsdatum', 'Geschlecht',
      'Strasse', 'PLZ', 'Ort', 'IBAN', 'BIC',
      'Steuer-ID', 'Steuerklasse', 'SV-Nummer', 'Krankenkasse', 'Konfession',
      'Eintritt', 'Austritt', 'Vertragsart', 'Wochenstunden', 'Urlaubsanspruch',
    ];

    const rows = (employees || []).map((e) => [
      e.personnel_number || '',
      e.last_name || '',
      e.first_name || '',
      e.date_of_birth || '',
      e.gender === 'male' ? 'M' : e.gender === 'female' ? 'W' : e.gender === 'diverse' ? 'D' : '',
      [e.address_street, e.address_number].filter(Boolean).join(' '),
      e.address_zip || '',
      e.address_city || '',
      e.iban || '',
      e.bic || '',
      e.tax_id || '',
      e.tax_class ? String(e.tax_class) : '',
      e.social_security_number || '',
      e.health_insurance || '',
      e.confession || '',
      e.contract_start || '',
      e.contract_end || '',
      e.contract_type || '',
      e.weekly_hours_target ? String(e.weekly_hours_target) : (e.weekly_hours ? String(e.weekly_hours) : ''),
      e.vacation_days_per_year ? String(e.vacation_days_per_year) : '30',
    ]);

    // Build CSV with BOM for Excel compatibility
    const csv = '\uFEFF' + [
      headers.join(';'),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')),
    ].join('\r\n');

    // Log export
    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    await supabase.from('hr_export_log').insert({
      practice_id: practiceId,
      export_type: 'datev',
      parameters: { month, year },
      file_name: `datev_stammdaten_${year}_${String(month).padStart(2, '0')}.csv`,
      row_count: rows.length,
      created_by: empRes.ok ? empRes.employee.id : null,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="datev_stammdaten_${year}_${String(month).padStart(2, '0')}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/export/datev] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
