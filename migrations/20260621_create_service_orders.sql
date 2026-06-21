-- Módulo de Ordem de Serviço (OS)
-- Migration completa: drop + recreate limpo

-- Drop existente (se rodou versão anterior)
DROP TABLE IF EXISTS public.service_order_attachments CASCADE;
DROP TABLE IF EXISTS public.service_order_products CASCADE;
DROP TABLE IF EXISTS public.service_order_services CASCADE;
DROP TABLE IF EXISTS public.service_order_history CASCADE;
DROP TABLE IF EXISTS public.service_orders CASCADE;
DROP TABLE IF EXISTS public.service_order_sequences CASCADE;
DROP FUNCTION IF EXISTS public.next_service_order_number CASCADE;
DROP FUNCTION IF EXISTS public.update_service_orders_updated_at CASCADE;

-- ============================================================
-- 0. Sequência atômica por partner (race-condition safe)
-- ============================================================
CREATE TABLE public.service_order_sequences (
  partner_id    UUID PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  last_number   INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_service_order_number(p_partner_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM now());
  v_num INT;
BEGIN
  INSERT INTO public.service_order_sequences (partner_id, year, last_number)
  VALUES (p_partner_id, v_year, 1)
  ON CONFLICT (partner_id) DO UPDATE
    SET
      last_number = CASE
        WHEN service_order_sequences.year = v_year
        THEN service_order_sequences.last_number + 1
        ELSE 1
      END,
      year = v_year
  RETURNING last_number INTO v_num;

  RETURN 'OS-' || v_year || '-' || LPAD(v_num::TEXT, 4, '0');
END;
$$;

-- ============================================================
-- 1. Tabela principal: service_orders
-- ============================================================
CREATE TABLE public.service_orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id                UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  order_number              TEXT NOT NULL,
  customer_id               UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_snapshot         JSONB,
  status                    TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','aguardando_aprovacao','aprovada','em_andamento','aguardando_peca','concluida','entregue','cancelada')),
  title                     TEXT NOT NULL,
  description               TEXT,
  internal_notes            TEXT,
  expected_completion_date  DATE,
  completed_at              TIMESTAMPTZ,
  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  public_token              UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  signature_image_key       TEXT,
  signed_at                 TIMESTAMPTZ,
  total_service_amount      NUMERIC(14,2) DEFAULT 0,
  total_product_amount      NUMERIC(14,2) DEFAULT 0,
  total_amount              NUMERIC(14,2) DEFAULT 0,
  transaction_id            UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(partner_id, order_number)
);

-- ============================================================
-- 1b. Histórico operacional da OS
-- ============================================================
CREATE TABLE public.service_order_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id  UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  previous_status   TEXT,
  new_status        TEXT NOT NULL,
  notes             TEXT,
  changed_fields    JSONB,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Itens de serviço da OS
-- ============================================================
CREATE TABLE public.service_order_services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id  UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  service_id        UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name      TEXT NOT NULL,
  service_price     NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity          NUMERIC(12,4) NOT NULL DEFAULT 1,
  total_price       NUMERIC(14,2) NOT NULL DEFAULT 0,
  assigned_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Produtos utilizados na OS
-- ============================================================
CREATE TABLE public.service_order_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id  UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id        UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name      TEXT NOT NULL,
  unit_price        NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity          NUMERIC(14,3) NOT NULL DEFAULT 1,
  total_price       NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. Anexos da OS
-- ============================================================
CREATE TABLE public.service_order_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id  UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  file_key          TEXT NOT NULL,
  file_name         TEXT,
  file_type         TEXT,
  file_size         BIGINT,
  uploaded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Índices (IF NOT EXISTS)
-- ============================================================
CREATE INDEX idx_service_orders_partner_status ON service_orders(partner_id, status, created_at DESC);
CREATE INDEX idx_service_orders_partner_customer ON service_orders(partner_id, customer_id);
CREATE INDEX idx_service_orders_partner_assigned ON service_orders(partner_id, assigned_user_id);
CREATE INDEX idx_service_orders_public_token ON service_orders(public_token);
CREATE INDEX idx_so_history_order ON service_order_history(service_order_id, created_at DESC);
CREATE INDEX idx_so_services_order ON service_order_services(service_order_id);
CREATE INDEX idx_so_products_order ON service_order_products(service_order_id);
CREATE INDEX idx_so_attachments_order ON service_order_attachments(service_order_id);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_isolation ON public.service_orders;
CREATE POLICY partner_isolation ON public.service_orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = service_orders.partner_id AND pu.user_id = auth.uid())
  );

DROP POLICY IF EXISTS partner_isolation ON public.service_order_history;
CREATE POLICY partner_isolation ON public.service_order_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      JOIN public.partner_users pu ON pu.partner_id = so.partner_id
      WHERE so.id = service_order_history.service_order_id AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS partner_isolation ON public.service_order_services;
CREATE POLICY partner_isolation ON public.service_order_services
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      JOIN public.partner_users pu ON pu.partner_id = so.partner_id
      WHERE so.id = service_order_services.service_order_id AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS partner_isolation ON public.service_order_products;
CREATE POLICY partner_isolation ON public.service_order_products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      JOIN public.partner_users pu ON pu.partner_id = so.partner_id
      WHERE so.id = service_order_products.service_order_id AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS partner_isolation ON public.service_order_attachments;
CREATE POLICY partner_isolation ON public.service_order_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      JOIN public.partner_users pu ON pu.partner_id = so.partner_id
      WHERE so.id = service_order_attachments.service_order_id AND pu.user_id = auth.uid()
    )
  );

-- Drop legacy public_read_by_token if exists (removida por design)
DROP POLICY IF EXISTS public_read_by_token ON public.service_orders;

-- ============================================================
-- Audit trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_service_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_orders_updated_at ON public.service_orders;
CREATE TRIGGER trg_service_orders_updated_at
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION update_service_orders_updated_at();
