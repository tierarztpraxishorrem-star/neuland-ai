import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { text } = await req.json();

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "Erstelle einen extrem kurzen Titel (maximal 5 Wörter). Keine Satzzeichen."
        },
        {
          role: "user",
          content: text
        }
      ],
      max_output_tokens: 20
    })
  });

  const data = await response.json();

  const title =
    data?.output?.[0]?.content?.[0]?.text || "Neuer Chat";

  return NextResponse.json({ title });
}