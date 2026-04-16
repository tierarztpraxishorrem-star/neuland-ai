import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getMessage, MailError } from '../../../../lib/server/mail';
import { isMsGraphConfigured } from '../../../../lib/server/msGraph';

export const runtime = 'nodejs';

const MAX_BODY_CHARS = 6000;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isMsGraphConfigured()) {
      return NextResponse.json({ error: 'Mail-Modul ist nicht konfiguriert.' }, { status: 503 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI ist nicht konfiguriert.' }, { status: 503 });
    }

    const data = await req.json().catch(() => ({}));
    const messageId = typeof data.messageId === 'string' ? data.messageId : '';
    const tone = typeof data.tone === 'string' ? data.tone : 'freundlich-professionell';
    const extraInstruction = typeof data.instruction === 'string' ? data.instruction.slice(0, 500) : '';

    if (!messageId) {
      return NextResponse.json({ error: 'Nachrichten-ID fehlt.' }, { status: 400 });
    }

    const original = await getMessage(messageId);
    const originalText = (original.bodyContentType === 'html'
      ? stripHtml(original.body)
      : original.body
    ).slice(0, MAX_BODY_CHARS);

    const senderLabel = original.from?.name
      ? `${original.from.name} <${original.from.address}>`
      : original.from?.address || 'Unbekannt';

    const system = `Du bist eine Mitarbeiterin der Tierarztpraxis Horrem. Du formulierst E-Mail-Antworten auf Deutsch, ${tone}, sachlich, kurz und hilfreich. Sprich den Absender direkt an, beantworte konkrete Fragen so gut wie möglich aus dem E-Mail-Inhalt. Keine Floskeln, keine Platzhalter in eckigen Klammern, keine Signatur – die wird automatisch ergänzt.`;

    const userPrompt = [
      `Betreff der Ausgangsmail: ${original.subject}`,
      `Von: ${senderLabel}`,
      ``,
      `Inhalt:`,
      originalText,
      ``,
      extraInstruction ? `Zusätzliche Anweisung: ${extraInstruction}` : '',
      ``,
      `Bitte formuliere einen Antworttext (ohne Betreffzeile, ohne "Hallo"/"Guten Tag" abhängig vom Original vernünftig wählen, ohne Grußformel am Ende).`,
    ]
      .filter(Boolean)
      .join('\n');

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini',
      temperature: 0.4,
      max_tokens: 800,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
    });

    const draft = completion.choices[0]?.message?.content?.trim() || '';
    if (!draft) {
      return NextResponse.json({ error: 'Kein Entwurf generiert.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    if (error instanceof MailError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 500 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/mail/draft-ai] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
