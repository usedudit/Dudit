-- Migration to create stock_movement_attachments and transaction_attachments tables
-- Plus add partner modify permissions for return_evidence

-- 1. Stock Movement Attachments Table
CREATE TABLE IF NOT EXISTS public.stock_movement_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_movement_id UUID NOT NULL REFERENCES public.stock_movements(id) ON DELETE CASCADE,
  file_key          TEXT NOT NULL,
  file_name         TEXT,
  file_type         TEXT,
  file_size         BIGINT,
  uploaded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_hash         TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_movement_attachments_mov ON public.stock_movement_attachments(stock_movement_id);

ALTER TABLE public.stock_movement_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_access ON public.stock_movement_attachments;
CREATE POLICY partner_access ON public.stock_movement_attachments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_movements sm
      JOIN public.partner_users pu ON pu.partner_id = sm.partner_id
      WHERE sm.id = stock_movement_attachments.stock_movement_id AND pu.user_id = auth.uid()
    )
  );

-- 2. Transaction Attachments Table
CREATE TABLE IF NOT EXISTS public.transaction_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  file_key          TEXT NOT NULL,
  file_name         TEXT,
  file_type         TEXT,
  file_size         BIGINT,
  uploaded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_hash         TEXT
);

CREATE INDEX IF NOT EXISTS idx_transaction_attachments_tx ON public.transaction_attachments(transaction_id);

ALTER TABLE public.transaction_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_access ON public.transaction_attachments;
CREATE POLICY partner_access ON public.transaction_attachments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      JOIN public.partner_users pu ON pu.partner_id = t.partner_id
      WHERE t.id = transaction_attachments.transaction_id AND pu.user_id = auth.uid()
    )
  );

-- 3. Return Evidence Policies Update
DROP POLICY IF EXISTS return_evidence_all_partner ON public.return_evidence;
CREATE POLICY return_evidence_all_partner ON public.return_evidence
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.return_requests rr
      JOIN public.partner_users pu ON pu.partner_id = rr.partner_id
      WHERE rr.id = return_evidence.return_request_id AND pu.user_id = auth.uid()
    )
  );
