import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/yeastar/recordings
 * Returns processed call recordings (transcripts + summaries) for the authenticated user's practice.
 * Query params: ?limit=20&offset=0&status=done
 */

function getSupabaseClientForToken(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!token) {
      return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
    }

    const sb = getSupabaseClientForToken(token);
    if (!sb) {
      return NextResponse.json({ error: 'Supabase-Konfiguration fehlt.' }, { status: 500 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
    const offset = Number(url.searchParams.get('offset')) || 0;
    const statusFilter = url.searchParams.get('status') || '';

    let query = sb
      .from('call_recordings')
      .select('id, caller, callee, direction, duration_seconds, started_at, ended_at, transcript, summary, status, error_message, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ recordings: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/yeastar/recordings] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
