import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

type PracticeRow = {
  id: string;
  name: string;
  slug: string | null;
  features: Record<string, unknown> | null;
  created_at: string;
};

type EmployeeRow = {
  id: string;
  practice_id: string;
  user_id: string;
  role: string;
  employment_status: string;
  weekly_hours: number | null;
  display_name: string | null;
  created_at: string;
};

type WorkSessionRow = {
  id: string;
  practice_id: string;
  employee_id: string;
  started_at: string;
  ended_at: string | null;
  source: string;
  created_at: string;
};

export async function GET(req: Request) {
  try {
  const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
  if (!auth.ok) return auth.response;

  const { supabase, practiceId } = auth.context;

  const [practiceRes, employeesRes, sessionsRes] = await Promise.all([
    supabase
      .from('practices')
      .select('id, name, slug, features, created_at')
      .eq('id', practiceId)
      .maybeSingle(),
    supabase
      .from('employees')
      .select('id, practice_id, user_id, role, employment_status, weekly_hours, display_name, created_at')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('work_sessions')
      .select('id, practice_id, employee_id, started_at, ended_at, source, created_at')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  if (practiceRes.error || employeesRes.error || sessionsRes.error) {
    return NextResponse.json(
      {
        error: 'Systemzustand konnte nicht geladen werden.',
        details: {
          practice: practiceRes.error?.message || null,
          employees: employeesRes.error?.message || null,
          sessions: sessionsRes.error?.message || null,
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    practices: practiceRes.data ? [practiceRes.data as PracticeRow] : [],
    employees: (employeesRes.data || []) as EmployeeRow[],
    work_sessions: (sessionsRes.data || []) as WorkSessionRow[],
    timestamp: new Date().toISOString(),
  });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/debug/system-state] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
