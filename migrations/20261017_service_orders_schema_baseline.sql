-- ============================================================================
-- Migration: 20261017_service_orders_schema_baseline.sql
-- Description: Baseline das colunas de negócio de service_orders que existem
--              em produção mas não eram reproduzidas pelas migrations.
--
-- Contexto: as colunas de prioridade, estimativas, desconto/cupom, custos e
-- pagamento foram criadas diretamente no banco (drift) e nunca versionadas.
-- Este arquivo torna o schema reprodutível em ambientes novos.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DO blocks para constraints.
-- Em produção é um no-op (colunas/constraints já existem).
-- ============================================================================

BEGIN;

-- ─── Colunas ────────────────────────────────────────────────────────────────

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS priority                 TEXT      NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS estimated_hours          NUMERIC,
  ADD COLUMN IF NOT EXISTS expected_completion_time TEXT,
  ADD COLUMN IF NOT EXISTS discount_value           NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type            TEXT      DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS coupon_id                UUID      REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code              TEXT,
  ADD COLUMN IF NOT EXISTS coupon_discount_amount   NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_costs              NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status           TEXT      NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount              NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method           TEXT,
  ADD COLUMN IF NOT EXISTS payment_breakdown        JSONB;

-- ─── CHECK constraints (idempotentes) ───────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_orders'::regclass
      AND conname = 'service_orders_priority_check'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_priority_check
      CHECK (priority = ANY (ARRAY['baixa','media','alta','urgente']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_orders'::regclass
      AND conname = 'service_orders_payment_status_check'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_payment_status_check
      CHECK (payment_status = ANY (ARRAY['paid','partially_paid','unpaid']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_orders'::regclass
      AND conname = 'service_orders_discount_type_check'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_discount_type_check
      CHECK (discount_type = ANY (ARRAY['fixed','percentage','coupon']));
  END IF;
END $$;

-- ─── Índices de apoio ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_service_orders_partner_payment
  ON public.service_orders(partner_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_service_orders_partner_priority
  ON public.service_orders(partner_id, priority);

COMMIT;

NOTIFY pgrst, 'reload schema';
