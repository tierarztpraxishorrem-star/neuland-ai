// Microsoft Graph Mail Client – Lesen + Versenden über ein geteiltes Postfach.
// Nutzt Client-Credentials-Flow via msGraph.ts.
// Docs: https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview

import { graphFetch, graphJson, MsGraphError } from './msGraph';

export { MsGraphError as MailError };

// Festgelegtes geteiltes Postfach für Neuland AI.
// Empfang UND Versand laufen ausschließlich über diese Adresse.
// Bewusst im Code hart verdrahtet, damit kein anderes Postfach versehentlich per ENV reingeschleust wird.
export const MAILBOX_ADDRESS = 'empfang@tierarztpraxis-horrem.de';

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
  categories: string[];
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
  categories?: string[];
};

function getMailbox(): string {
  return MAILBOX_ADDRESS;
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
    categories: Array.isArray(m.categories) ? m.categories : [],
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
      'id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,importance,webLink,categories'
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

export type MessagePatch = {
  isRead?: boolean;
  categories?: string[];
};

export async function updateMessage(messageId: string, patch: MessagePatch): Promise<void> {
  if (!messageId) throw new MsGraphError('Nachrichten-ID fehlt.');
  const payload: Record<string, unknown> = {};
  if (typeof patch.isRead === 'boolean') payload.isRead = patch.isRead;
  if (Array.isArray(patch.categories)) {
    payload.categories = patch.categories
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((c) => c.trim());
  }
  if (Object.keys(payload).length === 0) return;

  const path = buildUserPath(`/messages/${encodeURIComponent(messageId)}`);
  const res = await graphFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = `Nachricht konnte nicht aktualisiert werden (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = `Graph: ${body.error.message}`;
    } catch {}
    throw new MsGraphError(message, res.status);
  }
}

export async function markRead(messageId: string, isRead = true): Promise<void> {
  return updateMessage(messageId, { isRead });
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

export type OutgoingAttachment = {
  name: string;
  contentType: string;
  contentBytes: string; // base64
};

// Graph erlaubt im /sendMail + /reply Payload FileAttachments bis max. 3 MB pro Anhang
// (größere Anhänge brauchen upload-sessions – noch nicht implementiert).
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type SendMailInput = {
  to: string[] | MailAddress[];
  cc?: string[] | MailAddress[];
  bcc?: string[] | MailAddress[];
  subject: string;
  body: string;
  isHtml?: boolean;
  saveToSentItems?: boolean;
  attachments?: OutgoingAttachment[];
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

function toGraphAttachments(list?: OutgoingAttachment[]) {
  if (!list || list.length === 0) return undefined;
  let total = 0;
  return list.map((a) => {
    if (!a.name || !a.contentBytes) {
      throw new MsGraphError(`Ungültiger Anhang: ${a.name || '(ohne Name)'}`);
    }
    // Base64-Länge grob in Bytes umrechnen (≈ 3/4 der String-Länge)
    const approxBytes = Math.floor((a.contentBytes.length * 3) / 4);
    if (approxBytes > MAX_ATTACHMENT_BYTES) {
      throw new MsGraphError(`Anhang "${a.name}" überschreitet ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
    }
    total += approxBytes;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new MsGraphError(`Gesamtgröße der Anhänge überschreitet ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
    }
    return {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: a.contentBytes,
    };
  });
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const to = toRecipientArray(input.to);
  if (to.length === 0) throw new MsGraphError('Mindestens ein Empfänger ist erforderlich.');
  if (!input.subject?.trim()) throw new MsGraphError('Betreff ist erforderlich.');
  if (!input.body?.trim()) throw new MsGraphError('Inhalt ist erforderlich.');

  const attachments = toGraphAttachments(input.attachments);

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
      attachments,
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
  attachments?: OutgoingAttachment[];
};

export async function replyToMessage(input: ReplyInput): Promise<void> {
  if (!input.messageId) throw new MsGraphError('Nachrichten-ID fehlt.');
  if (!input.body?.trim()) throw new MsGraphError('Antworttext fehlt.');

  const attachments = toGraphAttachments(input.attachments);

  // Bei Anhängen: createReply → attachments hinzufügen → send (mehrstufig).
  // Ohne Anhänge: einfaches /reply mit comment funktioniert einstufig.
  if (attachments && attachments.length > 0) {
    const action = input.replyAll ? 'createReplyAll' : 'createReply';
    const createPath = buildUserPath(`/messages/${encodeURIComponent(input.messageId)}/${action}`);
    const createRes = await graphFetch(createPath, {
      method: 'POST',
      body: JSON.stringify({ comment: input.body }),
    });
    if (!createRes.ok) {
      let message = `Antwortentwurf konnte nicht erstellt werden (${createRes.status}).`;
      try {
        const body = await createRes.json();
        if (body?.error?.message) message = `Graph: ${body.error.message}`;
      } catch {}
      throw new MsGraphError(message, createRes.status);
    }
    const draft = (await createRes.json()) as { id?: string };
    if (!draft.id) throw new MsGraphError('Antwortentwurf ohne ID.');

    for (const att of attachments) {
      const attPath = buildUserPath(`/messages/${encodeURIComponent(draft.id)}/attachments`);
      const attRes = await graphFetch(attPath, {
        method: 'POST',
        body: JSON.stringify(att),
      });
      if (!attRes.ok) {
        let message = `Anhang konnte nicht angehängt werden (${attRes.status}).`;
        try {
          const body = await attRes.json();
          if (body?.error?.message) message = `Graph: ${body.error.message}`;
        } catch {}
        throw new MsGraphError(message, attRes.status);
      }
    }

    const sendPath = buildUserPath(`/messages/${encodeURIComponent(draft.id)}/send`);
    const sendRes = await graphFetch(sendPath, { method: 'POST' });
    if (!sendRes.ok && sendRes.status !== 202) {
      let message = `Antwort konnte nicht gesendet werden (${sendRes.status}).`;
      try {
        const body = await sendRes.json();
        if (body?.error?.message) message = `Graph: ${body.error.message}`;
      } catch {}
      throw new MsGraphError(message, sendRes.status);
    }
    return;
  }

  // Kein Anhang → einstufige /reply Action
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
