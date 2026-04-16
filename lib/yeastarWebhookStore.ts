import { createClient } from '@supabase/supabase-js';

export type YeastarWebhookEvent = {
  id: string;
  receivedAt: string;
  eventType: string;
  number: string;
  payload: Record<string, unknown>;
};

type YeastarWebhookEventRow = {
  id: string;
  payload: YeastarWebhookEvent;
  received_at: string;
};

const getServiceClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

export async function readYeastarWebhookEvents(): Promise<YeastarWebhookEvent[]> {
  const supabase = getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('yeastar_webhook_events')
    .select('id, payload, received_at')
    .order('received_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return (data as YeastarWebhookEventRow[]).map((row) => row.payload as YeastarWebhookEvent);
}

export async function appendYeastarWebhookEvent(event: YeastarWebhookEvent): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) {
    console.error('[yeastarWebhookStore] Supabase-Konfiguration fehlt.');
    return;
  }

  const { error } = await supabase
    .from('yeastar_webhook_events')
    .insert({ payload: event });

  if (error) {
    console.error('[yeastarWebhookStore] INSERT fehlgeschlagen:', error.message);
  }
}
