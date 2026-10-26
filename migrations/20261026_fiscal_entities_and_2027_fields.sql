-- ============================================================================
-- Fiscal entities (CNPJ-level tax identity) + receita limit + 2027 fiscal fields
-- ----------------------------------------------------------------------------
-- Contexto:
--   * Hoje o documento fiscal (CNPJ/CPF) e o CRT vivem em `stores`, ou seja,
--     por loja. Só que o limite do MEI é por CNPJ (MEI não pode ter filial) e
--     uma PJ pode ter matriz + filiais com CNPJs distintos.
--   * `fiscal_entities` passa a ser a identidade tributária: uma linha por
--     documento dentro do parceiro. Lojas que compartilham o mesmo CNPJ
--     compartilham a mesma entidade (e portanto o mesmo limite).
--   * `stores.cnpj` / `stores.cpf` continuam existindo para billing, vitrine e
--     emissão de etiqueta (compatibilidade), e são sincronizados pela action.
--
-- Também adiciona:
--   * Campos de documento fiscal no pedido (NF-e / NFS-e) para o gate de envio.
--   * Campos IBS/CBS em produtos (2027) e uma tabela de perfil fiscal de serviço.
--   * Novo tipo de notificação `revenue_limit_alert`.
-- ============================================================================

BEGIN;

-- ─── 1. Identidade fiscal ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fiscal_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  document_type TEXT CHECK (document_type IN ('cnpj', 'cpf')),
  -- Somente dígitos. NULL = perfil ainda não informado.
  document TEXT,
  tax_profile TEXT NOT NULL DEFAULT 'nao_informado'
    CHECK (tax_profile IN ('nao_informado', 'mei', 'nano', 'pf_contribuinte')),
  cnae_primary TEXT,
  cnae_secondary TEXT[] NOT NULL DEFAULT '{}',
  annual_revenue_limit NUMERIC(14, 2),
  revenue_limit_year INTEGER,
  -- Data de abertura do CNPJ, usada para limitar proporcional no primeiro ano.
  opening_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_entities_partner_id
  ON public.fiscal_entities (partner_id);

COMMENT ON TABLE public.fiscal_entities IS
  'Identidade tributária por CNPJ dentro de um parceiro. O limite anual de faturamento é compartilhado por todas as lojas vinculadas. CPF de nanoempreendedor fica criptografado em stores.cpf.';
COMMENT ON COLUMN public.fiscal_entities.tax_profile IS
  'mei = SIMEI/CRT 4; nano = PF abaixo de 50% do limite MEI, fora do IBS/CBS; pf_contribuinte = PF com CNPJ técnico e obrigação de documento fiscal.';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS fiscal_entity_id UUID
  REFERENCES public.fiscal_entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stores_fiscal_entity_id
  ON public.stores (fiscal_entity_id);

-- ─── 2. Backfill ────────────────────────────────────────────────────────────
-- Agrupa por CNPJ. CPF fica de fora de propósito: `stores.cpf` é criptografado
-- e não serve para comparação. Lojas sem CNPJ compartilham uma única entidade
-- sem documento por parceiro (pessoa física/nano), criada no bloco abaixo.
DO $$
DECLARE
  r RECORD;
  eid UUID;
  doc TEXT;
BEGIN
  FOR r IN
    SELECT id, partner_id, cnpj
    FROM public.stores
    WHERE fiscal_entity_id IS NULL
  LOOP
    doc := NULLIF(regexp_replace(COALESCE(r.cnpj, ''), '\D', '', 'g'), '');

    IF doc IS NOT NULL THEN
      SELECT id INTO eid
      FROM public.fiscal_entities
      WHERE partner_id = r.partner_id AND document = doc
      LIMIT 1;

      IF eid IS NULL THEN
        INSERT INTO public.fiscal_entities (partner_id, document_type, document)
        VALUES (r.partner_id, 'cnpj', doc)
        RETURNING id INTO eid;
      END IF;
    ELSE
      SELECT id INTO eid
      FROM public.fiscal_entities
      WHERE partner_id = r.partner_id AND document IS NULL
      LIMIT 1;

      IF eid IS NULL THEN
        INSERT INTO public.fiscal_entities (partner_id)
        VALUES (r.partner_id)
        RETURNING id INTO eid;
      END IF;
    END IF;

    UPDATE public.stores SET fiscal_entity_id = eid WHERE id = r.id;
    eid := NULL;
  END LOOP;
END $$;

-- Pessoa física/nano não tem CNPJ: a pessoa é uma só, então mantemos uma única
-- entidade sem documento por parceiro. Deduplica o backfill antes do índice.
DO $$
DECLARE
  r RECORD;
  keep UUID;
