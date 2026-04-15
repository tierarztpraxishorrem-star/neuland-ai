import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";

/**
 * GET /api/whatsapp/conversations/[id]/messages
 *   Returns all messages for a conversation + marks unread → 0.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;
  const { supabase, practiceId } = auth.context;

  const { id: conversationId } = await params;

  // Verify conversation belongs to practice
  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("id, status, assigned_to, contact:whatsapp_contacts!contact_id(id, wa_id, phone, display_name)")
    .eq("id", conversationId)
    .eq("practice_id", practiceId)
    .single();

  if (!conv) {
    return NextResponse.json(
      { error: "Konversation nicht gefunden." },
      { status: 404 }
    );
  }

  // Fetch messages
  const { data: messages, error } = await supabase
    .from("whatsapp_messages")
    .select(
      "id, direction, body, media_url, media_type, status, sent_by_employee_id, ai_suggested, ai_suggestion_original, created_at, sender:employees!sent_by_employee_id(id, display_name)"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reset unread
  await supabase
    .from("whatsapp_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);

  return NextResponse.json({ conversation: conv, messages });
}
