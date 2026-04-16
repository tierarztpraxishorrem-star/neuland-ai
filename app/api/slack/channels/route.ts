import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";
import {
  listChannels,
  getChannelInfo,
  isSlackConfigured,
} from "@/lib/server/slack";

/**
 * GET /api/slack/channels
 * Returns all non-archived Slack channels.
 */
export async function GET(req: NextRequest) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;

  if (!isSlackConfigured()) {
    return NextResponse.json(
      { error: "Slack ist noch nicht konfiguriert. Bitte SLACK_BOT_TOKEN in den Umgebungsvariablen setzen." },
      { status: 503 }
    );
  }

  try {
    const channels = await listChannels(200);

    // Enrich joined channels with unread counts
    const enriched = await Promise.all(
      channels.map(async (ch) => {
        if (!ch.is_member) return { ...ch, unread_count_display: 0 };
        try {
          const info = await getChannelInfo(ch.id);
          return { ...ch, unread_count_display: info.unread_count_display || 0 };
        } catch {
          return { ...ch, unread_count_display: 0 };
        }
      })
    );

    // Sort: joined first, then by name
    enriched.sort((a, b) => {
      if (a.is_member && !b.is_member) return -1;
      if (!a.is_member && b.is_member) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ channels: enriched });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Slack-Fehler" },
      { status: 500 }
    );
  }
}
