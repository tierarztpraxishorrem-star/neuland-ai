import { NextResponse } from 'next/server';
import { getAutoRecordSettings, updateAutoRecordSettings } from '../../../../lib/yeastarApi';

/**
 * GET  /api/yeastar/autorecord → check current auto-record settings
 * POST /api/yeastar/autorecord → enable/disable auto-recording
 */

export async function GET() {
  try {
    const data = await getAutoRecordSettings();
    return NextResponse.json({ ok: true, settings: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Yeastar-Fehler' }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { enable } = body as { enable?: boolean };

    const data = await updateAutoRecordSettings({
      // Enable auto-recording for all inbound + outbound calls
      inbound: enable !== false ? 'on' : 'off',
      outbound: enable !== false ? 'on' : 'off',
    });

    return NextResponse.json({ ok: true, result: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Yeastar-Fehler' }, { status: 502 });
  }
}
