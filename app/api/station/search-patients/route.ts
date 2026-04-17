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

    // Drei separate Queries und merge — vermeidet .or() PostgREST-Probleme
    const term = `%${q}%`;
    const cols = 'id, name, tierart, rasse, alter, geschlecht, owner_name, external_id, practice_id';

    const [byName, byOwner] = await Promise.all([
      supabase.from('patients').select(cols).ilike('name', term).limit(20),
      supabase.from('patients').select(cols).ilike('owner_name', term).limit(20),
    ]);

    // Merge + dedup
    const seen = new Set<string>();
    const all: Array<Record<string, unknown>> = [];
    for (const result of [byName.data, byOwner.data]) {
      for (const row of (result || []) as Array<Record<string, unknown>>) {
        const id = row.id as string;
        // practice_id-Filter: entweder gleiche Praxis oder NULL (Legacy-Patienten)
        if (row.practice_id && row.practice_id !== practiceId) continue;
        if (!seen.has(id)) {
          seen.add(id);
          all.push(row);
        }
      }
    }

    return NextResponse.json({ ok: true, patients: all.slice(0, 20), debug: { query: q, practiceId, found: all.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
