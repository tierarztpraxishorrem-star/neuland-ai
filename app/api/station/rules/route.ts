import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const { data, error } = await supabase
      .from('station_ai_rules')
      .select('*')
      .eq('practice_id', practiceId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Fehler beim Laden der Regeln.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rules: data || [] });
  } catch (error) {
    console.error('[api/station/rules] GET Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const body = await req.json();
    if (!body.medication_name?.trim() || !body.rule_text?.trim()) {
      return NextResponse.json({ error: 'Medikamentenname und Regeltext sind erforderlich.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('station_ai_rules')
      .insert({
        practice_id: practiceId,
        medication_name: body.medication_name.trim(),
        rule_text: body.rule_text.trim(),
        created_by: body.created_by || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[api/station/rules] POST Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Speichern.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rule: data }, { status: 201 });
  } catch (error) {
    console.error('[api/station/rules] POST Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}
