import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import OpenAI from 'openai';

type RouteContext = { params: Promise<{ id: string }> };

function calculateAge(birthDate: string | null): string {
  if (!birthDate) return 'unbekannt';
  const birth = new Date(birthDate);
  const now = new Date();
  const years = now.getFullYear() - birth.getFullYear();
  const months = now.getMonth() - birth.getMonth();
  if (years < 1) return `${Math.max(0, months + (years * 12))} Monate`;
  return `${years} Jahre`;
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id } = await ctx.params;

    // Load patient
    const { data: patient, error: patientError } = await supabase
      .from('station_patients')
      .select('*')
      .eq('id', id)
      .eq('practice_id', practiceId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: 'Patient nicht gefunden.' }, { status: 404 });
    }

    // Load active medications
    const { data: medications } = await supabase
      .from('station_medications')
      .select('*')
      .eq('station_patient_id', id)
      .eq('is_active', true);

    if (!medications || medications.length === 0) {
      return NextResponse.json({ ok: true, alerts: [], message: 'Keine aktiven Medikamente zu prüfen.' });
    }

    const openai = new OpenAI();

    const systemPrompt = `Du bist ein veterinärmedizinisches KI-Sicherheitssystem für eine Tierarztpraxis.
Deine Aufgabe ist die Sicherheitsprüfung von Medikamentenplänen. Du MUSST Fehler finden – ein übersehener Fehler kann ein Tier töten.

Prüfe JEDEN Medikamenteneintrag systematisch auf:

1. **KONTRAINDIKATIONEN (severity: critical)**
   - Medikamente, die bei bestimmten Tierarten kontraindiziert sind
   - Beispiele: Ibuprofen, Paracetamol, Diclofenac → bei Hund und Katze KONTRAINDIZIERT (nephro-/hepatotoxisch)
   - Permethrin → bei Katzen TÖDLICH
   - Metronidazol-Überdosierung → neurotoxisch
   - Meloxicam bei Katzen nur einmalig s.c., NICHT oral mehrtägig

2. **DOSIERUNGSFEHLER (severity: critical oder warning)**
   - Vergleiche die angegebene Dosis (mg/kg) mit der empfohlenen therapeutischen Dosis für die Tierart
   - Eine Dosis >2x der Maximaldosis = critical
   - Eine Dosis >1.5x der Maximaldosis = warning
   - Häufigkeit prüfen: Wie oft pro Tag? Passt das zum Medikament?

3. **WECHSELWIRKUNGEN (severity: warning oder critical)**
   - NSAIDs + Kortikosteroide = GI-Ulzera-Risiko (critical)
   - Mehrere NSAIDs gleichzeitig = critical
   - Nephrotoxische Kombination = critical

4. **FEHLENDE ANGABEN (severity: info)**
   - Kein Gewicht bei gewichtsabhängiger Dosierung
   - Keine Tierart angegeben
   - Applikationsweg fehlt

5. **UNGEWÖHNLICHE KOMBINATIONEN (severity: info oder warning)**

WICHTIG: Im Zweifel IMMER warnen. Ein false-positive ist akzeptabel, ein false-negative ist gefährlich.

Antworte NUR mit einem JSON-Array. Kein Text davor oder danach.
Format: [{ "alert_type": "dose_too_high|dose_too_low|interaction|allergy|missing_info|unusual_combination", "severity": "info|warning|critical", "message": "Kurze deutsche Warnung", "details": "Ausführliche Erklärung auf Deutsch mit empfohlener Dosis", "medication_name": "Name des betreffenden Medikaments" }]

Wenn alles in Ordnung ist: []`;

    const userPrompt = `Patient: ${patient.species || 'unbekannt'}, ${patient.breed || 'unbekannt'}, ${patient.gender || 'unbekannt'}
Gewicht: ${patient.weight_kg ? `${patient.weight_kg} kg` : 'nicht angegeben'}
Alter: ${calculateAge(patient.birth_date)}
Diagnose: ${patient.diagnosis || 'keine angegeben'}

Medikamente:
${medications.map((m: Record<string, unknown>) => {
      const hours = (m.scheduled_hours as number[]) || [];
      const freq = m.frequency_label || (hours.length > 0 ? `${hours.length}x täglich (${hours.map(h => `${h}:00`).join(', ')})` : 'keine Angabe');
      const doseInfo = m.dose_mg_per_kg ? `, ${m.dose_mg_per_kg} mg/kg` : '';
      const route = m.route ? `, ${m.route}` : '';
      const dti = m.is_dti ? `, Dauerinfusion ${m.dti_rate_ml_h} ml/h` : '';
      const prn = m.is_prn ? ', bei Bedarf' : '';
      return `- ${m.name}: ${m.dose} (${freq}${doseInfo}${route}${dti}${prn})`;
    }).join('\n')}`;

    const response = await openai.responses.create({
      model: 'gpt-4.1',
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    });

    const outputText = response.output_text || '[]';
    let alerts: Array<Record<string, unknown>>;
    try {
      alerts = JSON.parse(outputText);
    } catch {
      console.error('[api/station/ai-check] JSON-Parse Fehler:', outputText);
      alerts = [];
    }

    // Clear old non-acknowledged alerts
    await supabase
      .from('station_ai_alerts')
      .delete()
      .eq('station_patient_id', id)
      .eq('is_acknowledged', false);

    // Save new alerts
    if (alerts.length > 0) {
      const alertRows = alerts.map((a) => {
        // Try to find the medication_id by name
        const matchedMed = medications.find(
          (m: Record<string, unknown>) => m.name === a.medication_name
        );
        return {
          station_patient_id: id,
          practice_id: practiceId,
          alert_type: a.alert_type,
          severity: a.severity,
          message: a.message,
          details: a.details || null,
          medication_id: matchedMed?.id || null,
        };
      });

      await supabase.from('station_ai_alerts').insert(alertRows);
    }

    return NextResponse.json({ ok: true, alerts });
  } catch (error) {
    console.error('[api/station/ai-check] POST Fehler:', error);
    return NextResponse.json({ error: 'Fehler bei der KI-Prüfung.' }, { status: 500 });
  }
}
