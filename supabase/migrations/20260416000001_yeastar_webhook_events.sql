CREATE TABLE IF NOT EXISTS yeastar_webhook_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE yeastar_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_yeastar_webhook_events_received_at ON yeastar_webhook_events(received_at DESC);
