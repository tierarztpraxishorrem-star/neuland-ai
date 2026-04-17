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
          content: `Du extrahierst strukturierte Patientendaten UND Medikamente aus einem gesprochenen Text eines Tierarztes.
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
  "diet_type": "Diät oder null",
  "medications": [
    {
      "name": "Medikamentenname",
      "dose": "Dosierung als Text (z.B. '3,1 ml' oder '25mg/kg')",
      "route": "i.v.|p.o.|s.c.|i.m.|rektal|topisch oder null",
      "frequency_label": "1x täglich|2x täglich|3x täglich|4x täglich|bei Bedarf oder null",
      "scheduled_hours": [8, 16, 0],
      "is_prn": false,
      "is_dti": false,
      "dti_rate_ml_h": null
    }
  ]
}

Regeln:
- Extrahiere nur was im Text vorkommt, erfinde nichts
- "Rüde" = "männlich", "Hündin" = "weiblich"
- "kastriert" / "kastrierte Hündin" entsprechend zuordnen
- Gewicht als reine Zahl (z.B. "32" nicht "32 kg")
- Wenn etwas unklar ist: null setzen
- medications: leeres Array [] wenn keine Medikamente genannt werden
- Medikamente: Erkenne typische Angaben wie "Metamizol 50mg/kg 3x täglich i.v." oder "Ringerlaktat Dauertropf 60ml pro Stunde"
- Bei "Dauertropf" / "DTI" / "Dauerinfusion": is_dti = true, dti_rate_ml_h = Rate
- Bei "bei Bedarf" / "PRN" / "wenn nötig": is_prn = true
- scheduled_hours berechnen: 1x = [8], 2x = [8,20], 3x = [8,16,0], 4x = [8,14,20,2]
- Applikationsweg aus Kontext erkennen: "intravenös"/"i.v.", "oral"/"per os"/"p.o.", "subkutan"/"s.c." etc.
- Deutsche Eingabe, deutsche Ausgabe`
        },
        { role: 'user', content: transcript }
      ],
      temperature: 0.1,
    });

    const outputText = response.output_text || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      console.error('[api/station/parse-voice] JSON-Parse Fehler:', outputText);
      return NextResponse.json({ error: 'Konnte Text nicht auswerten.' }, { status: 500 });
    }

    // Separate medications from fields
    const medications = Array.isArray(parsed.medications) ? parsed.medications : [];
    delete parsed.medications;

    // Clean null values from fields
    for (const key of Object.keys(parsed)) {
      if (parsed[key] === null || parsed[key] === 'null' || parsed[key] === '') {
        delete parsed[key];
      }
    }

    return NextResponse.json({ ok: true, fields: parsed, medications });
  } catch (error) {
    console.error('[api/station/parse-voice] POST Fehler:', error);
    return NextResponse.json({ error: 'Fehler beim Auswerten.' }, { status: 500 });
  }
}
