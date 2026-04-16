import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { testConnection, isSharePointConfigured } from '../../../../lib/server/sharepoint';

export const runtime = 'nodejs';

// Diagnose-Endpunkt: prüft Azure-Konfiguration, testet Login & lesenden Zugriff.
// Nur für Admins.
export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const hasEnv = {
      MICROSOFT_TENANT_ID: Boolean(process.env.MICROSOFT_TENANT_ID),
      MICROSOFT_CLIENT_ID: Boolean(process.env.MICROSOFT_CLIENT_ID),
      MICROSOFT_CLIENT_SECRET: Boolean(process.env.MICROSOFT_CLIENT_SECRET),
      MICROSOFT_SHAREPOINT_SITE_ID: Boolean(process.env.MICROSOFT_SHAREPOINT_SITE_ID),
    };

    if (!isSharePointConfigured()) {
      const missing = Object.entries(hasEnv)
        .filter(([, v]) => !v)
        .map(([k]) => k)
        .filter((k) => k !== 'MICROSOFT_SHAREPOINT_SITE_ID');
      return NextResponse.json({
        ok: false,
        configured: false,
        env: hasEnv,
        hint:
          missing.length > 0
            ? `Fehlende Umgebungsvariablen: ${missing.join(', ')}. In .env.local oder Vercel eintragen.`
            : 'SharePoint nicht konfiguriert.',
      });
    }

    const test = await testConnection();
    return NextResponse.json({
      ok: test.tokenOk && !test.error,
      env: hasEnv,
      ...test,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/sharepoint/setup] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
