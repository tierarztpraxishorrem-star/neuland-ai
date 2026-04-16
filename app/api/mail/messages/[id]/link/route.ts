import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { getMessage, MailError } from '../../../../../../lib/server/mail';
import { isMsGraphConfigured } from '../../../../../../lib/server/msGraph';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

type LinkRow = {
  id: string;
  case_id: string;
  message_id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  received_at: string | null;
  linked_by: string | null;
  linked_at: string;
};

// GET → verknüpfte Fälle dieser Mail (plus Basis-Infos zum Case)
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;
    const { id: messageId } = await ctx.params;
    if (!messageId) return NextResponse.json({ error: 'Nachrichten-ID fehlt.' }, { status: 400 });

    const { data: links, error } = await supabase
      .from('case_mail_links')
      .select('id, case_id, message_id, subject, linked_at')
      .eq('practice_id', practiceId)
      .eq('message_id', messageId);

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden.' }, { status: 500 });
    }

    const caseIds = [...new Set((links || []).map((l) => l.case_id))];
    let cases: Array<{ id: string; title?: string | null; patient_id?: string | null }> = [];
    if (caseIds.length > 0) {
      const { data } = await supabase
        .from('cases')
        .select('id, title, patient_id')
        .in('id', caseIds);
      cases = data || [];
    }

    return NextResponse.json({ ok: true, links, cases });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/messages/:id/link] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST → Mail mit Fall verknüpfen. Body: { case_id }
export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const { supabase, practiceId, userId } = auth.context;
    const { id: messageId } = await ctx.params;
    if (!messageId) return NextResponse.json({ error: 'Nachrichten-ID fehlt.' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const caseId = typeof body?.case_id === 'string' ? body.case_id : '';
    if (!caseId) return NextResponse.json({ error: 'case_id fehlt.' }, { status: 400 });

    // Case prüfen (RLS greift, aber explizit abfragen für klare Fehlermeldung)
    const { data: caseRow, error: caseErr } = await supabase
      .from('cases')
      .select('id')
      .eq('id', caseId)
      .maybeSingle();
    if (caseErr || !caseRow) {
      return NextResponse.json({ error: 'Fall nicht gefunden oder keine Berechtigung.' }, { status: 404 });
    }

    // Meta aus Graph ziehen (Cache für die Anzeige)
    let subject: string | null = null;
    let fromName: string | null = null;
    let fromAddress: string | null = null;
    let receivedAt: string | null = null;
    let conversationId: string | null = null;
    try {
      const m = await getMessage(messageId);
      subject = m.subject || null;
      fromName = m.from?.name || null;
      fromAddress = m.from?.address || null;
      receivedAt = m.receivedDateTime || null;
      conversationId = m.conversationId || null;
    } catch (err) {
      if (err instanceof MailError) {
        return NextResponse.json({ error: err.message }, { status: err.status || 500 });
      }
      throw err;
    }

    const { data: inserted, error } = await supabase
      .from('case_mail_links')
      .insert({
        practice_id: practiceId,
        case_id: caseId,
        message_id: messageId,
        conversation_id: conversationId,
        subject,
        from_name: fromName,
        from_address: fromAddress,
        received_at: receivedAt,
        linked_by: userId,
      })
      .select('id, case_id, message_id, subject, from_name, from_address, received_at, linked_by, linked_at')
      .single();

    if (error) {
      // Unique-Violation → schon verknüpft
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Diese Mail ist bereits mit dem Fall verknüpft.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message || 'Verknüpfung fehlgeschlagen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, link: inserted as LinkRow }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/messages/:id/link] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
