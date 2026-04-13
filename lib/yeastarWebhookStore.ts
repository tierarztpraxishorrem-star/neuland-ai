import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type YeastarWebhookEvent = {
  id: string;
  receivedAt: string;
  eventType: string;
  number: string;
  payload: Record<string, unknown>;
};

const EVENTS_FILE = path.join(process.cwd(), 'data', 'yeastar-webhook-events.json');
const MAX_EVENTS = 200;

const safeParse = (raw: string): YeastarWebhookEvent[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as YeastarWebhookEvent[]) : [];
  } catch {
    return [];
  }
};

export async function readYeastarWebhookEvents(): Promise<YeastarWebhookEvent[]> {
  try {
    const raw = await readFile(EVENTS_FILE, 'utf8');
    return safeParse(raw);
  } catch {
    return [];
  }
}

export async function appendYeastarWebhookEvent(event: YeastarWebhookEvent): Promise<void> {
  const current = await readYeastarWebhookEvents();
  const next = [event, ...current].slice(0, MAX_EVENTS);
  await mkdir(path.dirname(EVENTS_FILE), { recursive: true });
  await writeFile(EVENTS_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}