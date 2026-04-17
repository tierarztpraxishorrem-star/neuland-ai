import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../lib/server/hrUtils';
import { filterEmployeeFields, isAdminRole, isManagerRole } from '../../../../lib/hr/permissions';

const EMPLOYEE_LIST_COLUMNS = `
  id, practice_id, user_id, role, employment_status, display_name,
  first_name, last_name, personnel_number, department, position_title,
  location_id, contract_type, phone, email_private, weekly_hours,
  weekly_hours_target, contract_start, contract_end, created_at
`;

const EMPLOYEE_INSERT_FIELDS = [
  'first_name', 'last_name', 'birth_name', 'date_of_birth', 'birth_place',
  'birth_country', 'gender', 'nationality', 'marital_status', 'phone',
  'email_private', 'address_street', 'address_number', 'address_zip',
  'address_city', 'contract_type', 'contract_start', 'contract_end',
  'probation_end', 'weekly_hours_target', 'work_days_per_week',
  'vacation_days_per_year', 'iban', 'bic', 'tax_id', 'tax_class',
  'social_security_number', 'health_insurance', 'confession',
  'personnel_number', 'department', 'position_title', 'supervisor_id',
  'location_id', 'role', 'employment_status', 'display_name', 'weekly_hours',
] as const;

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    if (!isManagerRole(role)) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status');
    const departmentFilter = url.searchParams.get('department');
    const locationFilter = url.searchParams.get('location_id');
    const search = url.searchParams.get('q');

    let query = supabase
      .from('employees')
      .select(EMPLOYEE_LIST_COLUMNS)
      .eq('practice_id', practiceId)
      .order('last_name', { ascending: true });

    if (statusFilter) {
      query = query.eq('employment_status', statusFilter);
    }
    if (departmentFilter) {
      query = query.eq('department', departmentFilter);
    }
    if (locationFilter) {
      query = query.eq('location_id', locationFilter);
    }
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,display_name.ilike.%${search}%,personnel_number.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden der Mitarbeiter.' }, { status: 500 });
    }

    const employees = (data || []).map((emp) =>
      filterEmployeeFields(emp as Record<string, unknown>, role)
    );

    return NextResponse.json({ ok: true, employees });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/employees] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    if (!isAdminRole(role)) {
      return NextResponse.json({ error: 'Nur Admins dürfen Mitarbeiter anlegen.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Validate required fields
    if (!body.first_name || !body.last_name) {
      return NextResponse.json({ error: 'Vor- und Nachname sind erforderlich.' }, { status: 400 });
    }

    // Build insert object with only allowed fields
    const insertData: Record<string, unknown> = {
      practice_id: practiceId,
    };

    for (const field of EMPLOYEE_INSERT_FIELDS) {
      if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
        insertData[field] = body[field];
      }
    }

    // Auto-set display_name if not provided
    if (!insertData.display_name && insertData.first_name && insertData.last_name) {
      insertData.display_name = `${insertData.first_name} ${insertData.last_name}`;
    }

    // Default status
    if (!insertData.employment_status) {
      insertData.employment_status = 'onboarding';
    }
    if (!insertData.role) {
      insertData.role = 'member';
    }

    // Validate date formats
    const dateFields = ['date_of_birth', 'contract_start', 'contract_end', 'probation_end'];
    for (const field of dateFields) {
      if (insertData[field] && typeof insertData[field] === 'string') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(insertData[field] as string)) {
          return NextResponse.json({ error: `${field} muss im Format YYYY-MM-DD sein.` }, { status: 400 });
        }
      }
    }

    // Validate contract_end > contract_start
    if (insertData.contract_start && insertData.contract_end) {
      if ((insertData.contract_end as string) < (insertData.contract_start as string)) {
        return NextResponse.json({ error: 'Vertragsende darf nicht vor Vertragsbeginn liegen.' }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('employees')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Mitarbeiter konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, employee: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/employees] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
