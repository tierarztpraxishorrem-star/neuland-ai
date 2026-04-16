// Microsoft Graph API Client für SharePoint
// Auth: Client Credentials Flow (kein User-Login)
// Docs: https://learn.microsoft.com/en-us/graph/

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 min (Token läuft nach 60 min ab)

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'html', 'htm',
  'log', 'yml', 'yaml', 'tsv', 'ini', 'conf',
]);

let tokenCache: { token: string; expiresAt: number } | null = null;

export class SharePointError extends Error {
  status?: number;
  details?: unknown;
  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'SharePointError';
    this.status = status;
    this.details = details;
  }
}

export type SearchResult = {
  id: string;
  driveId?: string;
  itemId?: string;
  name: string;
  url: string;
  summary?: string;
  lastModified?: string;
  fileType: string;
  size?: number;
};

export type DriveItem = {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  parentReference?: { driveId?: string; path?: string };
};

export type SiteInfo = {
  id: string;
  displayName?: string;
  name?: string;
  webUrl?: string;
};

export function isSharePointConfigured(): boolean {
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
    throw new SharePointError(
      'Microsoft Graph ist nicht konfiguriert (MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET).'
    );
  }
  return { tenant, clientId, secret };
}

async function getAccessToken(forceRefresh = false): Promise<string> {
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
    throw new SharePointError(
      `Microsoft-Login fehlgeschlagen (${res.status}).`,
      res.status,
      text
    );
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new SharePointError('Microsoft-Login lieferte kein Token zurück.');
  }

  const ttl = typeof data.expires_in === 'number'
    ? Math.min(data.expires_in * 1000 - 60_000, TOKEN_TTL_MS)
    : TOKEN_TTL_MS;

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ttl,
  };
  return tokenCache.token;
}

type GraphFetchOptions = RequestInit & {
  retries?: number;
  raw?: boolean; // skip JSON content-type default
};

async function graphFetch(path: string, init?: GraphFetchOptions): Promise<Response> {
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

async function graphJson<T = unknown>(path: string, init?: GraphFetchOptions): Promise<T> {
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
    throw new SharePointError(message, res.status, details);
  }
  return (await res.json()) as T;
}

// Encodes each path segment but keeps slashes as separators
function encodeSharePointPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

// ============================================================
// Public API
// ============================================================

export async function getRootSite(): Promise<SiteInfo> {
  return graphJson<SiteInfo>('/sites/root');
}

export async function getDefaultSiteId(): Promise<string> {
  const envId = process.env.MICROSOFT_SHAREPOINT_SITE_ID;
  if (envId) return envId;
  const root = await getRootSite();
  return root.id;
}

export async function listSites(searchQuery = '*'): Promise<SiteInfo[]> {
  const data = await graphJson<{ value: SiteInfo[] }>(
    `/sites?search=${encodeURIComponent(searchQuery)}`
  );
  return data.value || [];
}

export async function searchSharePoint(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const data = await graphJson<{
    value: Array<{
      hitsContainers: Array<{
        hits: Array<{
          hitId: string;
          summary?: string;
          resource: Record<string, unknown> & {
            id?: string;
            name?: string;
            webUrl?: string;
            size?: number;
            lastModifiedDateTime?: string;
            parentReference?: { driveId?: string };
            file?: { mimeType?: string };
            listItem?: { fields?: { name?: string }; webUrl?: string };
          };
        }>;
      }>;
    }>;
  }>('/search/query', {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          entityTypes: ['driveItem'],
          query: { queryString: query },
          from: 0,
          size: 20,
        },
      ],
    }),
  });

  const hits = data?.value?.[0]?.hitsContainers?.[0]?.hits || [];
  return hits.map((hit) => {
    const r = hit.resource;
    const driveId = r.parentReference?.driveId;
    const name = r.name || r.listItem?.fields?.name || 'Unbenannt';
    const ext = (name.split('.').pop() || '').toLowerCase();
    return {
      id: r.id || hit.hitId,
      driveId,
      itemId: r.id,
      name,
      url: r.webUrl || r.listItem?.webUrl || '',
      summary: hit.summary,
      lastModified: r.lastModifiedDateTime,
      fileType: ext,
      size: r.size,
    } satisfies SearchResult;
  });
}

export async function listFolderContents(siteId: string, path?: string): Promise<DriveItem[]> {
  const clean = (path || '').trim().replace(/^\/+|\/+$/g, '');
  const endpoint = clean
    ? `/sites/${siteId}/drive/root:/${encodeSharePointPath(clean)}:/children`
    : `/sites/${siteId}/drive/root/children`;
  const data = await graphJson<{ value: DriveItem[] }>(endpoint);
  return data.value || [];
}

