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

export async function GET(req: Request) {
  const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
  if (!auth.ok) return auth.response;

  const { practiceId, supabase } = auth.context;

  const membershipsRes = await supabase
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

  const service = getServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: 'Server-Konfiguration unvollständig.' }, { status: 500 });
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
