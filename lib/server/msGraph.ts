// Shared Microsoft Graph API client – Auth + Fetch + Token-Cache.
// Wird von lib/server/sharepoint.ts und lib/server/mail.ts genutzt.
// Docs: https://learn.microsoft.com/en-us/graph/

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_TTL_MS = 55 * 60 * 1000;

let tokenCache: { token: string; expiresAt: number } | null = null;

export class MsGraphError extends Error {
  status?: number;
  details?: unknown;
  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'MsGraphError';
    this.status = status;
    this.details = details;
  }
}

export function isMsGraphConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_TENANT_ID &&
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET
  );
}

function requireConfig() {
  const tenant = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!tenant || !clientId || !secret) {
    throw new MsGraphError(
      'Microsoft Graph ist nicht konfiguriert (MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET).'
    );
  }
  return { tenant, clientId, secret };
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const { tenant, clientId, secret } = requireConfig();
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: secret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new MsGraphError(`Microsoft-Login fehlgeschlagen (${res.status}).`, res.status, text);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new MsGraphError('Microsoft-Login lieferte kein Token zurück.');
  }

  const ttl = typeof data.expires_in === 'number'
    ? Math.min(data.expires_in * 1000 - 60_000, TOKEN_TTL_MS)
    : TOKEN_TTL_MS;

  tokenCache = { token: data.access_token, expiresAt: Date.now() + ttl };
  return tokenCache.token;
}

export type GraphFetchOptions = RequestInit & {
  retries?: number;
  raw?: boolean; // skip default JSON Content-Type
};

export async function graphFetch(path: string, init?: GraphFetchOptions): Promise<Response> {
  const retries = init?.retries ?? 2;
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;

  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!init?.raw && init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 5;
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
    return graphFetch(path, { ...init, retries: retries - 1 });
  }

  if (res.status === 401 && retries > 0) {
    tokenCache = null;
    await getAccessToken(true);
    return graphFetch(path, { ...init, retries: retries - 1 });
  }

  return res;
}

export async function graphJson<T = unknown>(path: string, init?: GraphFetchOptions): Promise<T> {
  const res = await graphFetch(path, init);
  if (!res.ok) {
    let message = `Microsoft Graph Fehler (${res.status}).`;
    let details: unknown = undefined;
    try {
      const body = await res.json();
      details = body;
      if (body?.error?.message) message = `Graph: ${body.error.message}`;
    } catch {
      try {
        details = await res.text();
      } catch {}
    }
    throw new MsGraphError(message, res.status, details);
  }
  return (await res.json()) as T;
}

// Encodes each path segment but keeps slashes as separators
export function encodeGraphPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}
