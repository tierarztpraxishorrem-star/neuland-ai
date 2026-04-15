/**
 * WhatsApp Business Cloud API helpers.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const GRAPH_API = "https://graph.facebook.com/v21.0";

function getConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token || !phoneNumberId) {
    throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set");
  }
  return { token, phoneNumberId, verifyToken: verifyToken || "" };
}

/** Send a text message */
export async function sendTextMessage(to: string, body: string) {
  const { token, phoneNumberId } = getConfig();
  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `WhatsApp API error: ${data.error?.message || JSON.stringify(data)}`
    );
  }
  return data as { messages: { id: string }[] };
}

/** Mark a message as read */
export async function markAsRead(messageId: string) {
  const { token, phoneNumberId } = getConfig();
  await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
}

/** Download media by ID */
export async function getMediaUrl(mediaId: string): Promise<string> {
  const { token } = getConfig();
  const res = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.url as string;
}

/** Verify webhook challenge (GET) */
export function verifyWebhook(searchParams: URLSearchParams): Response | null {
  const { verifyToken } = getConfig();
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return null;
}

/** Validate webhook signature (X-Hub-Signature-256) */
export async function validateSignature(
  body: string,
  signature: string | null
): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true; // skip if not configured
  if (!signature) return false;

  const expected = signature.replace("sha256=", "");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === expected;
}

/** Extract incoming messages from webhook payload */
export type IncomingMessage = {
  from: string;          // sender wa_id
  messageId: string;
  timestamp: string;
  type: string;          // text, image, document, audio, video
  body?: string;
  mediaId?: string;
  profileName?: string;
};

export function extractMessages(payload: Record<string, unknown>): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  const entry = (payload.entry as Array<Record<string, unknown>>) || [];

  for (const e of entry) {
    const changes = (e.changes as Array<Record<string, unknown>>) || [];
    for (const change of changes) {
      const value = change.value as Record<string, unknown>;
      if (!value) continue;

      const contacts = (value.contacts as Array<{ wa_id: string; profile?: { name?: string } }>) || [];
      const contactMap: Record<string, string> = {};
      for (const c of contacts) {
        contactMap[c.wa_id] = c.profile?.name || "";
      }

      const msgs = (value.messages as Array<Record<string, unknown>>) || [];
      for (const m of msgs) {
        const from = m.from as string;
        const msg: IncomingMessage = {
          from,
          messageId: m.id as string,
          timestamp: m.timestamp as string,
          type: m.type as string,
          profileName: contactMap[from] || undefined,
        };

        if (m.type === "text") {
          msg.body = (m.text as { body: string })?.body;
        } else if (["image", "audio", "video", "document"].includes(m.type as string)) {
          const media = m[m.type as string] as { id: string; caption?: string } | undefined;
          msg.mediaId = media?.id;
          msg.body = media?.caption;
        }

        messages.push(msg);
      }
    }
  }
  return messages;
}
