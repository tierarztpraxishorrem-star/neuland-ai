import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import {
  listFolderContents,
  createTextFile,
  getDefaultSiteId,
  isSharePointConfigured,
  SharePointError,
} from '../../../../lib/server/sharepoint';

export const runtime = 'nodejs';

const MAX_CONTENT_LENGTH = 200_000; // 200k characters

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isSharePointConfigured()) {
      return NextResponse.json(
        { error: 'SharePoint ist nicht konfiguriert.' },
        { status: 503 }
      );
    }

    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '';
    const siteIdOverride = url.searchParams.get('siteId');

    const siteId = siteIdOverride || (await getDefaultSiteId());
    const items = await listFolderContents(siteId, path);
    return NextResponse.json({ ok: true, siteId, path, items });
  } catch (error) {
    if (error instanceof SharePointError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/sharepoint/files] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isSharePointConfigured()) {
      return NextResponse.json(
        { error: 'SharePoint ist nicht konfiguriert.' },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const folderPath = typeof body?.folderPath === 'string' ? body.folderPath : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
    const content = typeof body?.content === 'string' ? body.content : '';
    const siteIdOverride = typeof body?.siteId === 'string' ? body.siteId : undefined;

    if (!fileName) {
      return NextResponse.json({ error: 'Dateiname fehlt.' }, { status: 400 });
    }
    if (/[\\/:*?"<>|]/.test(fileName)) {
      return NextResponse.json(
        { error: 'Dateiname enthält ungültige Zeichen ( \\ / : * ? " < > | ).' },
        { status: 400 }
      );
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Inhalt überschreitet ${MAX_CONTENT_LENGTH} Zeichen.` },
        { status: 400 }
      );
    }

    const siteId = siteIdOverride || (await getDefaultSiteId());
    const item = await createTextFile(siteId, folderPath, fileName, content);
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    if (error instanceof SharePointError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/sharepoint/files] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
