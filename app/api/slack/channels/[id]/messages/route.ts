import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";
import {
  getChannelHistory,
  getChannelInfo,
  getThreadReplies,
  listUsers,
  markAsRead,
  isSlackConfigured,
} from "@/lib/server/slack";

/**
 * GET /api/slack/channels/[id]/messages
 * Returns messages for a Slack channel + channel info + user map.
 * Query params: ?limit=50&oldest=...&latest=...&thread_ts=...
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;

  if (!isSlackConfigured()) {
    return NextResponse.json(
      { error: "Slack ist noch nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { id: channelId } = await params;
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const oldest = url.searchParams.get("oldest") || undefined;
  const latest = url.searchParams.get("latest") || undefined;
  const threadTs = url.searchParams.get("thread_ts") || undefined;

  try {
    // Fetch users for display names
    const users = await listUsers();
    const userMap: Record<string, { name: string; avatar: string }> = {};
    for (const u of users) {
      userMap[u.id] = {
        name: u.profile.display_name || u.real_name || u.name,
        avatar: u.profile.image_48,
      };
    }

    // Get channel info
    const channel = await getChannelInfo(channelId);

    let messages;
    let hasMore = false;

    if (threadTs) {
      // Thread replies
      messages = await getThreadReplies(channelId, threadTs, limit);
    } else {
      // Channel history
      const result = await getChannelHistory(channelId, limit, oldest, latest);
      messages = result.messages;
      hasMore = result.hasMore;
    }

    // Mark channel as read (use latest message ts)
    if (messages.length > 0) {
      const latestTs = messages[0].ts; // messages are newest-first
      markAsRead(channelId, latestTs).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({ channel, messages, userMap, hasMore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Slack-Fehler" },
      { status: 500 }
    );
  }
}
