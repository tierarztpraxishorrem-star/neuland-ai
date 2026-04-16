import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

// GET /api/cases/search?q=...&limit=20
// Case-Suche für Mail-/Dokument-Verknüpfung. Sucht über Patientenname
// und optional über case.title, falls Spalte existiert.
export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase } = auth.context;
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);

    let query = supabase
      .from('cases')
      .select('id, title, created_at, patient:patients(id, name, tierart, owner_name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (q.length > 0) {
      // OR-Filter: Cases mit title-Match oder Patient-Name-Match
      // Da das Join über patient nicht direkt mit .or() durchsuchbar ist,
      // holen wir erst passende patients, dann cases.
      const { data: patients } = await supabase
        .from('patients')
        .select('id')
        .ilike('name', `%${q}%`)
        .limit(50);
      const patientIds = (patients || []).map((p) => p.id);

      const filters: string[] = [];
      filters.push(`title.ilike.%${q}%`);
      if (patientIds.length > 0) filters.push(`patient_id.in.(${patientIds.join(',')})`);
      query = query.or(filters.join(','));
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler bei der Suche.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cases: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/cases/search] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
