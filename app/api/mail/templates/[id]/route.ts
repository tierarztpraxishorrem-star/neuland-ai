import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const MAX_BODY_LENGTH = 20_000;

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'ID fehlt.' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, string | null> = {};
    if (typeof body?.name === 'string') patch.name = body.name.trim();
    if (typeof body?.subject === 'string' || body?.subject === null) {
      patch.subject = body.subject ? String(body.subject).trim() : null;
    }
    if (typeof body?.body === 'string') {
      if (body.body.length > MAX_BODY_LENGTH) {
        return NextResponse.json({ error: `Inhalt überschreitet ${MAX_BODY_LENGTH} Zeichen.` }, { status: 400 });
      }
      patch.body = body.body;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Keine Änderungen.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('mail_templates')
      .update(patch)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('id, name, subject, body, created_by, created_at, updated_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Vorlage nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, template: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/templates/:id] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'ID fehlt.' }, { status: 400 });

    const { error } = await supabase
      .from('mail_templates')
      .delete()
      .eq('id', id)
      .eq('practice_id', practiceId);

    if (error) {
      return NextResponse.json({ error: error.message || 'Löschen fehlgeschlagen.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/templates/:id] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
