-- ============================================================================
-- Integrations model (logistics/shipping first): catalog + per-partner
-- connections + per-order shipments.
--
-- Replaces the previous column-based design (partners.superfrete_*,
-- orders.shipping_*), which was never applied to the database.
--
--   integration_providers  - catalog of available providers (seed: superfrete)
--   partner_integrations   - one connection row per partner x provider
--                            (tokens, webhook secret, provider-specific config)
--   order_shipments        - one row per shipping label generated for an order
--
-- Conventions follow partner_whatsapp_connections (20260529) and
-- orders_history (20260408): RLS with partner membership check, generic
-- update_updated_at_column() trigger, idempotent DDL.
-- ============================================================================

-- ─── Provider catalog ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.integration_providers (
  slug        TEXT PRIMARY KEY,
  category    TEXT NOT NULL CHECK (category IN ('shipping', 'payment', 'messaging', 'other')),
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  docs_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.integration_providers IS
  'Catalog of integration providers available on the platform. Adding a new provider is an INSERT here, no schema change.';

INSERT INTO public.integration_providers (slug, category, name)
VALUES ('superfrete', 'shipping', 'SuperFrete')
ON CONFLICT (slug) DO NOTHING;

-- ─── Per-partner connection ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_integrations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id                UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  provider_slug             TEXT NOT NULL REFERENCES public.integration_providers(slug) ON DELETE RESTRICT,
  status                    TEXT NOT NULL DEFAULT 'disconnected'
                              CHECK (status IN ('disconnected', 'pending', 'connected', 'error')),
  account_id                TEXT,
  account_email             TEXT,
  access_token_encrypted    TEXT,
  webhook_secret_encrypted  TEXT,
  webhook_id                TEXT,
  config                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials               JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at              TIMESTAMPTZ,
  disconnected_at           TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_integrations_partner_provider
  ON public.partner_integrations (partner_id, provider_slug);

CREATE INDEX IF NOT EXISTS idx_partner_integrations_partner
  ON public.partner_integrations (partner_id);

COMMENT ON TABLE public.partner_integrations IS
  'One integration connection per partner x provider. Secrets are encrypted via cryptoService (context = provider slug).';
COMMENT ON COLUMN public.partner_integrations.access_token_encrypted IS
  'Primary API token/OAuth access token, encrypted via cryptoService.';
COMMENT ON COLUMN public.partner_integrations.webhook_secret_encrypted IS
  'Secret used to verify incoming webhook signatures, encrypted via cryptoService.';
COMMENT ON COLUMN public.partner_integrations.config IS
  'Provider-specific non-secret settings (e.g. SuperFrete: originCep, height, width, length, weight, insuranceValue, ownHand, receipt, services[]). Validated/sanitized in TypeScript before write.';
COMMENT ON COLUMN public.partner_integrations.credentials IS
  'Provider-specific extra secrets when one token column is not enough (e.g. client_id/client_secret, api key). Each value encrypted individually via cryptoService.';
COMMENT ON COLUMN public.partner_integrations.metadata IS
  'Runtime cache / non-secret provider data (e.g. wallet balance, last sync).';

-- ─── Per-order shipments (labels) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_shipments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_id         UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  integration_id     UUID REFERENCES public.partner_integrations(id) ON DELETE SET NULL,
  provider_slug      TEXT NOT NULL REFERENCES public.integration_providers(slug) ON DELETE RESTRICT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'released', 'posted', 'in_transit', 'delivered', 'cancelled', 'failed')),
  service_code       TEXT,
  service_name       TEXT,
  carrier            TEXT,
  external_label_id  TEXT,
  price              NUMERIC(10,2),
  currency           TEXT NOT NULL DEFAULT 'BRL',
  tracking_number    TEXT,
  tracking_url       TEXT,
  label_url          TEXT,
  payload            JSONB,
  requested_at       TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_shipments_order_created
  ON public.order_shipments (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_shipments_partner_created
  ON public.order_shipments (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_shipments_external_label
  ON public.order_shipments (external_label_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_shipments_provider_label_unique
  ON public.order_shipments (provider_slug, external_label_id)
  WHERE external_label_id IS NOT NULL;

COMMENT ON TABLE public.order_shipments IS
  'One shipping label per order x attempt. Supports multiple providers and re-ships over time. Webhooks resolve orders via external_label_id.';
COMMENT ON COLUMN public.order_shipments.external_label_id IS
  'Label/order id at the provider (e.g. SuperFrete order id). Used for webhook lookup and idempotency.';
COMMENT ON COLUMN public.order_shipments.payload IS
  'Snapshot of provider request/response for debugging and audit.';
COMMENT ON COLUMN public.order_shipments.status IS
  'Label lifecycle: pending (created, unpaid) -> released (paid) -> posted -> delivered; cancelled/failed as terminal errors.';

-- ─── updated_at triggers (generic function, also defined in older migrations) ─

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integration_providers_updated_at ON public.integration_providers;
CREATE TRIGGER trg_integration_providers_updated_at
  BEFORE UPDATE ON public.integration_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_partner_integrations_updated_at ON public.partner_integrations;
CREATE TRIGGER trg_partner_integrations_updated_at
  BEFORE UPDATE ON public.partner_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_order_shipments_updated_at ON public.order_shipments;
CREATE TRIGGER trg_order_shipments_updated_at
  BEFORE UPDATE ON public.order_shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Row Level Security ─────────────────────────────────────────────────────
-- All application access goes through the service-role admin client (which
-- bypasses RLS). Policies below only grant SELECT to authenticated partner
-- members as defense in depth; writes from the browser are intentionally
-- denied (no INSERT/UPDATE policies for authenticated).

ALTER TABLE public.integration_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_providers_select_all" ON public.integration_providers;
CREATE POLICY "integration_providers_select_all" ON public.integration_providers
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "partner_integrations_select_member" ON public.partner_integrations;
CREATE POLICY "partner_integrations_select_member" ON public.partner_integrations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = partner_integrations.partner_id
        AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "order_shipments_select_member" ON public.order_shipments;
CREATE POLICY "order_shipments_select_member" ON public.order_shipments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = order_shipments.partner_id
        AND pu.user_id = auth.uid()
    )
  );
