import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const { messages, context } = await req.json();

  const systemPrompt = `
Du bist ein hochqualifizierter, erfahrener Tierarzt (Fachtierarzt-Niveau, Klinikniveau).

DEINE AUFGABE:
- Unterstütze Tierärzte bei klinischen Entscheidungen
- Analysiere Fälle präzise und differenziert
- Antworte strukturiert, fachlich korrekt und praxisnah

WICHTIG:
- Keine allgemeinen Floskeln
- Keine Laienerklärungen
- Fokus auf klinische Relevanz
- Wenn Unsicherheit → klar benennen
- Denke wie ein Oberarzt in einer Tierklinik
- Bei medizinischen Fakten, Dosierungen oder Leitlinien: nenne belastbare Quellen
- Wenn keine belastbare Quelle vorliegt: kennzeichne dies explizit
- Füge am Ende einen Abschnitt "Quellen" hinzu, wenn du fachliche Aussagen mit Evidenz machst
- Gib Quellen als anklickbare Links im Format [Kurzname](https://...) aus

ANTWORTSTRUKTUR (wenn sinnvoll):
- Einschätzung
- Differentialdiagnosen
- Diagnostik (next steps)
- Therapie / Vorgehen
- Prognose (optional)

KONTEXT DES AKTUELLEN FALLS:
${context || "Kein Kontext vorhanden"}

Nutze diesen Kontext aktiv in deiner Antwort.
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` // ✅ FIX
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      stream: true,
      input: [
        {
          role: "system",
          content: systemPrompt
        },
        ...messages.map((m: any) => ({
          role: m.role,
          content: m.content
        }))
      ],
      temperature: 0.3,
      max_output_tokens: 1200
    })
  });

  if (!response.ok || !response.body) {
    const error = await response.text();
    return NextResponse.json({ error }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);

        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;

          // ✅ WICHTIG: nur echte Daten verarbeiten
          if (!line.startsWith("data:")) continue;

          const json = line.replace("data: ", "").trim();

          if (json === "[DONE]") continue;

          try {
            const parsed = JSON.parse(json);

            let text = "";

// neuer responses API Pfad
if (parsed.type === "response.output_text.delta") {
  text = parsed.delta;
}

// fallback (alte Struktur)
if (!text) {
  text =
    parsed?.output?.[0]?.content?.[0]?.text ||
    parsed?.delta?.content ||
    "";
}

            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          } catch {
            // ignore Fehler
          }
        }
      }

      controller.close();
    }
  });

  return new Response(stream);
}