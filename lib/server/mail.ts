// Microsoft Graph Mail Client – Lesen + Versenden über ein geteiltes Postfach.
// Nutzt Client-Credentials-Flow via msGraph.ts.
// Docs: https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview

import { graphFetch, graphJson, MsGraphError } from './msGraph';

export { MsGraphError as MailError };

export type MailAddress = {
  name?: string;
  address: string;
};

export type MailMessage = {
  id: string;
  conversationId?: string;
  subject: string;
  bodyPreview: string;
  from?: MailAddress;
  toRecipients: MailAddress[];
  ccRecipients?: MailAddress[];
  receivedDateTime: string;
  sentDateTime?: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance?: 'low' | 'normal' | 'high';
  webLink?: string;
};

export type MailMessageFull = MailMessage & {
  bodyContentType: 'text' | 'html';
  body: string;
  bccRecipients?: MailAddress[];
  replyTo?: MailAddress[];
};

export type MailAttachment = {
  id: string;
  name: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
};

export type MailFolder = 'inbox' | 'sentitems' | 'drafts' | 'archive' | 'deleteditems';

type GraphRecipient = {
  emailAddress?: { name?: string; address?: string };
};
type GraphMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  replyTo?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  importance?: string;
  webLink?: string;
  body?: { contentType?: string; content?: string };
};

function getMailbox(): string {
  const mailbox = process.env.MICROSOFT_MAILBOX_EMAIL;
  if (!mailbox) {
    throw new MsGraphError('MICROSOFT_MAILBOX_EMAIL ist nicht gesetzt.');
  }
  return mailbox;
}

function normalizeAddress(r?: GraphRecipient): MailAddress | undefined {
  if (!r?.emailAddress?.address) return undefined;
  return { name: r.emailAddress.name, address: r.emailAddress.address };
}

function normalizeAddresses(list?: GraphRecipient[]): MailAddress[] {
  return (list || [])
    .map((r) => normalizeAddress(r))
    .filter((a): a is MailAddress => Boolean(a));
}

function toSummary(m: GraphMessage): MailMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    subject: m.subject || '(Kein Betreff)',
    bodyPreview: m.bodyPreview || '',
    from: normalizeAddress(m.from),
    toRecipients: normalizeAddresses(m.toRecipients),
    ccRecipients: normalizeAddresses(m.ccRecipients),
    receivedDateTime: m.receivedDateTime || m.sentDateTime || new Date().toISOString(),
    sentDateTime: m.sentDateTime,
    isRead: Boolean(m.isRead),
    hasAttachments: Boolean(m.hasAttachments),
    importance: (['low', 'normal', 'high'] as const).find((v) => v === m.importance) || 'normal',
    webLink: m.webLink,
  };
}

function toFull(m: GraphMessage): MailMessageFull {
  const base = toSummary(m);
  return {
    ...base,
    bodyContentType: m.body?.contentType === 'html' ? 'html' : 'text',
    body: m.body?.content || '',
    bccRecipients: normalizeAddresses(m.bccRecipients),
    replyTo: normalizeAddresses(m.replyTo),
  };
}

function folderPath(folder: MailFolder | null | undefined): string {
  if (!folder || folder === 'inbox') return 'inbox';
  return folder;
}

function buildUserPath(segment: string): string {
  const mailbox = encodeURIComponent(getMailbox());
  return `/users/${mailbox}${segment}`;
}

export async function listMessages(options?: {
  folder?: MailFolder;
  unreadOnly?: boolean;
  limit?: number;
  search?: string;
}): Promise<MailMessage[]> {
  const folder = folderPath(options?.folder);
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);

  const params: string[] = [];
  params.push(`$top=${limit}`);
  params.push(
    `$select=${encodeURIComponent(
      'id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,importance,webLink'
    )}`
  );
  if (options?.search?.trim()) {
    // $search disables $orderby on Graph; handle separately
    params.push(`$search=${encodeURIComponent('"' + options.search.trim().replace(/"/g, '\\"') + '"')}`);
  } else {
    params.push(`$orderby=${encodeURIComponent('receivedDateTime desc')}`);
  }
  if (options?.unreadOnly) {
    params.push(`$filter=${encodeURIComponent('isRead eq false')}`);
  }

  const path = buildUserPath(`/mailFolders/${encodeURIComponent(folder)}/messages?${params.join('&')}`);
  const data = await graphJson<{ value: GraphMessage[] }>(path, {
    headers: options?.search ? { ConsistencyLevel: 'eventual' } : undefined,
  });
  return (data.value || []).map(toSummary);
}

export async function getUnreadCount(): Promise<number> {
  const path = buildUserPath(`/mailFolders/inbox?$select=unreadItemCount`);
  const data = await graphJson<{ unreadItemCount?: number }>(path);
  return data.unreadItemCount || 0;
}

