import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";
import { postMessage, addReaction, isSlackConfigured } from "@/lib/server/slack";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/slack/send
 * Send a message to a Slack channel (optionally in a thread).
 * Body: { channel_id, text, thread_ts? }
 *
 * POST /api/slack/send  (action: "react")
 * Body: { channel_id, timestamp, emoji }
 */
export async function POST(req: NextRequest) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;

  if (!isSlackConfigured()) {
    return NextResponse.json(
      { error: "Slack ist noch nicht konfiguriert." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;

  try {
    if (action === "react") {
      // Add emoji reaction
      const { channel_id, timestamp, emoji } = body;
      if (!channel_id || !timestamp || !emoji) {
        return NextResponse.json(
          { error: "channel_id, timestamp und emoji sind erforderlich." },
          { status: 400 }
        );
      }
      await addReaction(channel_id, timestamp, emoji);
      return NextResponse.json({ ok: true });
    }

    // Default: send message
    const { channel_id, text, thread_ts } = body;
    if (!channel_id || !text?.trim()) {
      return NextResponse.json(
        { error: "channel_id und text sind erforderlich." },
        { status: 400 }
      );
    }

    // Resolve sender display name from logged-in user
    let senderName: string | undefined;
    try {
      const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (token) {
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        );
        const { data: { user } } = await sb.auth.getUser(token);
        const meta = user?.user_metadata || {};
        senderName = meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(" ") || user?.email || undefined;
      }
    } catch {
      // ignore — will send as bot
    }

    const result = await postMessage(channel_id, text.trim(), thread_ts, senderName);
    return NextResponse.json({
      ok: true,
      ts: result.ts,
      channel: result.channel,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Slack-Fehler" },
      { status: 500 }
    );
  }
}
