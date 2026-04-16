import { NextRequest, NextResponse } from "next/server";
import { getUserPractice } from "@/lib/server/getUserPractice";
import {
  listChannels,
  getChannelHistory,
  listUsers,
  isSlackConfigured,
} from "@/lib/server/slack";

type SearchResult = {
  id: string;
  channelId: string;
  channelName: string;
  userId?: string;
  userName?: string;
  text: string;
  ts: string;
  date: string;
  permalink: string;
};

const HISTORY_PER_CHANNEL = 200;
const MAX_RESULTS = 40;
const WORKSPACE_SUBDOMAIN = "tphorrem";

export async function GET(req: NextRequest) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    if (!isSlackConfigured()) {
      return NextResponse.json(
        { error: "Slack ist nicht konfiguriert." },
        { status: 503 }
      );
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json(
        { error: "Bitte Suchbegriff mit mindestens 2 Zeichen eingeben." },
        { status: 400 }
      );
    }

    const needle = q.toLowerCase();

    const [channels, users] = await Promise.all([listChannels(200), listUsers()]);
    const userMap: Record<string, string> = {};
    for (const u of users) {
      userMap[u.id] = u.profile.display_name || u.real_name || u.name;
    }

    const joined = channels.filter((c) => c.is_member && !c.is_archived);
    const matches: SearchResult[] = [];

    await Promise.all(
      joined.map(async (ch) => {
        try {
          const { messages } = await getChannelHistory(ch.id, HISTORY_PER_CHANNEL);
          for (const m of messages) {
            if (!m.text) continue;
            if (!m.text.toLowerCase().includes(needle)) continue;
            const tsNum = parseFloat(m.ts);
            matches.push({
              id: `${ch.id}-${m.ts}`,
              channelId: ch.id,
              channelName: ch.name,
              userId: m.user,
              userName: m.user ? userMap[m.user] || "unbekannt" : undefined,
              text: m.text,
              ts: m.ts,
              date: new Date(tsNum * 1000).toISOString(),
              permalink: `https://${WORKSPACE_SUBDOMAIN}.slack.com/archives/${ch.id}/p${m.ts.replace(".", "")}`,
            });
          }
        } catch (err) {
          console.warn(`[api/slack/search] Channel ${ch.name} übersprungen:`, err);
        }
      })
    );

    matches.sort((a, b) => (a.ts > b.ts ? -1 : 1));

    return NextResponse.json({
      query: q,
      total: matches.length,
      channelsSearched: joined.length,
      results: matches.slice(0, MAX_RESULTS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    console.error("[api/slack/search] Fehler:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
