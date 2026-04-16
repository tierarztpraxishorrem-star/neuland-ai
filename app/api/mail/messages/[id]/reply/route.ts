import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { replyToMessage, MailError, MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES } from '../../../../../../lib/server/mail';
import { isMsGraphConfigured } from '../../../../../../lib/server/msGraph';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const MAX_BODY_LENGTH = 50_000;

type Parsed = {
  body: string;
  replyAll: boolean;
  isHtml: boolean;
  attachments: { name: string; contentType: string; contentBytes: string }[];
  error?: string;
};

async function parseJson(req: Request): Promise<Parsed> {
  const data = await req.json().catch(() => ({}));
  return {
    body: typeof data.body === 'string' ? data.body : '',
    replyAll: Boolean(data.replyAll),
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
        body: '', replyAll: false, isHtml: false, attachments: [],
        error: `Anhang "${f.name}" überschreitet ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`,
      };
    }
    total += f.size;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      return {
        body: '', replyAll: false, isHtml: false, attachments: [],
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
  const replyAllRaw = String(form.get('replyAll') || '');
  const isHtmlRaw = String(form.get('isHtml') || '');
  return {
    body: String(form.get('body') || ''),
    replyAll: replyAllRaw === 'true' || replyAllRaw === '1',
    isHtml: isHtmlRaw === 'true' || isHtmlRaw === '1',
    attachments,
  };
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Nachrichten-ID fehlt.' }, { status: 400 });

    const contentType = req.headers.get('content-type') || '';
    const parsed = contentType.includes('multipart/form-data')
      ? await parseFormData(req)
      : await parseJson(req);

    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (!parsed.body.trim()) {
      return NextResponse.json({ error: 'Antworttext fehlt.' }, { status: 400 });
    }
    if (parsed.body.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `Inhalt überschreitet ${MAX_BODY_LENGTH} Zeichen.` }, { status: 400 });
    }

    await replyToMessage({
      messageId: id,
      body: parsed.body,
      replyAll: parsed.replyAll,
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
    console.error('[api/mail/messages/:id/reply] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
