import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/server/getUserPractice";
import {
  verifyWebhook,
  validateSignature,
  extractMessages,
  markAsRead,
  getMediaInfo,
  downloadMedia,
} from "@/lib/server/whatsapp";
import { uploadWhatsAppMedia } from "@/lib/server/r2Upload";

/**
 * GET  – Meta webhook verification challenge
 * POST – Incoming messages from Meta
 */

export async function GET(req: NextRequest) {
  try {
    const verification = verifyWebhook(req.nextUrl.searchParams);
    if (verification) return verification;
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  } catch (error) {
    console.error("[api/whatsapp/webhook GET] Fehler:", error);
    return NextResponse.json(
      { error: "Verifizierung fehlgeschlagen" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
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
    const { data: storedMsg } = await supabase.from("whatsapp_messages").upsert(
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
    ).select("id").single();

    // 4️⃣ If media message, download and store in R2
    if (msg.mediaId && storedMsg && ["image", "video", "audio", "document"].includes(msg.type)) {
      processMedia(supabase, {
        mediaId: msg.mediaId,
        messageId: storedMsg.id,
        conversationId: conv.id,
        practiceId,
        mediaType: msg.type,
        mimeType: msg.mimeType,
      }).catch((err) => console.error("Media processing failed:", err));
    }

    // 5️⃣ Mark as read on WhatsApp side
    markAsRead(msg.messageId).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/whatsapp/webhook POST] Fehler:", error);
    return NextResponse.json(
      { error: "Webhook-Verarbeitung fehlgeschlagen" },
      { status: 500 }
    );
  }
}

// ─── Media processing (runs async) ──────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

type MediaTask = {
  mediaId: string;
  messageId: string;
  conversationId: string;
  practiceId: string;
  mediaType: string;
  mimeType?: string;
};

async function processMedia(supabase: SupabaseClient, task: MediaTask) {
  // 1. Get media URL from Meta
  const info = await getMediaInfo(task.mediaId);
  const mime = task.mimeType || info.mime_type;

  // 2. Download binary
  const { buffer, contentType } = await downloadMedia(info.url);

  // 3. Upload to R2
  const { key, url } = await uploadWhatsAppMedia(
    task.practiceId,
    task.conversationId,
    task.messageId,
    buffer,
    contentType
  );

  // 4. Update message with media URL
  await supabase
    .from("whatsapp_messages")
    .update({ media_url: url })
    .eq("id", task.messageId);

  // 5. Create whatsapp_media record
  const { data: mediaRow } = await supabase
    .from("whatsapp_media")
    .insert({
      message_id: task.messageId,
      practice_id: task.practiceId,
      conversation_id: task.conversationId,
      media_type: task.mediaType,
      mime_type: mime,
      file_size: info.file_size || buffer.byteLength,
      storage_url: url,
      storage_key: key,
    })
    .select("id")
    .single();

  // 6. If it's an image, run AI analysis
  if (task.mediaType === "image" && mediaRow) {
    analyzeImageAsync(supabase, mediaRow.id, url, task.practiceId).catch(
      (err) => console.error("Image analysis failed:", err)
    );
  }
}

async function analyzeImageAsync(
  supabase: SupabaseClient,
  mediaId: string,
  imageUrl: string,
  practiceId: string
) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: `Du bist ein KI-Assistent für eine Tierarztpraxis. Analysiere das Bild und gib eine strukturierte Einschätzung.
Antworte als JSON:
{
  "description": "Kurze Beschreibung was auf dem Bild zu sehen ist",
  "animal_type": "Tierart falls erkennbar (Hund, Katze, etc.) oder null",
  "body_part": "Betroffene Körperstelle falls erkennbar oder null",
  "condition": "Mögliche Befunde/Auffälligkeiten falls erkennbar oder null",
  "urgency": "niedrig|mittel|hoch|unbekannt",
  "recommendation": "Empfehlung für das Praxisteam"
}
Wenn das Bild kein Tier oder keine medizinische Relevanz zeigt, gib das entsprechend an.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "high" },
            },
            {
              type: "text",
              text: "Bitte analysiere dieses Bild aus einer WhatsApp-Nachricht eines Tierbesitzers.",
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error("OpenAI vision API failed:", res.status);
    return;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  // Try to parse JSON from response
  let analysis = content;
  let animalType: string | null = null;
  let bodyPart: string | null = null;
  let condition: string | null = null;

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      analysis = parsed.description || content;
      animalType = parsed.animal_type || null;
      bodyPart = parsed.body_part || null;
      condition = parsed.condition || null;

      // Build readable analysis text
      const parts = [parsed.description];
      if (parsed.condition) parts.push(`Befund: ${parsed.condition}`);
      if (parsed.urgency && parsed.urgency !== "unbekannt") parts.push(`Dringlichkeit: ${parsed.urgency}`);
      if (parsed.recommendation) parts.push(`Empfehlung: ${parsed.recommendation}`);
      analysis = parts.join("\n");
    }
  } catch {
    // use raw content as analysis
  }

  await supabase
    .from("whatsapp_media")
    .update({
      ai_analysis: analysis,
      ai_animal_type: animalType,
      ai_body_part: bodyPart,
      ai_condition: condition,
    })
    .eq("id", mediaId);

  // Try to match patient by animal type + contact phone
  if (animalType) {
    const { data: mediaRecord } = await supabase
      .from("whatsapp_media")
      .select("conversation_id")
      .eq("id", mediaId)
      .single();

    if (mediaRecord) {
      const { data: convRecord } = await supabase
        .from("whatsapp_conversations")
        .select("contact_id")
        .eq("id", mediaRecord.conversation_id)
        .single();

      if (convRecord) {
        const { data: contactRecord } = await supabase
          .from("whatsapp_contacts")
          .select("phone, display_name")
          .eq("id", convRecord.contact_id)
          .single();

        if (contactRecord) {
          // Search patients by owner name or phone match
          const ownerName = contactRecord.display_name;
          let matchedPatient = null;

          if (ownerName) {
            const { data: patients } = await supabase
              .from("patients")
              .select("id, name, tierart, owner_name")
              .eq("practice_id", practiceId)
              .ilike("owner_name", `%${ownerName}%`)
              .limit(5);

            if (patients && patients.length > 0) {
              // Prefer exact animal type match
              const typeMatch = patients.find(
                (p: { tierart: string | null }) =>
                  p.tierart?.toLowerCase() === animalType?.toLowerCase()
              );
              matchedPatient = typeMatch || patients[0];
            }
          }

          if (matchedPatient) {
            await supabase
              .from("whatsapp_media")
              .update({ patient_id: matchedPatient.id })
              .eq("id", mediaId);
          }
        }
      }
    }
  }
}
