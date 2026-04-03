import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  const body = await req.json();

  const {
    transcript,
    imageAnalysis,
    species,
    patientName,
    age,
    breed,
    notes,
    aiRequest,
  } = body;

  // 🔥 Bildanalyse sauber vorbereiten
  const imageSection = imageAnalysis
    ? `

Zusätzlicher Befund aus Bild-/Dokumentanalyse:
${imageAnalysis}
`
    : "";

  const prompt = `
Du bist medizinischer Dokumentationsassistent für eine tierärztliche Überweisungspraxis.

Erstelle klinische Befundberichte für Kolleg:innen in professioneller, präziser, deutscher Sprache.

WICHTIG:
- Verwende KEINE Angaben wie Tierart, Name, Alter oder Rasse im Text
- Diese sind bereits im Praxisverwaltungssystem vorhanden

Formatiere die Spracherkennung zu einer klar strukturierten Dokumentation.

Verwende exakt diese Struktur:

# Anamnese
# Klinische Untersuchung
# weiterführende Untersuchungen
# Diagnose
# Therapie
# Plan / Empfehlung
# Epikrise
# Patienteninformation / Patientenbrief für den Besitzer
# To-do (intern)
# Interne Diskussion (Differentialdiagnosen und weitere Schritte)
# Interne Rückmeldung zur Vollständigkeit
# Zusätzliche Wünsche

Regeln:
- medizinisch korrekt und prägnant
- Bulletpoints verwenden (außer Patientenbrief)
- keine Umgangssprache
- keine JSON-Ausgabe
- jeder Abschnitt beginnt mit #
- Leerzeile zwischen Abschnitten

WICHTIG ZUSÄTZLICH:
- Wenn eine Bildanalyse vorhanden ist, integriere diese aktiv in die medizinische Bewertung
- Vermeide Aussagen wie "Röntgen steht aus", wenn ein Befund vorliegt
- Verknüpfe klinische Untersuchung und Bildbefund logisch

Klinische Untersuchung:
→ Format: Parameter: Befund
→ keine Fließtexte

Patientenbrief:
→ einfache Sprache
→ 6–20 Sätze
→ ruhig und erklärend
→ keine Stichpunkte

Diagnose:
→ wenn unklar: Problemliste + 2–3 Differentialdiagnosen

To-do:
→ max. 2–4 sinnvolle medizinische Schritte

Zusätzlicher Wunsch:
${aiRequest || "keiner"}

Zusatzinformationen:
${notes || "keine"}

Transkript:
${transcript}
${imageSection}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Du bist ein erfahrener Tierarzt." },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
  });

  return Response.json({
    result: completion.choices[0].message.content,
  });
}