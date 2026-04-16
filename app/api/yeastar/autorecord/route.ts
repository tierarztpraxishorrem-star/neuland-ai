import { NextResponse } from 'next/server';
import { getAutoRecordSettings, updateAutoRecordSettings } from '../../../../lib/yeastarApi';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

/**
 * GET  /api/yeastar/autorecord → check current auto-record settings
 * POST /api/yeastar/autorecord → enable/disable auto-recording
 * Admin/owner only.
 */

export async function GET(req: Request) {
  const access = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
  if (!access.ok) return access.response;

  try {
    const data = await getAutoRecordSettings();
    return NextResponse.json({ ok: true, settings: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Yeastar-Fehler' }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const access = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
  if (!access.ok) return access.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { enable } = body as { enable?: boolean };

    const data = await updateAutoRecordSettings({
      inbound: enable !== false ? 'on' : 'off',
      outbound: enable !== false ? 'on' : 'off',
    });

    return NextResponse.json({ ok: true, result: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Yeastar-Fehler' }, { status: 502 });
  }
}
