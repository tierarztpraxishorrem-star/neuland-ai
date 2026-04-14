import { NextResponse } from 'next/server';
import {
  getServiceSupabaseClient,
  getUserPractice,
} from '../../../../lib/server/getUserPractice';

type MembershipRow = {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
};

type AdminUserRow = {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
};

type UpdateRoleBody = {
  userId?: string;
  role?: 'admin' | 'member';
};

export async function GET(req: Request) {
  const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
  if (!auth.ok) return auth.response;

  const { practiceId } = auth.context;

  const service = getServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: 'Server-Konfiguration unvollstaendig.' }, { status: 500 });
  }

  const membershipsRes = await service
    .from('practice_memberships')
    .select('user_id, role')
    .eq('practice_id', practiceId)
    .order('created_at', { ascending: true })
    .limit(2000);

  if (membershipsRes.error) {
    return NextResponse.json({ error: 'Mitglieder konnten nicht geladen werden.' }, { status: 500 });
  }

  const memberships = (membershipsRes.data || []) as MembershipRow[];
  if (memberships.length === 0) {
    return NextResponse.json({ users: [] as AdminUserRow[] });
  }

  const usersById = new Map<string, { email: string | null }>();
  let page = 1;
  const perPage = 200;

  while (true) {
    const listed = await service.auth.admin.listUsers({ page, perPage });
    if (listed.error) {
      return NextResponse.json({ error: 'Benutzer konnten nicht geladen werden.' }, { status: 500 });
    }

    const users = listed.data?.users || [];
    users.forEach((user) => {
      usersById.set(user.id, { email: user.email || null });
    });

    if (users.length < perPage) break;
    page += 1;
  }

  const result: AdminUserRow[] = memberships.map((member) => ({
    id: member.user_id,
    email: usersById.get(member.user_id)?.email || '-',
    role: member.role,
  }));

  result.sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({ users: result });
}

export async function PATCH(req: Request) {
  const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
  if (!auth.ok) return auth.response;

  const { practiceId, userId: actorId } = auth.context;

  const service = getServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: 'Server-Konfiguration unvollstaendig.' }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as UpdateRoleBody;
  const targetUserId = String(body.userId || '').trim();
  const targetRole = body.role;

  if (!targetUserId) {
    return NextResponse.json({ error: 'Benutzer fehlt.' }, { status: 400 });
  }

  if (targetRole !== 'admin' && targetRole !== 'member') {
    return NextResponse.json({ error: 'Ungueltige Rolle.' }, { status: 400 });
  }

  if (targetUserId === actorId) {
    return NextResponse.json({ error: 'Eigene Rolle kann hier nicht geaendert werden.' }, { status: 400 });
  }

  const existing = await service
    .from('practice_memberships')
    .select('user_id, role')
    .eq('practice_id', practiceId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (existing.error) {
    return NextResponse.json({ error: 'Mitglied konnte nicht geladen werden.' }, { status: 500 });
  }

  if (!existing.data) {
    return NextResponse.json({ error: 'Mitglied nicht gefunden.' }, { status: 404 });
  }

  if (existing.data.role === 'owner') {
    return NextResponse.json({ error: 'Owner-Rolle kann nicht geaendert werden.' }, { status: 403 });
  }

  const updated = await service
    .from('practice_memberships')
    .update({ role: targetRole })
    .eq('practice_id', practiceId)
    .eq('user_id', targetUserId);

  if (updated.error) {
    return NextResponse.json({ error: 'Rolle konnte nicht geaendert werden.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: targetUserId, role: targetRole });
}
