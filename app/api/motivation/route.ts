import { NextResponse } from "next/server";

type MotivationContext = "start" | "running" | "end";

type MotivationRequestBody = {
  context?: MotivationContext;
};

const MODEL = process.env.OPENAI_MOTIVATION_MODEL || process.env.OPENAI_CHAT_FALLBACK_MODEL || "gpt-4.1-mini";

const isValidContext = (value: unknown): value is MotivationContext =>
  value === "start" || value === "running" || value === "end";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as MotivationRequestBody;
    const context = isValidContext(body.context) ? body.context : null;

    if (!context) {
      return NextResponse.json({ error: "Ungueltiger Kontext." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY fehlt." }, { status: 500 });
    }

    const prompt = `Schreibe EINEN kurzen, lockeren Satz für das Dashboard einer Tierarztpraxis.

Ton: warm, trocken, mit dezentem Augenzwinkern. Wie ein netter Kollege am Kaffeeautomat. Darf witzig, ironisch oder einfach beilaeufig sein.

Thematisch: gerne mal Tiermedizin-nah (Wartezimmer, Fellnasen, Pfoten, die erste Katze des Tages, bellende Patienten), muss aber nicht -- ganz normale Arbeits-Realitaet (Kaffee, Akten, Kollegen, Feierabend) funktioniert genauso gut. Abwechslung ist gut.

STRIKT VERMEIDEN:
- Wir-Pathos ("Gemeinsam sorgen wir für das Wohl...")
- Marketing-Sprech ("Mit Ruhe und Praezision...", "Heute zaehlt...")
- "tierisch gute"-Wortspiele, "auf-den-Hund-gekommen", "pfoetchengesund"
- LinkedIn-Ton, Karrierecoach-Vibes, Morgenandacht
- belehrende Sätze ("Denk dran...", "Achte auf...")
- Kitsch und Emoji-Parade

Kontext: ${context}
(start = Arbeitstag beginnt, running = mittendrin, end = Feierabend naht)

Gute Beispiele für den Ton:
- "Kaffee steht, Kittel sitzt -- das Wartezimmer faellt nicht von allein leer."
- "Mal sehen, welches Fellknaeuel heute als erstes versucht, unter den Stuhl zu fluechten."
- "Heute wieder: Pfoten statt Powerpoint."
- "Halbwegs ausgeschlafen? Dann kann der Tag ja kommen."
- "Noch drei Patienten, dann Feierabend. Oder vier. Mal schauen."

Nur 1 Satz. Keine Anfuehrungszeichen. Kein Emoji am Anfang.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        temperature: 0.9,
        max_output_tokens: 80,
        input: [
          {
            role: "system",
            content: "Antworte nur auf Deutsch und gib exakt einen Satz aus.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json({ error: payload.error?.message || "OpenAI Anfrage fehlgeschlagen." }, { status: 500 });
    }

    const rawText =
      payload.output_text || payload.output?.[0]?.content?.map((c) => c.text || "").join("") || "";

    const normalized = rawText.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return NextResponse.json({ error: "Leere Modellantwort." }, { status: 500 });
    }

    return NextResponse.json({ message: normalized });
  } catch {
    return NextResponse.json({ error: "Motivationssatz konnte nicht generiert werden." }, { status: 500 });
  }
}
