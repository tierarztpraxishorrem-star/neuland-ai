import { NextResponse } from 'next/server';
import {
  getUserPractice,
} from '../../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
} from '../../../../../lib/server/hrUtils';

type PatchBody = {
  starts_at?: string;
  ends_at?: string;
  note?: string;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const updates: Record<string, string> = {};

    if (body.starts_at) {
      if (!/^\d{2}:\d{2}$/.test(body.starts_at)) {
        return NextResponse.json({ error: 'Startzeit im Format HH:MM erforderlich.' }, { status: 400 });
      }
      updates.starts_at = body.starts_at;
    }

    if (body.ends_at) {
      if (!/^\d{2}:\d{2}$/.test(body.ends_at)) {
        return NextResponse.json({ error: 'Endzeit im Format HH:MM erforderlich.' }, { status: 400 });
      }
      updates.ends_at = body.ends_at;
    }

    if (typeof body.note === 'string') {
      updates.note = body.note.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Keine Änderungen angegeben.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('shifts')
      .update(updates)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('id, employee_id, date, starts_at, ends_at, note, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Schicht nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, shift: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/shifts/[id]] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', id)
      .eq('practice_id', practiceId);

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Löschen der Schicht.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/shifts/[id]] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
