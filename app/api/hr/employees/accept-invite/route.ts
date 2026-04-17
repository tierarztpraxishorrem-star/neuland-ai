import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';

/**
 * POST: Einladung annehmen (nach Registrierung)
 * Verknüpft den eingeloggten User mit dem MA-Datensatz.
 */
export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase } = auth.context;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const token = body.invite_token as string;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Einladungstoken ist erforderlich.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('accept_employee_invitation', {
      p_invite_token: token,
    });

    if (error) {
      return NextResponse.json({ error: error.message || 'Einladung konnte nicht angenommen werden.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, employee_id: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/employees/accept-invite] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
