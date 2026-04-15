import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";
import { getOrCreateEmployee } from "@/lib/server/hrUtils";
import { sendTextMessage } from "@/lib/server/whatsapp";

/**
 * POST /api/whatsapp/send
 * Body: { conversation_id, body, ai_suggested?, ai_suggestion_original? }
 * Sends a WhatsApp message and logs who sent it.
 */
export async function POST(req: NextRequest) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;
  const { supabase, practiceId, userId } = auth.context;

  const json = await req.json();
  const { conversation_id, body } = json as {
    conversation_id: string;
    body: string;
  };

  if (!conversation_id || !body?.trim()) {
    return NextResponse.json(
      { error: "conversation_id und body erforderlich." },
      { status: 400 }
    );
  }

  // Resolve conversation + contact wa_id
  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("id, contact_id, practice_id")
    .eq("id", conversation_id)
    .eq("practice_id", practiceId)
    .single();

  if (!conv) {
    return NextResponse.json(
      { error: "Konversation nicht gefunden." },
      { status: 404 }
    );
  }

  const { data: contact } = await supabase
    .from("whatsapp_contacts")
    .select("wa_id")
    .eq("id", conv.contact_id)
    .single();

  if (!contact) {
    return NextResponse.json(
      { error: "Kontakt nicht gefunden." },
      { status: 404 }
    );
  }

  // Get employee for audit trail
  const employeeResult = await getOrCreateEmployee(supabase, practiceId, userId);
  const employeeId = employeeResult.ok ? employeeResult.employee.id : null;

  // Send via Meta Cloud API
  let waMessageId: string | null = null;
  try {
    const result = await sendTextMessage(contact.wa_id, body.trim());
    waMessageId = result.messages?.[0]?.id || null;
  } catch (err) {
    // Store as failed
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conv.id,
      practice_id: practiceId,
      direction: "outbound",
      body: body.trim(),
      status: "failed",
      sent_by_employee_id: employeeId,
      ai_suggested: json.ai_suggested || false,
      ai_suggestion_original: json.ai_suggestion_original || null,
      error_detail: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      { error: "Nachricht konnte nicht gesendet werden.", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  // Store outbound message
  const { data: message } = await supabase
    .from("whatsapp_messages")
    .insert({
      conversation_id: conv.id,
      practice_id: practiceId,
      direction: "outbound",
      wa_message_id: waMessageId,
      body: body.trim(),
      status: "sent",
      sent_by_employee_id: employeeId,
      ai_suggested: json.ai_suggested || false,
      ai_suggestion_original: json.ai_suggestion_original || null,
    })
    .select("id, created_at")
    .single();

  // Update conversation
  await supabase
    .from("whatsapp_conversations")
    .update({
      status: "waiting",
      last_message_at: new Date().toISOString(),
      last_message_preview: body.trim().slice(0, 100),
      unread_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conv.id);

  return NextResponse.json({ message });
}
