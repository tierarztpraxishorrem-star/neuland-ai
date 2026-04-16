import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";

/**
 * GET /api/whatsapp/conversations
 *   ?status=open|waiting|resolved|closed  (optional, default: open,waiting)
 *   Returns conversations with contact info.
 *
 * PATCH /api/whatsapp/conversations
 *   Body: { id, status?, assigned_to? }
 *   Update conversation status or assignment.
 */

export async function GET(req: NextRequest) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const statusParam = req.nextUrl.searchParams.get("status");
    const statuses = statusParam
      ? statusParam.split(",")
      : ["open", "waiting"];

    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select(
        `
      id, status, assigned_to, last_message_at, last_message_preview, unread_count, created_at,
      contact:whatsapp_contacts!contact_id(id, wa_id, phone, display_name),
      assignee:employees!assigned_to(id, display_name)
    `
      )
      .eq("practice_id", practiceId)
      .in("status", statuses)
      .order("last_message_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversations: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/whatsapp/conversations] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const json = await req.json();
    const { id, status, assigned_to } = json as {
      id: string;
      status?: string;
      assigned_to?: string | null;
    };

    if (!id) {
      return NextResponse.json({ error: "id erforderlich." }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;

    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .update(updates)
      .eq("id", id)
      .eq("practice_id", practiceId)
      .select("id, status, assigned_to")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversation: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/whatsapp/conversations] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
