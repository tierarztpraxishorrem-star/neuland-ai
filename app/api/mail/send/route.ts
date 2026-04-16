import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { sendMail, MailError } from '../../../../lib/server/mail';
import { isMsGraphConfigured } from '../../../../lib/server/msGraph';

export const runtime = 'nodejs';

const MAX_BODY_LENGTH = 50_000;

function parseRecipients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.includes('@')).map((v) => v.trim());
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
  }
  return [];
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const data = await req.json().catch(() => ({}));
    const to = parseRecipients(data.to);
    const cc = parseRecipients(data.cc);
    const bcc = parseRecipients(data.bcc);
    const subject = typeof data.subject === 'string' ? data.subject.trim() : '';
    const body = typeof data.body === 'string' ? data.body : '';
    const isHtml = Boolean(data.isHtml);

    if (to.length === 0) {
      return NextResponse.json({ error: 'Mindestens ein Empfänger ist erforderlich.' }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: 'Betreff ist erforderlich.' }, { status: 400 });
    }
    if (!body.trim()) {
      return NextResponse.json({ error: 'Nachrichteninhalt ist erforderlich.' }, { status: 400 });
    }
    if (body.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `Inhalt überschreitet ${MAX_BODY_LENGTH} Zeichen.` }, { status: 400 });
    }

    await sendMail({ to, cc, bcc, subject, body, isHtml });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    if (error instanceof MailError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/send] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
