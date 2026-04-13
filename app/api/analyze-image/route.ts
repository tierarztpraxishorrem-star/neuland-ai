import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
};

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAI();
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const mimeType = file.type;

    const response = await openai.responses.create({
  model: "gpt-4.1",
  input: [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `
Du bist ein erfahrener Tierarzt.

Analysiere medizinische Bilder oder Dokumente und gib eine strukturierte, fachlich korrekte Einschätzung.

Struktur:
- Befundbeschreibung
- Interpretation
- mögliche Diagnosen
- Empfehlungen
`
        },
        {
          type: "input_image",
          image_url: `data:${mimeType};base64,${base64}`,
          detail: "auto"
        }
      ]
    }
  ]
});

const result = response.output_text;

    return NextResponse.json({ result });

  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
      return NextResponse.json({ error: "OPENAI_API_KEY fehlt" }, { status: 500 });
    }
    return NextResponse.json({ error: "Fehler bei Analyse" }, { status: 500 });
  }
}