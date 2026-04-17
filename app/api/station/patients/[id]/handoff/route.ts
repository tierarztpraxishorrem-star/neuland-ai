import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// GET → Übergabe-Notizen dieses Patienten (neueste zuerst, max 20)
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id: patientId } = await ctx.params;

    const { data, error } = await supabase
      .from('station_shift_handoffs')
      .select('id, shift_label, transcript, recorded_by, created_at')
      .eq('station_patient_id', patientId)
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, handoffs: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST → Neue Übergabe-Notiz speichern.
// Body (JSON):  { transcript, shift_label?, recorded_by? }
// Body (FormData): audio + optional JSON fields → erst transkribieren, dann speichern
export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId } = auth.context;
    const { id: patientId } = await ctx.params;

    let transcript = '';
    let shiftLabel = '';
    let recordedBy = '';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Audio-Upload → transkribieren
      const form = await req.formData();
      const audioFile = form.get('audio') as File | null;
      shiftLabel = String(form.get('shift_label') || '');
      recordedBy = String(form.get('recorded_by') || '');

      if (!audioFile || audioFile.size === 0) {
        return NextResponse.json({ error: 'Audio-Datei fehlt.' }, { status: 400 });
      }
      if (audioFile.size > 25 * 1024 * 1024) {
        return NextResponse.json({ error: 'Audio zu groß (max. 25 MB).' }, { status: 400 });
      }

      // Transkription via OpenAI Whisper
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: 'OpenAI ist nicht konfiguriert.' }, { status: 503 });
      }

      const whisperForm = new FormData();
      whisperForm.append('file', audioFile, audioFile.name || 'handoff.webm');
      whisperForm.append('model', 'whisper-1');
      whisperForm.append('language', 'de');
      whisperForm.append('prompt', 'Schichtübergabe Tierarztpraxis: Patienten, Medikamente, Vitalwerte, Verlauf, Besonderheiten.');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperForm,
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.text().catch(() => '');
        return NextResponse.json({ error: `Transkription fehlgeschlagen: ${err}` }, { status: 502 });
      }

      const whisperData = (await whisperRes.json()) as { text?: string };
      transcript = whisperData.text || '';
    } else {
      // JSON mit fertigem Text
      const body = await req.json().catch(() => ({}));
      transcript = typeof body?.transcript === 'string' ? body.transcript : '';
      shiftLabel = typeof body?.shift_label === 'string' ? body.shift_label : '';
      recordedBy = typeof body?.recorded_by === 'string' ? body.recorded_by : '';
    }

    if (!transcript.trim()) {
      return NextResponse.json({ error: 'Transkript ist leer.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('station_shift_handoffs')
      .insert({
        station_patient_id: patientId,
        practice_id: practiceId,
        shift_label: shiftLabel || null,
        transcript: transcript.trim(),
        recorded_by: recordedBy || null,
        user_id: userId,
      })
      .select('id, shift_label, transcript, recorded_by, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Speichern fehlgeschlagen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, handoff: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/station/patients/:id/handoff] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