BEGIN
  FOR r IN
    SELECT partner_id
    FROM public.fiscal_entities
    WHERE document IS NULL
    GROUP BY partner_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keep
    FROM public.fiscal_entities
    WHERE partner_id = r.partner_id AND document IS NULL
    ORDER BY created_at, id
    LIMIT 1;

    UPDATE public.stores
    SET fiscal_entity_id = keep
    WHERE fiscal_entity_id IN (
      SELECT id FROM public.fiscal_entities
      WHERE partner_id = r.partner_id AND document IS NULL AND id <> keep
    );

    DELETE FROM public.fiscal_entities
    WHERE partner_id = r.partner_id AND document IS NULL AND id <> keep;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_entities_partner_document_key
  ON public.fiscal_entities (partner_id, document)
  WHERE document IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_entities_partner_no_document_key
  ON public.fiscal_entities (partner_id)
  WHERE document IS NULL;

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
-- A aplicação usa o client administrativo, mas as policies mantêm o isolamento
-- para acesso direto via Supabase. `get_user_partner_ids()` já inclui o dono do
-- parceiro e os membros de partner_users.
ALTER TABLE public.fiscal_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fiscal_entities_select_members" ON public.fiscal_entities;
CREATE POLICY "fiscal_entities_select_members" ON public.fiscal_entities
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS "fiscal_entities_insert_members" ON public.fiscal_entities;
CREATE POLICY "fiscal_entities_insert_members" ON public.fiscal_entities
  FOR INSERT TO authenticated
  WITH CHECK (partner_id IN (SELECT public.get_user_partner_ids()));

DROP POLICY IF EXISTS "fiscal_entities_update_members" ON public.fiscal_entities;
CREATE POLICY "fiscal_entities_update_members" ON public.fiscal_entities
  FOR UPDATE TO authenticated
  USING (partner_id IN (SELECT public.get_user_partner_ids()))
  WITH CHECK (partner_id IN (SELECT public.get_user_partner_ids()));

-- ─── 4. Documento fiscal no pedido ──────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS nfe_number TEXT,
  ADD COLUMN IF NOT EXISTS nfe_series TEXT,
  ADD COLUMN IF NOT EXISTS nfe_access_key TEXT,
  ADD COLUMN IF NOT EXISTS nfe_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiscal_document_type TEXT,
  ADD COLUMN IF NOT EXISTS nfe_override_by UUID,
  ADD COLUMN IF NOT EXISTS nfe_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nfe_override_reason TEXT;

COMMENT ON COLUMN public.orders.nfe_number IS
  'Número da NF-e/NFS-e informado pelo vendedor. Obrigatório para pedido com comprador PJ antes do envio.';
COMMENT ON COLUMN public.orders.nfe_override_reason IS
  'Registro de quando o vendedor optou por enviar sem informar a nota fiscal.';

-- ─── 5. IBS/CBS em produtos (2027) ──────────────────────────────────────────
ALTER TABLE public.product_fiscal_profiles
  ADD COLUMN IF NOT EXISTS cst_ibs_cbs TEXT,
  ADD COLUMN IF NOT EXISTS c_class_trib TEXT;

COMMENT ON COLUMN public.product_fiscal_profiles.cst_ibs_cbs IS
  'CST do IBS/CBS (3 dígitos). Operação padrão em 2027: 000.';
COMMENT ON COLUMN public.product_fiscal_profiles.c_class_trib IS
  'cClassTrib (6 dígitos). Operação padrão em 2027: 000001.';

-- ─── 6. Perfil fiscal de serviço (2027) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_fiscal_profiles (
  service_id UUID PRIMARY KEY REFERENCES public.services(id) ON DELETE CASCADE,
  c_trib_nac TEXT,
  nbs TEXT,
  c_class_trib TEXT,
  cst_ibs_cbs TEXT,
  iss_rate NUMERIC(6, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.service_fiscal_profiles IS
  'Campos fiscais de serviço para a reforma tributária (cTribNac, NBS, cClassTrib, CST IBS/CBS). Apenas armazenamento: não há emissão de NFS-e.';

ALTER TABLE public.service_fiscal_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_fiscal_profiles_select_members" ON public.service_fiscal_profiles;
CREATE POLICY "service_fiscal_profiles_select_members" ON public.service_fiscal_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.id = service_fiscal_profiles.service_id
        AND s.partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

DROP POLICY IF EXISTS "service_fiscal_profiles_write_members" ON public.service_fiscal_profiles;
CREATE POLICY "service_fiscal_profiles_write_members" ON public.service_fiscal_profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.id = service_fiscal_profiles.service_id
        AND s.partner_id IN (SELECT public.get_user_partner_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.id = service_fiscal_profiles.service_id
        AND s.partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

-- ─── 7. Notificação de limite de faturamento ────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'order_created',
    'order_paid',
    'order_shipped',
    'order_delivered',
    'order_cancelled',
    'order_refunded',
    'appointment_created',
    'appointment_confirmed',
    'appointment_reminder',
    'appointment_cancelled',
    'appointment_rescheduled',
    'subscription_created',
    'subscription_renewed',
    'subscription_price_change',
    'subscription_price_change_expired',
    'message_received',
    'admin_announcement',
    'low_stock',
    'replenishment_suggested',
    'service_return_reminder',
    'xml_import_completed',
    'cart_abandoned',
    'revenue_limit_alert'
  ));

COMMIT;
