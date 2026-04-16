/**
 * Slack Web API helpers using Bot Token.
 * Requires SLACK_BOT_TOKEN env var (xoxb-…).
 */

const SLACK_API = "https://slack.com/api";

function getToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN ist nicht konfiguriert.");
  return token;
}

async function slackApi<T = Record<string, unknown>>(
  method: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T & { ok: boolean; error?: string }> {
  const token = getToken();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const res = await fetch(`${SLACK_API}/${method}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Slack API ${method}: HTTP ${res.status}`);
  return res.json() as Promise<T & { ok: boolean; error?: string }>;
}

async function slackPost<T = Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>
): Promise<T & { ok: boolean; error?: string }> {
  const token = getToken();
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Slack API ${method}: HTTP ${res.status}`);
  return res.json() as Promise<T & { ok: boolean; error?: string }>;
}

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type SlackChannel = {
  id: string;
  name: string;
  topic: { value: string };
  purpose: { value: string };
  num_members: number;
  is_member: boolean;
  is_private: boolean;
  is_archived: boolean;
  unread_count?: number;
  unread_count_display?: number;
  latest?: { ts: string; text: string; user?: string };
};

export type SlackMessage = {
  ts: string;
  user?: string;
  bot_id?: string;
  text: string;
  thread_ts?: string;
  reply_count?: number;
  files?: { id: string; name: string; url_private: string; mimetype: string; thumb_360?: string }[];
  reactions?: { name: string; count: number; users: string[] }[];
};

export type SlackUser = {
  id: string;
  name: string;
  real_name: string;
  profile: {
    display_name: string;
    image_48: string;
    image_72: string;
  };
  is_bot: boolean;
};

// ------------------------------------------------------------------
// Channel operations
// ------------------------------------------------------------------

type ChannelsListResponse = {
  channels: SlackChannel[];
  response_metadata?: { next_cursor?: string };
};

export async function listChannels(limit = 100): Promise<SlackChannel[]> {
  const data = await slackApi<ChannelsListResponse>("conversations.list", {
    types: "public_channel,private_channel",
    exclude_archived: true,
    limit,
  });
  if (!data.ok) throw new Error(`Slack conversations.list: ${data.error}`);
  return data.channels || [];
}

type ChannelInfoResponse = {
  channel: SlackChannel;
};

export async function getChannelInfo(channelId: string): Promise<SlackChannel> {
  const data = await slackApi<ChannelInfoResponse>("conversations.info", {
    channel: channelId,
    include_num_members: true,
  });
  if (!data.ok) throw new Error(`Slack conversations.info: ${data.error}`);
  return data.channel;
}

// ------------------------------------------------------------------
// Messages
// ------------------------------------------------------------------

type HistoryResponse = {
  messages: SlackMessage[];
  has_more: boolean;
  response_metadata?: { next_cursor?: string };
};

export async function joinChannel(channelId: string): Promise<void> {
  const data = await slackPost("conversations.join", { channel: channelId });
  if (!data.ok && data.error !== "already_in_channel") {
    throw new Error(`Slack conversations.join: ${data.error}`);
  }
}

export async function getChannelHistory(
  channelId: string,
  limit = 50,
  oldest?: string,
  latest?: string
): Promise<{ messages: SlackMessage[]; hasMore: boolean }> {
  let data = await slackApi<HistoryResponse>("conversations.history", {
    channel: channelId,
    limit,
    oldest,
    latest,
  });
  // Auto-join if bot is not in channel
  if (!data.ok && data.error === "not_in_channel") {
    await joinChannel(channelId);
    data = await slackApi<HistoryResponse>("conversations.history", {
      channel: channelId,
      limit,
      oldest,
      latest,
    });
  }
  if (!data.ok) throw new Error(`Slack conversations.history: ${data.error}`);
  return { messages: data.messages || [], hasMore: data.has_more || false };
}

type RepliesResponse = {
  messages: SlackMessage[];
  has_more: boolean;
};

export async function getThreadReplies(
  channelId: string,
  threadTs: string,
  limit = 50
): Promise<SlackMessage[]> {
  let data = await slackApi<RepliesResponse>("conversations.replies", {
    channel: channelId,
    ts: threadTs,
    limit,
  });
  if (!data.ok && data.error === "not_in_channel") {
    await joinChannel(channelId);
    data = await slackApi<RepliesResponse>("conversations.replies", {
      channel: channelId,
      ts: threadTs,
      limit,
    });
  }
  if (!data.ok) throw new Error(`Slack conversations.replies: ${data.error}`);
  return data.messages || [];
}

type PostMessageResponse = {
  ts: string;
  channel: string;
  message: SlackMessage;
};

export async function postMessage(
  channelId: string,
  text: string,
  threadTs?: string,
  senderName?: string
): Promise<PostMessageResponse> {
  const body: Record<string, unknown> = { channel: channelId, text };
  if (threadTs) body.thread_ts = threadTs;
  if (senderName) {
    body.username = `${senderName} (Neuland AI)`;
    body.icon_emoji = ":stethoscope:";
  }
  const data = await slackPost<PostMessageResponse>("chat.postMessage", body);
  if (!data.ok) throw new Error(`Slack chat.postMessage: ${data.error}`);
  return data;
}

// ------------------------------------------------------------------
// Reactions
// ------------------------------------------------------------------

export async function addReaction(
  channelId: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  const data = await slackPost("reactions.add", {
    channel: channelId,
    timestamp,
    name: emoji,
  });
  if (!data.ok && data.error !== "already_reacted") {
    throw new Error(`Slack reactions.add: ${data.error}`);
  }
}

// ------------------------------------------------------------------
// Users
// ------------------------------------------------------------------

type UsersListResponse = {
  members: SlackUser[];
};

const userCache = new Map<string, SlackUser>();

export async function listUsers(): Promise<SlackUser[]> {
  const data = await slackApi<UsersListResponse>("users.list", { limit: 200 });
  if (!data.ok) throw new Error(`Slack users.list: ${data.error}`);
  const members = data.members || [];
  for (const u of members) userCache.set(u.id, u);
  return members;
}

export async function getUser(userId: string): Promise<SlackUser | null> {
  if (userCache.has(userId)) return userCache.get(userId)!;
  const data = await slackApi<{ user: SlackUser }>("users.info", { user: userId });
  if (!data.ok) return null;
  userCache.set(userId, data.user);
  return data.user;
}

// ------------------------------------------------------------------
// Unread counts
// ------------------------------------------------------------------

export async function getUnreadCounts(): Promise<number> {
  // Sum unread_count_display across all joined channels
  try {
    const channels = await listChannels(200);
    // conversations.list doesn't return unread counts directly,
    // we need conversations.info per channel that is_member
    let total = 0;
    const joined = channels.filter((c) => c.is_member);
    // Batch up to 20 channels to avoid rate limits
    const batch = joined.slice(0, 20);
    await Promise.all(
      batch.map(async (ch) => {
        try {
          const info = await getChannelInfo(ch.id);
          total += info.unread_count_display || 0;
        } catch {
          // ignore individual failures
        }
      })
    );
    return total;
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------------
// Mark as read
// ------------------------------------------------------------------

export async function markAsRead(channelId: string, ts: string): Promise<void> {
  const data = await slackPost("conversations.mark", {
    channel: channelId,
    ts,
  });
  if (!data.ok) {
    // not_in_channel is expected if bot isn't joined
    if (data.error !== "not_in_channel") {
      throw new Error(`Slack conversations.mark: ${data.error}`);
    }
  }
}

// ------------------------------------------------------------------
// Check if configured
// ------------------------------------------------------------------

export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_BOT_TOKEN;
}
