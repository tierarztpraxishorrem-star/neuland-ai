import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";
import OpenAI from "openai";

/**
 * POST /api/whatsapp/suggest
 * Body: { conversation_id }
 * Returns an AI-generated reply suggestion based on conversation history.
 */

export async function POST(req: NextRequest) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;
  const { supabase, practiceId } = auth.context;

  const { conversation_id } = (await req.json()) as {
    conversation_id: string;
  };

  if (!conversation_id) {
    return NextResponse.json(
      { error: "conversation_id erforderlich." },
      { status: 400 }
    );
  }

  // Load conversation + contact
  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("id, contact:whatsapp_contacts!contact_id(display_name, phone)")
    .eq("id", conversation_id)
    .eq("practice_id", practiceId)
    .single();

  if (!conv) {
    return NextResponse.json(
      { error: "Konversation nicht gefunden." },
      { status: 404 }
    );
  }

  // Load last 20 messages for context
  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("direction, body, created_at")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true })
    .limit(20);

  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "Keine Nachrichten vorhanden." },
      { status: 400 }
    );
  }

  // Build prompt
  const contact = conv.contact as { display_name?: string; phone?: string } | null;
  const contactName = contact?.display_name || contact?.phone || "Kontakt";

  const chatHistory = messages
    .map((m: { direction: string; body: string | null }) => {
      const role = m.direction === "inbound" ? contactName : "Praxis";
      return `${role}: ${m.body || "[Medien]"}`;
    })
    .join("\n");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: `Du bist ein freundlicher Assistent einer Tierarztpraxis. Du hilfst beim Verfassen von WhatsApp-Antworten an Tierbesitzer.

Regeln:
- Schreibe auf Deutsch, freundlich und professionell
- Halte die Antwort kurz und klar (WhatsApp-Stil)
- Verwende Sie-Form
- Gib keine medizinischen Diagnosen
- Bei Notfällen: sofort in die Praxis kommen empfehlen
- Beantworte auf Basis des bisherigen Gesprächsverlaufs`,
      },
      {
        role: "user",
        content: `Bisheriger Gesprächsverlauf mit ${contactName}:\n\n${chatHistory}\n\nVerfasse eine passende Antwort der Praxis:`,
      },
    ],
  });

  const suggestion =
    completion.choices[0]?.message?.content?.trim() || "";

  return NextResponse.json({ suggestion });
}
