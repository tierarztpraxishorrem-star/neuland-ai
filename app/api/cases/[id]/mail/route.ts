import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// GET → verknüpfte Mails dieses Falls (sortiert nach Eingangsdatum desc)
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;
    const { id: caseId } = await ctx.params;
    if (!caseId) return NextResponse.json({ error: 'case id fehlt.' }, { status: 400 });

    const { data, error } = await supabase
      .from('case_mail_links')
      .select('id, message_id, subject, from_name, from_address, received_at, linked_at, linked_by')
      .eq('practice_id', practiceId)
      .eq('case_id', caseId)
      .order('received_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, links: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/cases/:id/mail] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
