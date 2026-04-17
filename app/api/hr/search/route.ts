import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../lib/server/hrUtils';
import { isManagerRole } from '../../../../lib/hr/permissions';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    if (!isManagerRole(role)) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const url = new URL(req.url);
    const query = url.searchParams.get('q');

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ ok: true, results: [] });
    }

    const { data, error } = await supabase.rpc('hr_search_employees', {
      p_practice_id: practiceId,
      p_query: query.trim(),
      p_limit: 20,
    });

    if (error) {
      // Fallback: simple ILIKE search if FTS fails
      const { data: fallback } = await supabase
        .from('employees')
        .select('id, first_name, last_name, display_name, personnel_number, department, position_title, employment_status')
        .eq('practice_id', practiceId)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,display_name.ilike.%${query}%,personnel_number.ilike.%${query}%`)
        .limit(20);

      return NextResponse.json({ ok: true, results: fallback || [] });
    }

    return NextResponse.json({ ok: true, results: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/search] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
