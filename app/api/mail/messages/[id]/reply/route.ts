import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { replyToMessage, MailError } from '../../../../../../lib/server/mail';
import { isMsGraphConfigured } from '../../../../../../lib/server/msGraph';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const MAX_BODY_LENGTH = 50_000;

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Nachrichten-ID fehlt.' }, { status: 400 });

    const data = await req.json().catch(() => ({}));
    const body = typeof data.body === 'string' ? data.body : '';
    const replyAll = Boolean(data.replyAll);
    const isHtml = Boolean(data.isHtml);

    if (!body.trim()) {
      return NextResponse.json({ error: 'Antworttext fehlt.' }, { status: 400 });
    }
    if (body.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `Inhalt überschreitet ${MAX_BODY_LENGTH} Zeichen.` }, { status: 400 });
    }

    await replyToMessage({ messageId: id, body, replyAll, isHtml });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    if (error instanceof MailError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/messages/:id/reply] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
