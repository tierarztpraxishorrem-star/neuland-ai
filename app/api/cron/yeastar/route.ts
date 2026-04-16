import { NextResponse } from 'next/server';
import { getServiceSupabaseClient } from '../../../../lib/server/getUserPractice';

export const maxDuration = 300;
export const runtime = 'nodejs';

/**
 * GET /api/cron/yeastar
 * Vercel-Cron-Trigger (alle 5 Min). Picks up `pending`/`failed` call_recordings
 * (retry_count < 3), increments retry_count and fires the processing pipeline
 * for each. Processing runs in parallel.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert.' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = getServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase Service-Client nicht konfiguriert.' }, { status: 500 });
  }

  const appUrl = (process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (!appUrl) {
    return NextResponse.json({ error: 'PUBLIC_APP_URL fehlt.' }, { status: 500 });
  }

  const { data: pending, error } = await service
    .from('call_recordings')
    .select('id, retry_count')
    .in('status', ['pending', 'failed'])
    .lt('retry_count', 3)
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pending?.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const results = await Promise.allSettled(
    pending.map(async (row) => {
      await service
        .from('call_recordings')
        .update({ retry_count: (row.retry_count || 0) + 1 })
        .eq('id', row.id);

      const res = await fetch(`${appUrl}/api/yeastar/process-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId: row.id }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return row.id;
    }),
  );

  const processed = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  if (failed > 0) {
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[cron/yeastar] Recording-Verarbeitung fehlgeschlagen:', r.reason);
      }
    }
  }

  return NextResponse.json({ ok: true, total: pending.length, processed, failed });
}
