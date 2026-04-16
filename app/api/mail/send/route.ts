import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { sendMail, MailError, MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES } from '../../../../lib/server/mail';
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

type Parsed = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  isHtml: boolean;
  attachments: { name: string; contentType: string; contentBytes: string }[];
  error?: string;
};

async function parseJson(req: Request): Promise<Parsed> {
  const data = await req.json().catch(() => ({}));
  return {
    to: parseRecipients(data.to),
    cc: parseRecipients(data.cc),
    bcc: parseRecipients(data.bcc),
    subject: typeof data.subject === 'string' ? data.subject.trim() : '',
    body: typeof data.body === 'string' ? data.body : '',
    isHtml: Boolean(data.isHtml),
    attachments: [],
  };
}

async function parseFormData(req: Request): Promise<Parsed> {
  const form = await req.formData();
  const files = form.getAll('files') as File[];
  let total = 0;
  const attachments = [] as Parsed['attachments'];
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > MAX_ATTACHMENT_BYTES) {
      return {
        to: [], cc: [], bcc: [], subject: '', body: '', isHtml: false, attachments: [],
        error: `Anhang "${f.name}" überschreitet ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`,
      };
    }
    total += f.size;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      return {
        to: [], cc: [], bcc: [], subject: '', body: '', isHtml: false, attachments: [],
        error: `Gesamtgröße der Anhänge überschreitet ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024)} MB.`,
      };
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    attachments.push({
      name: f.name,
      contentType: f.type || 'application/octet-stream',
      contentBytes: buffer.toString('base64'),
    });
  }
  return {
    to: parseRecipients(form.get('to')),
    cc: parseRecipients(form.get('cc')),
    bcc: parseRecipients(form.get('bcc')),
    subject: String(form.get('subject') || '').trim(),
    body: String(form.get('body') || ''),
    isHtml: String(form.get('isHtml') || '') === 'true' || String(form.get('isHtml') || '') === '1',
    attachments,
  };
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const contentType = req.headers.get('content-type') || '';
    const parsed = contentType.includes('multipart/form-data')
      ? await parseFormData(req)
      : await parseJson(req);

    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    if (parsed.to.length === 0) {
      return NextResponse.json({ error: 'Mindestens ein Empfänger ist erforderlich.' }, { status: 400 });
    }
    if (!parsed.subject) {
      return NextResponse.json({ error: 'Betreff ist erforderlich.' }, { status: 400 });
    }
    if (!parsed.body.trim()) {
      return NextResponse.json({ error: 'Nachrichteninhalt ist erforderlich.' }, { status: 400 });
    }
    if (parsed.body.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `Inhalt überschreitet ${MAX_BODY_LENGTH} Zeichen.` }, { status: 400 });
    }

    await sendMail({
      to: parsed.to,
      cc: parsed.cc,
      bcc: parsed.bcc,
      subject: parsed.subject,
      body: parsed.body,
      isHtml: parsed.isHtml,
      attachments: parsed.attachments,
    });
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