export async function getMessage(messageId: string): Promise<MailMessageFull> {
  if (!messageId) throw new MsGraphError('Nachrichten-ID fehlt.');
  const path = buildUserPath(`/messages/${encodeURIComponent(messageId)}`);
  const data = await graphJson<GraphMessage>(path);
  return toFull(data);
}

export async function markRead(messageId: string, isRead = true): Promise<void> {
  if (!messageId) throw new MsGraphError('Nachrichten-ID fehlt.');
  const path = buildUserPath(`/messages/${encodeURIComponent(messageId)}`);
  const res = await graphFetch(path, {
    method: 'PATCH',
    body: JSON.stringify({ isRead }),
  });
  if (!res.ok) {
    let message = `Status konnte nicht geändert werden (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = `Graph: ${body.error.message}`;
    } catch {}
    throw new MsGraphError(message, res.status);
  }
}

export async function listAttachments(messageId: string): Promise<MailAttachment[]> {
  if (!messageId) throw new MsGraphError('Nachrichten-ID fehlt.');
  const path = buildUserPath(
    `/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`
  );
  const data = await graphJson<{
    value: Array<MailAttachment & { '@odata.type'?: string }>;
  }>(path);
  return (data.value || []).map(({ id, name, contentType, size, isInline }) => ({
    id,
    name: name || 'Anhang',
    contentType,
    size,
    isInline,
  }));
}

export async function getAttachmentContent(
  messageId: string,
  attachmentId: string
): Promise<{ contentType: string; buffer: Buffer; name: string }> {
  if (!messageId || !attachmentId) {
    throw new MsGraphError('Nachrichten-ID oder Anhangs-ID fehlt.');
  }
  const path = buildUserPath(
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
  const data = await graphJson<{
    '@odata.type'?: string;
    name?: string;
    contentType?: string;
    contentBytes?: string;
  }>(path);

  if (!data.contentBytes) {
    throw new MsGraphError('Anhang enthält keine Daten (nur FileAttachment unterstützt).');
  }
  const buffer = Buffer.from(data.contentBytes, 'base64');
  return {
    contentType: data.contentType || 'application/octet-stream',
    buffer,
    name: data.name || 'Anhang',
  };
}

export type SendMailInput = {
  to: string[] | MailAddress[];
  cc?: string[] | MailAddress[];
  bcc?: string[] | MailAddress[];
  subject: string;
  body: string;
  isHtml?: boolean;
  saveToSentItems?: boolean;
};

function toRecipientArray(list?: string[] | MailAddress[]): Array<{ emailAddress: { address: string; name?: string } }> {
  if (!list) return [];
  return list.map((item) => {
    if (typeof item === 'string') {
      return { emailAddress: { address: item.trim() } };
    }
    return { emailAddress: { address: item.address, name: item.name } };
  }).filter((r) => r.emailAddress.address);
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const to = toRecipientArray(input.to);
  if (to.length === 0) throw new MsGraphError('Mindestens ein Empfänger ist erforderlich.');
  if (!input.subject?.trim()) throw new MsGraphError('Betreff ist erforderlich.');
  if (!input.body?.trim()) throw new MsGraphError('Inhalt ist erforderlich.');

  const payload = {
    message: {
      subject: input.subject.trim(),
      body: {
        contentType: input.isHtml ? 'HTML' : 'Text',
        content: input.body,
      },
      toRecipients: to,
      ccRecipients: toRecipientArray(input.cc),
      bccRecipients: toRecipientArray(input.bcc),
    },
    saveToSentItems: input.saveToSentItems !== false,
  };

  const path = buildUserPath('/sendMail');
  const res = await graphFetch(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 202) {
    let message = `Mail-Versand fehlgeschlagen (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = `Graph: ${body.error.message}`;
    } catch {}
    throw new MsGraphError(message, res.status);
  }
}

export type ReplyInput = {
  messageId: string;
  body: string;
  isHtml?: boolean;
  replyAll?: boolean;
  additionalTo?: string[] | MailAddress[];
};

export async function replyToMessage(input: ReplyInput): Promise<void> {
  if (!input.messageId) throw new MsGraphError('Nachrichten-ID fehlt.');
  if (!input.body?.trim()) throw new MsGraphError('Antworttext fehlt.');

  const action = input.replyAll ? 'replyAll' : 'reply';
  const message: Record<string, unknown> = {};
  const additional = toRecipientArray(input.additionalTo);
  if (additional.length > 0) {
    message.toRecipients = additional;
  }
  const payload = {
    comment: input.body,
    message: Object.keys(message).length > 0 ? message : undefined,
  };

  const path = buildUserPath(`/messages/${encodeURIComponent(input.messageId)}/${action}`);
  const res = await graphFetch(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 202) {
    let message = `Antwort konnte nicht gesendet werden (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = `Graph: ${body.error.message}`;
    } catch {}
    throw new MsGraphError(message, res.status);
  }
}
