import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import {
  getRootSite,
  listSites,
  getDefaultSiteId,
  isSharePointConfigured,
  SharePointError,
} from '../../../../lib/server/sharepoint';

export const runtime = 'nodejs';

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
    const searchQuery = url.searchParams.get('search') || '*';

    const [defaultId, root, sites] = await Promise.all([
      getDefaultSiteId().catch(() => null),
      getRootSite().catch(() => null),
      listSites(searchQuery).catch(() => [] as Awaited<ReturnType<typeof listSites>>),
    ]);

    return NextResponse.json({
      ok: true,
      defaultSiteId: defaultId,
      configuredSiteId: process.env.MICROSOFT_SHAREPOINT_SITE_ID || null,
      rootSite: root,
      sites,
    });
  } catch (error) {
    if (error instanceof SharePointError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/sharepoint/site] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
