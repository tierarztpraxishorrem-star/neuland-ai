import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

const MAX_BODY_LENGTH = 20_000;

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;
    const { data, error } = await supabase
      .from('mail_templates')
      .select('id, name, subject, body, created_by, created_at, updated_at')
      .eq('practice_id', practiceId)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, templates: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/templates] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : null;
    const tplBody = typeof body?.body === 'string' ? body.body : '';

    if (!name) return NextResponse.json({ error: 'Name ist erforderlich.' }, { status: 400 });
    if (!tplBody.trim()) return NextResponse.json({ error: 'Inhalt ist erforderlich.' }, { status: 400 });
    if (tplBody.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `Inhalt überschreitet ${MAX_BODY_LENGTH} Zeichen.` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('mail_templates')
      .insert({
        practice_id: practiceId,
        name,
        subject,
        body: tplBody,
        created_by: userId,
      })
      .select('id, name, subject, body, created_by, created_at, updated_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Vorlage konnte nicht gespeichert werden.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, template: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/templates] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
