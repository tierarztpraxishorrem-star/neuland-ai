import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { listMessages, MailError } from '../../../../lib/server/mail';
import { isMsGraphConfigured } from '../../../../lib/server/msGraph';

export const runtime = 'nodejs';

const ALLOWED_FOLDERS = new Set(['inbox', 'sentitems', 'drafts', 'archive', 'deleteditems']);

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const url = new URL(req.url);
    const folderParam = (url.searchParams.get('folder') || 'inbox').toLowerCase();
    const folder = ALLOWED_FOLDERS.has(folderParam) ? folderParam : 'inbox';
    const unreadOnly = url.searchParams.get('unread') === '1';
    const limit = Number(url.searchParams.get('limit')) || 25;
    const search = url.searchParams.get('search') || undefined;

    const messages = await listMessages({
      folder: folder as 'inbox' | 'sentitems' | 'drafts' | 'archive' | 'deleteditems',
      unreadOnly,
      limit,
      search: search || undefined,
    });

    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    if (error instanceof MailError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/messages] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
