import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import {
  getMessage,
  markRead,
  listAttachments,
  MailError,
} from '../../../../../lib/server/mail';
import { isMsGraphConfigured } from '../../../../../lib/server/msGraph';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Nachrichten-ID fehlt.' }, { status: 400 });

    const [message, attachments] = await Promise.all([
      getMessage(id),
      listAttachments(id).catch(() => []),
    ]);

    return NextResponse.json({ ok: true, message, attachments });
  } catch (error) {
    if (error instanceof MailError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/messages/:id] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Nachrichten-ID fehlt.' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const isRead = body?.isRead !== false;

    await markRead(id, isRead);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MailError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/messages/:id] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
