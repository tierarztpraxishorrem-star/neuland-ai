import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import {
  searchSharePoint,
  isSharePointConfigured,
  SharePointError,
} from '../../../../lib/server/sharepoint';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isSharePointConfigured()) {
      return NextResponse.json(
        { error: 'SharePoint ist nicht konfiguriert. Bitte zuerst /api/sharepoint/setup prüfen.' },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return NextResponse.json({ error: 'Suchbegriff fehlt.' }, { status: 400 });
    }
    if (query.length > 200) {
      return NextResponse.json({ error: 'Suchbegriff ist zu lang (max. 200 Zeichen).' }, { status: 400 });
    }

    const results = await searchSharePoint(query);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    if (error instanceof SharePointError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/sharepoint/search] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
