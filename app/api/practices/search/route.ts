import { NextResponse } from 'next/server';
import {
  getBearerToken,
  getServiceSupabaseClient,
  getUserScopedSupabaseClient,
} from '../../../../lib/server/getUserPractice';

type PracticeRow = {
  id: string;
  name: string;
  slug: string | null;
};

export async function GET(req: Request) {
  try {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const userScoped = getUserScopedSupabaseClient(token);
  if (!userScoped) {
    return NextResponse.json({ error: 'Supabase-Konfiguration fehlt.' }, { status: 500 });
  }

  const authRes = await userScoped.auth.getUser(token);
  if (!authRes.data.user?.id) {
    return NextResponse.json({ error: 'Ungültige Sitzung.' }, { status: 401 });
  }

  const service = getServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: 'Server-Konfiguration unvollständig.' }, { status: 500 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();

  let query = service
    .from('practices')
    .select('id, name, slug')
    .order('name', { ascending: true })
    .limit(100);

  if (q) {
    query = query.ilike('name', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Praxisliste konnte nicht geladen werden.' }, { status: 500 });
  }

  return NextResponse.json({
    results: (data || []) as PracticeRow[],
  });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/practices/search] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
