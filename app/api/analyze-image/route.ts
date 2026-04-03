import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
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
    return NextResponse.json({ error: "Fehler bei Analyse" }, { status: 500 });
  }
}