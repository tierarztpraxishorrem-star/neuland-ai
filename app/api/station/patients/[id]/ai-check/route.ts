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

    const systemPrompt = `Du bist ein veterinärmedizinisches KI-Sicherheitssystem.
Prüfe die folgenden Medikamente für den Patienten auf:
1. Dosierungsfehler (zu hoch / zu niedrig für Gewicht und Tierart)
2. Bekannte Wechselwirkungen zwischen den Medikamenten
3. Fehlende wichtige Angaben (z.B. kein Gewicht bei gewichtsbasierter Dosis)
4. Ungewöhnliche oder bedenkliche Kombinationen

Antworte NUR mit einem JSON-Array. Kein Text davor oder danach.
Format: [{ "alert_type": "dose_too_high|dose_too_low|interaction|missing_info|unusual_combination", "severity": "info|warning|critical", "message": "Kurze deutsche Warnung", "details": "Ausführliche Erklärung auf Deutsch", "medication_name": "Name des betreffenden Medikaments oder null" }]

Wenn alles in Ordnung ist: []
Sei konservativ – lieber eine Warnung mehr als eine zu wenig.`;

    const userPrompt = `Patient: ${patient.species || 'unbekannt'}, ${patient.breed || 'unbekannt'}, ${patient.gender || 'unbekannt'}
Gewicht: ${patient.weight_kg ? `${patient.weight_kg} kg` : 'nicht angegeben'}
Alter: ${calculateAge(patient.birth_date)}
Diagnose: ${patient.diagnosis || 'keine angegeben'}

Medikamente:
${medications.map((m: Record<string, unknown>) => `- ${m.name}: ${m.dose} (${m.frequency_label || 'keine Angabe'}${m.dose_mg_per_kg ? `, ${m.dose_mg_per_kg} mg/kg` : ''})`).join('\n')}`;

    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
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
