import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

const MAX_LENGTH = 5_000;

// GET → aktuelle Mail-Signatur der Praxis
export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase } = auth.context;
    const { data } = await supabase
      .from('practice_settings')
      .select('mail_signature')
      .eq('id', 1)
      .maybeSingle();

    return NextResponse.json({ ok: true, signature: data?.mail_signature || '' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/signature] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT → setzt die Signatur (admin-only)
export async function PUT(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.context;
    const body = await req.json().catch(() => ({}));
    const signature = typeof body?.signature === 'string' ? body.signature : '';

    if (signature.length > MAX_LENGTH) {
      return NextResponse.json({ error: `Signatur überschreitet ${MAX_LENGTH} Zeichen.` }, { status: 400 });
    }

    // Upsert: Zeile id=1 existiert per CHECK-Constraint, ggf. anlegen
    const { data: existing } = await supabase
      .from('practice_settings')
      .select('id')
      .eq('id', 1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('practice_settings')
        .update({ mail_signature: signature })
        .eq('id', 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from('practice_settings')
        .insert({ id: 1, mail_signature: signature });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, signature });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/signature] PUT Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
