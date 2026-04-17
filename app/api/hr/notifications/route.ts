import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, userId } = auth.context;

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);

    let query = supabase
      .from('hr_notifications')
      .select('id, type, title, body, link, is_read, metadata, created_at')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.eq('is_read', false);

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Count unread
    const { count } = await supabase
      .from('hr_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', userId)
      .eq('is_read', false);

    return NextResponse.json({ ok: true, notifications: data || [], unread_count: count || 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/notifications] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, userId } = auth.context;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.action === 'mark_all_read') {
      await supabase
        .from('hr_notifications')
        .update({ is_read: true })
        .eq('recipient_user_id', userId)
        .eq('is_read', false);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Ungültige Aktion.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/notifications] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
