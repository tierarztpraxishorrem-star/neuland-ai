import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../lib/hr/permissions';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    if (!isAdminRole(role)) return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const url = new URL(req.url);
    const reportType = url.searchParams.get('type') || 'overview';
    const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
    const month = url.searchParams.get('month') ? Number(url.searchParams.get('month')) : null;

    // Fetch employees for name mapping
    const { data: employees } = await supabase
      .from('employees')
      .select('id, first_name, last_name, display_name, department, employment_status')
      .eq('practice_id', practiceId);

    const empMap = new Map<string, { name: string; department: string | null; status: string }>();
    for (const e of employees || []) {
      empMap.set(e.id, {
        name: e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : e.display_name || e.id.slice(0, 6),
        department: e.department,
        status: e.employment_status,
      });
    }

    if (reportType === 'overtime') {
      const { data, error } = await supabase.rpc('fn_overtime_summary', {
        p_practice_id: practiceId,
        p_year: year,
        p_month: month,
      });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const enriched = (data || []).map((r: Record<string, unknown>) => ({
        ...r,
        ...(empMap.get(r.employee_id as string) || {}),
      }));

      return NextResponse.json({ ok: true, report: enriched, type: 'overtime', year, month });
    }

    if (reportType === 'absences') {
      const { data, error } = await supabase.rpc('fn_absence_statistics', {
        p_practice_id: practiceId,
        p_year: year,
      });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const enriched = (data || []).map((r: Record<string, unknown>) => ({
        ...r,
        ...(empMap.get(r.employee_id as string) || {}),
      }));

      return NextResponse.json({ ok: true, report: enriched, type: 'absences', year });
    }

    // Overview: summary statistics
    const totalEmployees = (employees || []).filter((e) => e.employment_status === 'active').length;

    const { count: pendingAbsences } = await supabase
      .from('absences')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practiceId)
      .eq('status', 'pending');

    const { count: pendingOvertime } = await supabase
      .from('overtime_entries')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practiceId)
      .eq('status', 'pending');

    const { count: pendingCorrections } = await supabase
      .from('work_session_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practiceId)
      .eq('status', 'pending');

    const { count: expiringQuals } = await supabase
      .from('employee_qualifications')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practiceId)
      .in('status', ['expired', 'pending_renewal']);

    return NextResponse.json({
      ok: true,
      type: 'overview',
      overview: {
        total_employees: totalEmployees,
        pending_absences: pendingAbsences || 0,
        pending_overtime: pendingOvertime || 0,
        pending_corrections: pendingCorrections || 0,
        expiring_qualifications: expiringQuals || 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/reports] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
