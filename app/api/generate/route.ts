export const maxDuration = 300; // 5 min – long transcripts need time for report generation

const PRIMARY_CONSULT_MODEL = process.env.OPENAI_CONSULT_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-5";
const FALLBACK_CONSULT_MODEL =
  process.env.OPENAI_CONSULT_FALLBACK_MODEL || process.env.OPENAI_CHAT_FALLBACK_MODEL || "gpt-4.1";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const body = await req.json();

    const {
      transcript,
      imageAnalysis,
      notes,
      aiRequest,
    } = body;

    // Bildanalyse sauber vorbereiten
    const imageSection = imageAnalysis
      ? `

Zusätzlicher Befund aus Bild-/Dokumentanalyse:
${imageAnalysis}
`
      : "";

    const prompt = `
  Du arbeitest auf Diplomate-/Professoren-Niveau (ECVIM/ACVIM, Innere Medizin) als medizinischer Dokumentations- und Konsiliarassistent für eine tierärztliche Überweisungspraxis.

  Erstelle klinische Befundberichte für Kolleg:innen in professioneller, präziser, deutscher Sprache.

  PRIMAERZIEL:
  - maximal korrekte, differenzierte und klinisch belastbare Darstellung
  - klare Trennung zwischen gesicherten Befunden, wahrscheinlichen Annahmen und offenen Punkten
  - konsequente Priorisierung nach klinischer Relevanz und Risiko

WICHTIG:
  - Verwende KEINE Angaben wie Tierart, Name, Alter oder Rasse im Text
  - Diese sind bereits im Praxisverwaltungssystem vorhanden
  - Keine Halluzinationen: nichts erfinden, Luecken explizit benennen
  - Bei unklarer Datenlage konservativ formulieren und Verifikationsschritte nennen

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
- Differentialdiagnosen priorisieren (Wahrscheinlichkeit + Gefaehrlichkeit)
- Kritische Red Flags klar markieren

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

Interne Diskussion:
→ Differentialdiagnosen mit Pro/Contra und kurzen Begruendungen
→ klare Empfehlung, welche Zusatzinformation die Diagnose am staerksten absichert

Interne Rueckmeldung zur Vollstaendigkeit:
→ fehlende Schluesseldaten als kurze Checkliste

Zusätzlicher Wunsch:
${aiRequest || "keiner"}

Zusatzinformationen:
${notes || "keine"}

Transkript:
${transcript}
${imageSection}
`;

    const callModel = async (model: string) => {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          store: false,
          input: [
            {
              role: "system",
              content:
                "Du bist ein hochqualifizierter Fachtierarzt (Diplomate-Niveau) für Innere Medizin und erstellst klinisch belastbare, strukturierte Dokumentation für ein veterinärmedizinisches Fachpublikum.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.15,
          max_output_tokens: 2200,
        }),
      });

      const payload = (await response.json()) as {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
        error?: { message?: string };
      };

      const text =
        payload.output_text || payload.output?.[0]?.content?.map((c) => c.text || "").join("") || "";

      return {
        ok: response.ok,
        text,
        error: payload.error?.message || "",
      };
    };

    let usedModel = PRIMARY_CONSULT_MODEL;
    let completion = await callModel(usedModel);

    if (!completion.ok && usedModel !== FALLBACK_CONSULT_MODEL) {
      const fallback = await callModel(FALLBACK_CONSULT_MODEL);
      if (fallback.ok && fallback.text.trim()) {
        completion = fallback;
        usedModel = FALLBACK_CONSULT_MODEL;
      } else {
        return Response.json(
          {
            error: `Generierung fehlgeschlagen. Primary (${PRIMARY_CONSULT_MODEL}): ${completion.error}; Fallback (${FALLBACK_CONSULT_MODEL}): ${fallback.error}`,
          },
          { status: 500 },
        );
      }
    }

    if (!completion.text.trim()) {
      return Response.json({ error: "Leere Modellantwort bei Generierung" }, { status: 500 });
    }

    return Response.json({
      result: completion.text,
      model: usedModel,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
      return Response.json({ error: "OPENAI_API_KEY fehlt" }, { status: 500 });
    }
    return Response.json({ error: "Generierung fehlgeschlagen" }, { status: 500 });
  }
}