import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';
import {
  filterEmployeeFields,
  isAdminRole,
  isManagerRole,
  SELF_EDITABLE_FIELDS,
  SENSITIVE_FIELDS,
} from '../../../../../lib/hr/permissions';

const ADMIN_UPDATABLE_FIELDS = [
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

const GROUPLEADER_UPDATABLE_FIELDS = [
  'department', 'position_title', 'display_name',
] as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    // Check: admin/groupleader can view anyone, employee can view self
    const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!employeeRes.ok) return NextResponse.json({ error: employeeRes.error }, { status: 500 });

    const isSelf = employeeRes.employee.id === id;
    if (!isManagerRole(role) && !isSelf) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .eq('practice_id', practiceId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 });
    }

    const filtered = filterEmployeeFields(data as Record<string, unknown>, role);
    return NextResponse.json({ ok: true, employee: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/employees/[id]] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!employeeRes.ok) return NextResponse.json({ error: employeeRes.error }, { status: 500 });

    const isSelf = employeeRes.employee.id === id;

    // Determine allowed fields based on role
    let allowedFields: readonly string[];
    if (isAdminRole(role)) {
      allowedFields = ADMIN_UPDATABLE_FIELDS;
    } else if (role === 'groupleader') {
      allowedFields = GROUPLEADER_UPDATABLE_FIELDS;
    } else if (isSelf) {
      allowedFields = SELF_EDITABLE_FIELDS;
    } else {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }

    // Groupleader can only update employees in their groups
    if (role === 'groupleader' && !isSelf) {
      const { data: isGl } = await supabase.rpc('is_groupleader_for_employee', {
        p_user_id: userId,
        p_employee_id: id,
      });
      if (!isGl) {
        return NextResponse.json({ error: 'Keine Berechtigung für diesen Mitarbeiter.' }, { status: 403 });
      }
    }

    // Sensitive fields: only admin
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        // Extra check: non-admins can't write sensitive fields
        if (SENSITIVE_FIELDS.includes(key as typeof SENSITIVE_FIELDS[number]) && !isAdminRole(role)) {
          continue;
        }
        updateData[key] = value === '' ? null : value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Keine gültigen Felder zum Aktualisieren.' }, { status: 400 });
    }

    // Validate dates
    const dateFields = ['date_of_birth', 'contract_start', 'contract_end', 'probation_end'];
    for (const field of dateFields) {
      if (updateData[field] && typeof updateData[field] === 'string') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(updateData[field] as string)) {
          return NextResponse.json({ error: `${field} muss im Format YYYY-MM-DD sein.` }, { status: 400 });
        }
      }
    }

    // Auto-update display_name when name changes
    if ((updateData.first_name || updateData.last_name) && !updateData.display_name) {
      const { data: current } = await supabase
        .from('employees')
        .select('first_name, last_name')
        .eq('id', id)
        .single();
      if (current) {
        const fn = (updateData.first_name as string) || current.first_name || '';
        const ln = (updateData.last_name as string) || current.last_name || '';
        if (fn && ln) {
          updateData.display_name = `${fn} ${ln}`;
        }
      }
    }

    const { data, error } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Mitarbeiter nicht gefunden.' }, { status: error ? 500 : 404 });
    }

    const filtered = filterEmployeeFields(data as Record<string, unknown>, role);
    return NextResponse.json({ ok: true, employee: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/employees/[id]] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
