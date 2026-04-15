/**
 * Yeastar P-Series Cloud API Client
 * OAuth 2.0 token management + API calls for call control, recordings, etc.
 */

const YEASTAR_BASE = (process.env.YEASTAR_API_BASE_URL || '').replace(/\/$/, '');
const API_PATH = '/openapi/v1.0';

// In-memory token cache (serverless: per-instance, good enough for 30-min tokens)
let cachedToken: { access_token: string; refresh_token: string; expires_at: number } | null = null;

/** Get a valid access token via OAuth 2.0 or fall back to static env token */
export async function getYeastarToken(): Promise<string> {
  // If we have a cached token that's still valid (with 2-min buffer), use it
  if (cachedToken && Date.now() < cachedToken.expires_at - 120_000) {
    return cachedToken.access_token;
  }

  // Try refreshing first
  if (cachedToken?.refresh_token) {
    try {
      const refreshed = await refreshToken(cachedToken.refresh_token);
      if (refreshed) return refreshed;
    } catch { /* fall through to get_token */ }
  }

  // Get new token via client credentials
  const clientId = process.env.YEASTAR_CLIENT_ID || '';
  const clientSecret = process.env.YEASTAR_CLIENT_SECRET || '';

  if (clientId && clientSecret && YEASTAR_BASE) {
    const url = `${YEASTAR_BASE}${API_PATH}/get_token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'OpenAPI' },
      body: JSON.stringify({ username: clientId, password: clientSecret }),
    });

    const data = await res.json().catch(() => null);
    if (data?.access_token) {
      cachedToken = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || '',
        expires_at: Date.now() + 30 * 60 * 1000, // 30 min
      };
      return data.access_token;
    }
  }

  // Fallback to static token from env
  const staticToken = process.env.YEASTAR_ACCESS_TOKEN || process.env.YEASTAR_API_KEY || '';
  if (!staticToken) throw new Error('Kein Yeastar-Token verfügbar. YEASTAR_CLIENT_ID/SECRET oder YEASTAR_ACCESS_TOKEN setzen.');
  return staticToken;
}

async function refreshToken(refreshTokenValue: string): Promise<string | null> {
  const url = `${YEASTAR_BASE}${API_PATH}/refresh_token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'OpenAPI' },
    body: JSON.stringify({ refresh_token: refreshTokenValue }),
  });

  const data = await res.json().catch(() => null);
  if (!data?.access_token) return null;

  cachedToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshTokenValue,
    expires_at: Date.now() + 30 * 60 * 1000,
  };
  return data.access_token;
}

/** Make an authenticated Yeastar API request */
export async function yeastarRequest(
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>
): Promise<any> {
  const token = await getYeastarToken();
  const url = `${YEASTAR_BASE}${API_PATH}/${endpoint}?access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'OpenAPI',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => null);

  if (data?.errcode && data.errcode !== 0) {
    throw new Error(`Yeastar API Fehler ${data.errcode}: ${data.errmsg || 'Unbekannt'}`);
  }

  return data;
}

/** Download a recording file and return the blob */
export async function downloadRecording(id: string): Promise<{ url: string } | null> {
  try {
    const data = await yeastarRequest('GET', `recording/download`, { id } as any);
    // Yeastar returns a download URL
    if (data?.download_url || data?.url) {
      return { url: data.download_url || data.url };
    }
    return null;
  } catch (err) {
    console.error('[Yeastar] Recording download fehlgeschlagen:', err);
    return null;
  }
}

/** Query recordings list, optionally filtered */
export async function listRecordings(params?: { page?: number; page_size?: number }) {
  return yeastarRequest('GET', 'recording/list');
}

/** Search recordings */
export async function searchRecordings(params: Record<string, unknown>) {
  return yeastarRequest('GET', 'recording/search');
}

/** Start recording for a call */
export async function startCallRecording(callId: string) {
  return yeastarRequest('POST', 'call/record_start', { id: callId });
}

/** Pause recording */
export async function pauseCallRecording(callId: string) {
  return yeastarRequest('POST', 'call/record_pause', { id: callId });
}

/** Listen (spy) on an active call */
export async function listenToCall(callId: string, extensionNumber: string) {
  return yeastarRequest('POST', 'call/listen', {
    id: callId,
    extension_number: extensionNumber,
  });
}

/** Query active calls */
export async function queryActiveCalls() {
  return yeastarRequest('GET', 'call/query');
}

/** Get auto-recording settings */
export async function getAutoRecordSettings() {
  return yeastarRequest('GET', 'autorecord/get');
}

/** Update auto-recording settings */
export async function updateAutoRecordSettings(settings: Record<string, unknown>) {
  return yeastarRequest('POST', 'autorecord/update', settings);
}

/** Get CDR list */
export async function getCdrList() {
  const callsPath = process.env.YEASTAR_CALLS_PATH || '/openapi/v1.0/cdr/list';
  const endpoint = callsPath.replace(/^\/openapi\/v\d+\.\d+\//, '');
  return yeastarRequest('GET', endpoint);
}
