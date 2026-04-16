import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";
import { getUnreadCounts as getSlackUnread, isSlackConfigured } from "@/lib/server/slack";
import { getUnreadCount as getMailUnread } from "@/lib/server/mail";
import { isMsGraphConfigured } from "@/lib/server/msGraph";

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

  // Mail unread count (nur wenn Microsoft Graph konfiguriert ist)
  let mail = 0;
  if (isMsGraphConfigured() && process.env.MICROSOFT_MAILBOX_EMAIL) {
    try {
      mail = await getMailUnread();
    } catch {
      // ignore — Graph kann zeitweise 429/5xx liefern, nicht blockieren
    }
  }

  return NextResponse.json({
    whatsapp,
    slack,
    mail,
    total: whatsapp + slack + mail,
  });
}
