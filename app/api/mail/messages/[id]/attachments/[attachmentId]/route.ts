import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../../lib/server/getUserPractice';
import { getAttachmentContent, MailError } from '../../../../../../../lib/server/mail';
import { isMsGraphConfigured } from '../../../../../../../lib/server/msGraph';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const { id, attachmentId } = await ctx.params;
    if (!id || !attachmentId) {
      return NextResponse.json({ error: 'IDs fehlen.' }, { status: 400 });
    }

    const { buffer, contentType, name } = await getAttachmentContent(id, attachmentId);

    const encodedName = encodeURIComponent(name);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    if (error instanceof MailError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/messages/:id/attachments] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
