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

    const { data, error } = await supabase
      .from('employee_change_requests')
      .select('*')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich
    const empIds = [...new Set((data || []).map((r) => r.employee_id))];
    const { data: employees } = await supabase
      .from('employees')
      .select('id, first_name, last_name, display_name')
      .in('id', empIds.length > 0 ? empIds : ['00000000-0000-0000-0000-000000000000']);

    const empMap = new Map<string, string>();
    for (const e of employees || []) {
      empMap.set(e.id, e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : e.display_name || e.id.slice(0, 6));
    }

    const enriched = (data || []).map((r) => ({ ...r, employee_name: empMap.get(r.employee_id) || 'Unbekannt' }));
    return NextResponse.json({ ok: true, requests: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/change-requests] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
