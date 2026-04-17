import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

// GET /api/station/search-patients?q=alphi
// Sucht in der patients-Tabelle per Name oder Besitzer (ilike), praxis-gefiltert.
export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return NextResponse.json({ ok: true, patients: [] });

    const term = `%${q}%`;
    const { data, error } = await supabase
      .from('patients')
      .select('id, name, tierart, rasse, alter, geschlecht, owner_name, external_id')
      .eq('practice_id', practiceId)
      .or(`name.ilike.${term},owner_name.ilike.${term},external_id.ilike.${term}`)
      .order('name', { ascending: true })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, patients: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
