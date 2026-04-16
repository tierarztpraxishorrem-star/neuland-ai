import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; linkId: string }> };

// DELETE → Mail-Case-Verknüpfung lösen
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;
    const { id: messageId, linkId } = await ctx.params;
    if (!linkId) return NextResponse.json({ error: 'linkId fehlt.' }, { status: 400 });

    const { data, error: fetchErr } = await supabase
      .from('case_mail_links')
      .select('id')
      .eq('id', linkId)
      .eq('practice_id', practiceId)
      .eq('message_id', messageId)
      .maybeSingle();
    if (fetchErr || !data) {
      return NextResponse.json({ error: 'Verknüpfung nicht gefunden.' }, { status: 404 });
    }

    const { error } = await supabase.from('case_mail_links').delete().eq('id', linkId);
    if (error) {
      return NextResponse.json({ error: error.message || 'Löschen fehlgeschlagen.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/messages/:id/link/:linkId] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
