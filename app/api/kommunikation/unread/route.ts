import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";
import { getUnreadCounts as getSlackUnread, isSlackConfigured } from "@/lib/server/slack";

/**
 * GET /api/kommunikation/unread
 * Returns aggregated unread message counts for all communication channels.
 */
export async function GET(req: NextRequest) {
  const auth = await getUserPractice(req);
  if (!auth.ok) return auth.response;
  const { supabase, practiceId } = auth.context;

  // WhatsApp unread count
  const { data: waData } = await supabase
    .from("whatsapp_conversations")
    .select("unread_count")
    .eq("practice_id", practiceId)
    .in("status", ["open", "waiting"]);

  const whatsapp = (waData || []).reduce(
    (sum: number, c: { unread_count: number }) => sum + (c.unread_count || 0),
    0
  );

  // Slack unread count
  let slack = 0;
  if (isSlackConfigured()) {
    try {
      slack = await getSlackUnread();
    } catch {
      // ignore — Slack may not be configured yet
    }
  }

  return NextResponse.json({
    whatsapp,
    slack,
    total: whatsapp + slack,
  });
}
