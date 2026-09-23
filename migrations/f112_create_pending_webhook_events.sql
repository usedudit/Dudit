-- ============================================================================
-- pending_webhook_events: outbox table for edge-ingested webhooks
--
-- Edge Functions insert events here (ultra-fast ACK to providers),
-- then the application (via polling or trigger) processes them asynchronously.
-- This decouples webhook ingestion (must be < 1s) from business logic
-- (can take seconds and involves retries, audit logs, etc.).
-- ============================================================================

create table if not exists public.pending_webhook_events (
    id               uuid           primary key default gen_random_uuid(),
    provider         text           not null,                        -- 'mercadopago', 'whatsapp', etc.
    event_type       text           not null,                        -- 'payment', 'subscription', etc.
    request_id       text           not null,                        -- x-request-id (deduplication)
    signature        text,                                            -- raw signature header (for audit)
    payload          jsonb          not null,                       -- full webhook body
    inserted_at      timestamptz    not null default now(),
    processed_at     timestamptz,                                    -- NULL = unprocessed
    processing_error text,                                            -- error message if processing failed
    attempts         smallint       not null default 0,             -- retry counter
    status           text           not null default 'pending',     -- pending | processing | completed | failed
    resource_id      text,                                           -- the payment_id / resource identifier
    partner_id       text,                                           -- resolved partner (if known at ingest)
    idempotency_key  text unique                                      -- prevents duplicate processing
);

-- Indexes for efficient polling and deduplication
create index if not exists idx_pending_webhooks_status
    on public.pending_webhook_events (status, inserted_at);
create index if not exists idx_pending_webhooks_request_id
    on public.pending_webhook_events (request_id);
create index if not exists idx_pending_webhooks_provider
    on public.pending_webhook_events (provider, status);
create index if not exists idx_pending_webhooks_resource
    on public.pending_webhook_events (provider, resource_id)
    where resource_id is not null;

-- RLS: only service_role can write (from Edge Functions);
-- app uses service_role or RPC. Keep it open for ingestion.
alter table public.pending_webhook_events enable row level security;
create policy "service_role can access pending_webhook_events"
    on public.pending_webhook_events
    to service_role
    using (true)
    with check (true);
