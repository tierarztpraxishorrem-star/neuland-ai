import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { transcript } = await req.json();
    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'Kein Transkript.' }, { status: 400 });
    }

    const openai = new OpenAI();

    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: `Du extrahierst strukturierte Patientendaten aus einem gesprochenen Text eines Tierarztes.
Antworte NUR mit einem JSON-Objekt. Kein Text davor oder danach.

Format:
{
  "patient_name": "Name des Tieres oder null",
  "species": "Hund|Katze|Kaninchen|Vogel|Reptil oder null",
  "breed": "Rasse oder null",
  "gender": "männlich|weiblich|männlich kastriert|weiblich kastriert oder null",
  "weight_kg": "Gewicht als Zahl oder null",
  "owner_name": "Besitzername oder null",
  "box_number": "Box-Nummer oder null",
  "diagnosis": "Diagnose oder null",
  "problems": "Probleme oder null",
  "responsible_vet": "Tierarzt oder null",
  "responsible_tfa": "TFA oder null",
  "cave_details": "CAVE-Hinweis oder null",
  "iv_catheter_location": "Braunüle-Ort oder null",
  "diet_type": "Diät oder null"
}

Regeln:
- Extrahiere nur was im Text vorkommt, erfinde nichts
- "Rüde" = "männlich", "Hündin" = "weiblich"
- "kastriert" / "kastrierte Hündin" entsprechend zuordnen
- Gewicht als reine Zahl (z.B. "32" nicht "32 kg")
- Wenn etwas unklar ist: null setzen
- Deutsche Eingabe, deutsche Ausgabe`
        },
        { role: 'user', content: transcript }
      ],
      temperature: 0.1,
    });

    const outputText = response.output_text || '{}';
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(outputText);
    } catch {
      console.error('[api/station/parse-voice] JSON-Parse Fehler:', outputText);
      return NextResponse.json({ error: 'Konnte Text nicht auswerten.' }, { status: 500 });
    }

    // Clean null values
    for (const key of Object.keys(fields)) {
      if (fields[key] === null || fields[key] === 'null' || fields[key] === '') {
        delete fields[key];
      }
    }

    return NextResponse.json({ ok: true, fields });
  } catch (error) {
    console.error('[api/station/parse-voice] POST Fehler:', error);
    return NextResponse.json({ error: 'Fehler beim Auswerten.' }, { status: 500 });
  }
}
