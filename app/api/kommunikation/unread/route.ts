import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";

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

  return NextResponse.json({
    whatsapp,
    total: whatsapp,
  });
}