export async function getDriveItem(driveId: string, itemId: string): Promise<DriveItem> {
  return graphJson<DriveItem>(`/drives/${driveId}/items/${itemId}`);
}

export async function getFileText(driveId: string, itemId: string): Promise<{
  text: string;
  name: string;
  extension: string;
  extracted: 'raw' | 'docx' | 'pdf';
}> {
  const info = await getDriveItem(driveId, itemId);
  const name = info.name || 'Unbenannt';
  const ext = (name.split('.').pop() || '').toLowerCase();

  const res = await graphFetch(`/drives/${driveId}/items/${itemId}/content`);
  if (!res.ok) {
    throw new SharePointError(
      `Dateiinhalt konnte nicht geladen werden (${res.status}).`,
      res.status
    );
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    const text = await res.text();
    return { text, name, extension: ext, extracted: 'raw' };
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  if (ext === 'docx' || ext === 'doc') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value || '', name, extension: ext, extracted: 'docx' };
  }

  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it: unknown) => (it as { str?: string }).str || '')
        .filter(Boolean)
        .join(' ');
      pages.push(pageText);
    }
    return { text: pages.join('\n\n'), name, extension: ext, extracted: 'pdf' };
  }

  throw new SharePointError(
    `Text-Extraktion für .${ext || 'unbekannt'} wird nicht unterstützt.`
  );
}

export async function createTextFile(
  siteId: string,
  folderPath: string,
  fileName: string,
  content: string
): Promise<DriveItem> {
  const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
  const encodedFolder = cleanFolder ? encodeSharePointPath(cleanFolder) + '/' : '';
  const path = `${encodedFolder}${encodeURIComponent(fileName)}`;
  const url = `/sites/${siteId}/drive/root:/${path}:/content`;

  const res = await graphFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    raw: true,
    body: content,
  });

  if (!res.ok) {
    let details: unknown = undefined;
    try {
      details = await res.json();
    } catch {
      details = await res.text().catch(() => '');
    }
    throw new SharePointError(
      `Datei konnte nicht erstellt werden (${res.status}).`,
      res.status,
      details
    );
  }
  return res.json();
}

export async function updateTextFile(
  driveId: string,
  itemId: string,
  content: string
): Promise<DriveItem> {
  const info = await getDriveItem(driveId, itemId);
  const ext = (info.name?.split('.').pop() || '').toLowerCase();
  const isWritableAsText =
    TEXT_EXTENSIONS.has(ext) || ext === 'docx' || ext === 'doc';
  if (!isWritableAsText) {
    throw new SharePointError(
      `Aktualisierung von .${ext || 'unbekannt'} wird nicht unterstützt (nur Text- und Word-Dateien).`
    );
  }

  const res = await graphFetch(`/drives/${driveId}/items/${itemId}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    raw: true,
    body: content,
  });

  if (!res.ok) {
    let details: unknown = undefined;
    try {
      details = await res.json();
    } catch {
      details = await res.text().catch(() => '');
    }
    throw new SharePointError(
      `Datei konnte nicht aktualisiert werden (${res.status}).`,
      res.status,
      details
    );
  }
  return res.json();
}

export async function testConnection(): Promise<{
  configured: boolean;
  tokenOk: boolean;
  siteId?: string;
  siteDisplayName?: string;
  siteWebUrl?: string;
  availableSites?: SiteInfo[];
  error?: string;
}> {
  if (!isSharePointConfigured()) {
    return {
      configured: false,
      tokenOk: false,
      error: 'Umgebungsvariablen fehlen.',
    };
  }

  try {
    await getAccessToken(true);
  } catch (err) {
    return {
      configured: true,
      tokenOk: false,
      error: err instanceof Error ? err.message : 'Unbekannter Fehler',
    };
  }

  try {
    const envId = process.env.MICROSOFT_SHAREPOINT_SITE_ID || null;
    let site: SiteInfo | null = null;
    if (envId) {
      site = await graphJson<SiteInfo>(`/sites/${envId}`);
    } else {
      site = await getRootSite();
    }
    const available = await listSites('*').catch(() => []);
    return {
      configured: true,
      tokenOk: true,
      siteId: site.id,
      siteDisplayName: site.displayName || site.name,
      siteWebUrl: site.webUrl,
      availableSites: available.slice(0, 20),
    };
  } catch (err) {
    return {
      configured: true,
      tokenOk: true,
      error: err instanceof Error ? err.message : 'Unbekannter Fehler',
    };
  }
}
