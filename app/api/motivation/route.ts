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

    const prompt = `Erstelle einen kurzen, realistischen Motivationssatz fuer eine Tierarztpraxis.
Kein Kitsch, kein Marketing, kein LinkedIn-Stil.
Ton: ruhig, professionell, leicht unterstuetzend.
Kontext: ${context}

Beispiele:
- ruhig bleiben im Stress
- strukturierter Ablauf
- Fokus behalten

Nur 1 Satz zurueckgeben.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        temperature: 0.6,
        max_output_tokens: 60,
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
