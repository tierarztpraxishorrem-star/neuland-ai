// Microsoft Graph API Client für SharePoint
// Auth + Fetch via shared lib/server/msGraph.ts

import {
  graphFetch,
  graphJson,
  getAccessToken,
  encodeGraphPath as encodeSharePointPath,
  isMsGraphConfigured,
  MsGraphError as SharePointError,
} from './msGraph';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'html', 'htm',
  'log', 'yml', 'yaml', 'tsv', 'ini', 'conf',
]);

// SharePointError bleibt als Alias erhalten für Abwärtskompatibilität
export { SharePointError };

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
  return isMsGraphConfigured();
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

// Zerlegt lange Suchbegriffe in mehrere sinnvolle Teil-Queries.
function buildSearchQueries(query: string): string[] {
  const queries: string[] = [];
  const trimmed = query.trim();

  // Original-Query (falls nicht zu lang)
  if (trimmed.length > 0 && trimmed.length <= 50) {
    queries.push(trimmed);
  }

  // Wörter mit >=4 Buchstaben als Einzel-Queries
  const words = trimmed
    .split(/[\s\-_,./]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4);

  // Erste 3 signifikanten Wörter kombiniert
  if (words.length >= 2) {
    queries.push(words.slice(0, 3).join(' '));
  }

  // Jedes signifikante Wort einzeln (max. 5)
  for (const word of words.slice(0, 5)) {
    if (!queries.includes(word)) queries.push(word);
  }

  // Fallback: wenn bisher nichts drin (z.B. nur Kurzwörter), Original verwenden
  if (queries.length === 0 && trimmed) queries.push(trimmed);

  return [...new Set(queries)].slice(0, 4);
}

async function searchSharePointSingle(query: string): Promise<SearchResult[]> {
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
          region: process.env.MICROSOFT_GRAPH_REGION || 'DEU',
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

export async function searchSharePoint(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const queries = buildSearchQueries(trimmed);
  const results = await Promise.allSettled(queries.map((q) => searchSharePointSingle(q)));

  const seenIds = new Set<string>();
  const merged: SearchResult[] = [];
  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    for (const item of res.value) {
      if (!item.id || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      merged.push(item);
    }
  }

  // Ranking: mehr Query-Wörter im Dateinamen → weiter oben
  const queryWords = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  merged.sort((a, b) => {
    const scoreA = queryWords.filter((w) => a.name.toLowerCase().includes(w)).length;
    const scoreB = queryWords.filter((w) => b.name.toLowerCase().includes(w)).length;
    return scoreB - scoreA;
  });

  return merged.slice(0, 20);
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
  extracted: 'raw' | 'docx' | 'pdf' | 'xlsx';
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

  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'ods') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheets: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        blankrows: false,
      });
      const lines = rows
        .map((row) =>
          Array.isArray(row)
            ? row.map((cell) => (cell == null ? '' : String(cell))).join('\t')
            : ''
        )
        .filter((line) => line.trim().length > 0);
      sheets.push(`# ${sheetName}\n${lines.join('\n')}`);
    }
    return { text: sheets.join('\n\n'), name, extension: ext, extracted: 'xlsx' };
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
