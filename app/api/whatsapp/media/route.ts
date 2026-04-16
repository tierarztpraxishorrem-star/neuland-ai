import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";

/**
 * GET /api/whatsapp/media?conversation_id=...
 * Returns all media for a conversation with AI analysis and patient info.
 *
 * PATCH /api/whatsapp/media
 * Body: { media_id, patient_id } – assign media to a patient
 */

export async function GET(req: NextRequest) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;
  const { supabase, practiceId } = auth.context;

  const conversationId = req.nextUrl.searchParams.get("conversation_id");
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("whatsapp_media")
    .select(`
      id, media_type, mime_type, file_size, storage_url, thumbnail_url,
      ai_analysis, ai_animal_type, ai_body_part, ai_condition,
      patient_id, assigned_by, assigned_at, created_at,
      patient:patients!patient_id(id, name, tierart, owner_name),
      message:whatsapp_messages!message_id(id, body, created_at)
    `)
    .eq("conversation_id", conversationId)
    .eq("practice_id", practiceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ media: data || [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;
  const { supabase, practiceId } = auth.context;

  const body = await req.json();
  const { media_id, patient_id } = body;

  if (!media_id) {
    return NextResponse.json({ error: "media_id required" }, { status: 400 });
  }

  // Get employee ID for assignment tracking
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", auth.context.userId)
    .eq("practice_id", practiceId)
    .maybeSingle();

  const { error } = await supabase
    .from("whatsapp_media")
    .update({
      patient_id: patient_id || null,
      assigned_by: employee?.id || null,
      assigned_at: patient_id ? new Date().toISOString() : null,
    })
    .eq("id", media_id)
    .eq("practice_id", practiceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
