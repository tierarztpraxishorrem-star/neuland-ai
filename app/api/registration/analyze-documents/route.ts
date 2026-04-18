import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { images } = body as { images: { name: string; dataUrl: string }[] };

    if (!images?.length) {
      return NextResponse.json({ error: 'Keine Bilder zur Analyse.' }, { status: 400 });
    }

    // Max 5 images for analysis to keep costs reasonable
    const toAnalyze = images.slice(0, 5);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const imageContent: OpenAI.Responses.ResponseInputContent[] = toAnalyze.map((img) => ({
      type: 'input_image' as const,
      image_url: img.dataUrl,
      detail: 'low' as const,
    }));

    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: `Du bist ein veterinärmedizinischer Assistent. Analysiere die hochgeladenen Vorbefunde/Dokumente eines Tierbesitzers.

Erstelle eine kurze, strukturierte Zusammenfassung:
- Dokumenttyp (Blutbild, Röntgen, OP-Bericht, Impfpass, Rechnung, etc.)
- Relevante Befunde/Diagnosen falls erkennbar
- Auffälligkeiten die der Tierarzt beachten sollte

WICHTIG: Weise am Ende IMMER darauf hin:
"Hinweis: Diese KI-Vorbewertung dient nur zur Orientierung. Der behandelnde Tierarzt wird alle Unterlagen persönlich sichten und bewerten."

Antworte auf Deutsch. Sei knapp aber informativ.`,
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: `Bitte analysiere diese ${toAnalyze.length} Vorbefund(e): ${toAnalyze.map((i) => i.name).join(', ')}` },
            ...imageContent,
          ],
        },
      ],
      max_output_tokens: 800,
    });

    const text = response.output
      .filter((o): o is OpenAI.Responses.ResponseOutputMessage => o.type === 'message')
      .flatMap((m) => m.content)
      .filter((c): c is OpenAI.Responses.ResponseOutputText => c.type === 'output_text')
      .map((c) => c.text)
      .join('\n');

    return NextResponse.json({ ok: true, analysis: text || 'Keine Analyse möglich.' });
  } catch (err) {
    console.error('[registration/analyze-documents]', err);
    return NextResponse.json({ error: 'Fehler bei der Analyse.' }, { status: 500 });
  }
}
