import { NextResponse } from 'next/server';
import {
  getUserPractice,
} from '../../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
} from '../../../../../lib/server/hrUtils';

type PatchBody = {
  status?: string;
};

const ALLOWED_STATUSES = ['approved', 'rejected'];

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

    if (!body.status || !ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Status muss "approved" oder "rejected" sein.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('absences')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('id, employee_id, type, starts_on, ends_on, note, status, created_at, updated_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Abwesenheit nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, absence: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/absences/[id]] PATCH Fehler:', error);
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
      .from('absences')
      .delete()
      .eq('id', id)
      .eq('practice_id', practiceId);

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Löschen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/absences/[id]] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
