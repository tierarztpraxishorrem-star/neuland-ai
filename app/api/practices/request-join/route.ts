import { NextResponse } from 'next/server';
import {
  getBearerToken,
  getServiceSupabaseClient,
  getUserScopedSupabaseClient,
} from '../../../../lib/server/getUserPractice';

type RequestBody = {
  practiceId?: string;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(req: Request) {
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
    const user = authRes.data.user;
    if (!user?.id) {
      return NextResponse.json({ error: 'Ungültige Sitzung.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const practiceId = (body.practiceId || '').trim();
    if (!practiceId || !isUuid(practiceId)) {
      return NextResponse.json({ error: 'Bitte wähle eine gültige Praxis.' }, { status: 400 });
    }

    const service = getServiceSupabaseClient();
    if (!service) {
      return NextResponse.json({ error: 'Server-Konfiguration unvollständig.' }, { status: 500 });
    }

    const practiceRes = await service
      .from('practices')
      .select('id, name')
      .eq('id', practiceId)
      .maybeSingle();

    if (practiceRes.error || !practiceRes.data) {
      return NextResponse.json({ error: 'Praxis nicht gefunden.' }, { status: 404 });
    }

    const existingMembershipRes = await service
      .from('practice_memberships')
      .select('id')
      .eq('practice_id', practiceId)
      .eq('user_id', user.id)
      .limit(1);

    if (existingMembershipRes.error) {
      return NextResponse.json({ error: 'Mitgliedschaft konnte nicht geprüft werden.' }, { status: 500 });
    }

    if ((existingMembershipRes.data || []).length > 0) {
      return NextResponse.json({ ok: true, message: 'Du bist bereits dieser Praxis zugeordnet.' });
    }

    const pendingRes = await service
      .from('practice_join_requests')
      .select('id')
      .eq('practice_id', practiceId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (pendingRes.error) {
      return NextResponse.json({ error: 'Anfrage konnte nicht geprüft werden.' }, { status: 500 });
    }

    if ((pendingRes.data || []).length > 0) {
      return NextResponse.json({ ok: true, message: 'Deine Beitrittsanfrage ist bereits offen.' });
    }

    const email = (user.email || '').toLowerCase();
    const emailDomain = email.includes('@') ? email.split('@')[1] : 'unknown';

    const insertRes = await service
      .from('practice_join_requests')
      .insert({
        practice_id: practiceId,
        user_id: user.id,
        email,
        email_domain: emailDomain,
        requested_role: 'member',
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertRes.error || !insertRes.data) {
      return NextResponse.json({ error: 'Beitrittsanfrage konnte nicht erstellt werden.' }, { status: 500 });
    }

    await service
      .from('practice_notifications')
      .insert(
        (await service
          .from('practice_memberships')
          .select('user_id')
          .eq('practice_id', practiceId)
          .in('role', ['owner', 'admin'])).data?.map((row) => ({
            practice_id: practiceId,
            user_id: row.user_id,
            type: 'join_request',
            message: `Neue Beitrittsanfrage von ${email}`,
            payload: { request_id: insertRes.data!.id, email },
          })) || [],
      );

    return NextResponse.json({ ok: true, message: 'Beitrittsanfrage wurde gesendet.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/practices/request-join] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
