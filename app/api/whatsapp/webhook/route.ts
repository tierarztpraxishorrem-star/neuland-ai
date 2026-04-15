import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/server/getUserPractice";
import {
  verifyWebhook,
  validateSignature,
  extractMessages,
  markAsRead,
} from "@/lib/server/whatsapp";

/**
 * GET  – Meta webhook verification challenge
 * POST – Incoming messages from Meta
 */

export async function GET(req: NextRequest) {
  const verification = verifyWebhook(req.nextUrl.searchParams);
  if (verification) return verification;
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Validate signature
  const signature = req.headers.get("x-hub-signature-256");
  const valid = await validateSignature(rawBody, signature);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const payload = JSON.parse(rawBody);
  const incoming = extractMessages(payload);

  if (incoming.length === 0) {
    // Status updates etc. – acknowledge
    return NextResponse.json({ ok: true });
  }

  const supabase = getServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  // Determine which practice owns this WhatsApp number.
  // For single-practice setups we pick the first practice. For multi-practice,
  // a mapping table would be needed – keeping it simple for now.
  const { data: practice } = await supabase
    .from("practices")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!practice) {
    return NextResponse.json({ error: "No practice" }, { status: 500 });
  }

  const practiceId = practice.id;

  for (const msg of incoming) {
    // 1️⃣ Upsert contact
    const { data: contact } = await supabase
      .from("whatsapp_contacts")
      .upsert(
        {
          practice_id: practiceId,
          wa_id: msg.from,
          phone: `+${msg.from}`,
          display_name: msg.profileName || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "practice_id,wa_id" }
      )
      .select("id")
      .single();

    if (!contact) continue;

    // 2️⃣ Get or create conversation
    let { data: conv } = await supabase
      .from("whatsapp_conversations")
      .select("id, unread_count")
      .eq("contact_id", contact.id)
      .in("status", ["open", "waiting"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv) {
      const { data: newConv } = await supabase
        .from("whatsapp_conversations")
        .insert({
          practice_id: practiceId,
          contact_id: contact.id,
          status: "open",
          last_message_at: new Date().toISOString(),
          last_message_preview: (msg.body || "").slice(0, 100),
          unread_count: 1,
        })
        .select("id, unread_count")
        .single();
      conv = newConv;
    } else {
      await supabase
        .from("whatsapp_conversations")
        .update({
          status: "open",
          last_message_at: new Date().toISOString(),
          last_message_preview: (msg.body || "").slice(0, 100),
          unread_count: (conv.unread_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conv.id);
    }

    if (!conv) continue;

    // 3️⃣ Store message (dedup by wa_message_id)
    await supabase.from("whatsapp_messages").upsert(
      {
        conversation_id: conv.id,
        practice_id: practiceId,
        direction: "inbound",
        wa_message_id: msg.messageId,
        body: msg.body || null,
        media_type: msg.type !== "text" ? msg.type : null,
        status: "received",
        created_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
      },
      { onConflict: "wa_message_id" }
    );

    // 4️⃣ Mark as read on WhatsApp side
    markAsRead(msg.messageId).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
