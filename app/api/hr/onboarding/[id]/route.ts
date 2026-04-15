import { NextResponse } from 'next/server';
import {
  getUserPractice,
} from '../../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
} from '../../../../../lib/server/hrUtils';

type PatchBody = {
  done?: boolean;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req);
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

    if (typeof body.done !== 'boolean') {
      return NextResponse.json({ error: 'Feld "done" (boolean) ist erforderlich.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('onboarding_tasks')
      .update({ done: body.done })
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('id, employee_id, title, done, due_on, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Aufgabe nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, task: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/onboarding/[id]] PATCH Fehler:', error);
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
      .from('onboarding_tasks')
      .delete()
      .eq('id', id)
      .eq('practice_id', practiceId);

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Löschen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/onboarding/[id]] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
