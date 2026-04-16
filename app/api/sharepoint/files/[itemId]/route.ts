import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import {
  getFileText,
  updateTextFile,
  isSharePointConfigured,
  SharePointError,
} from '../../../../../lib/server/sharepoint';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ itemId: string }> };

const MAX_CONTENT_LENGTH = 200_000;

function getDriveIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get('driveId') || null;
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isSharePointConfigured()) {
      return NextResponse.json(
        { error: 'SharePoint ist nicht konfiguriert.' },
        { status: 503 }
      );
    }

    const { itemId } = await ctx.params;
    const driveId = getDriveIdFromRequest(req);
    if (!itemId) {
      return NextResponse.json({ error: 'itemId fehlt.' }, { status: 400 });
    }
    if (!driveId) {
      return NextResponse.json(
        { error: 'driveId-Query-Parameter fehlt.' },
        { status: 400 }
      );
    }

    const result = await getFileText(driveId, itemId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SharePointError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/sharepoint/files/:id] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isSharePointConfigured()) {
      return NextResponse.json(
        { error: 'SharePoint ist nicht konfiguriert.' },
        { status: 503 }
      );
    }

    const { itemId } = await ctx.params;
    if (!itemId) {
      return NextResponse.json({ error: 'itemId fehlt.' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const driveId = typeof body?.driveId === 'string'
      ? body.driveId
      : getDriveIdFromRequest(req);
    const content = typeof body?.content === 'string' ? body.content : null;

    if (!driveId) {
      return NextResponse.json({ error: 'driveId fehlt.' }, { status: 400 });
    }
    if (content === null) {
      return NextResponse.json({ error: 'content fehlt.' }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Inhalt überschreitet ${MAX_CONTENT_LENGTH} Zeichen.` },
        { status: 400 }
      );
    }

    const item = await updateTextFile(driveId, itemId, content);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof SharePointError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/sharepoint/files/:id] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
