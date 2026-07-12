-- Migration to create order_attachments table for Pedidos attachments with strict RLS policies
CREATE TABLE IF NOT EXISTS public.order_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_key          TEXT NOT NULL,
  file_name         TEXT,
  file_type         TEXT,
  file_size         BIGINT,
  uploaded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_hash         TEXT
);

-- Index for performance queries
CREATE INDEX IF NOT EXISTS idx_order_attachments_order ON public.order_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_hash ON public.order_attachments(file_hash);

-- Enable Row Level Security
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;

-- Policy 1: Partner users of the order's partner can do everything
DROP POLICY IF EXISTS partner_access ON public.order_attachments;
CREATE POLICY partner_access ON public.order_attachments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.partner_users pu ON pu.partner_id = o.partner_id
      WHERE o.id = order_attachments.order_id AND pu.user_id = auth.uid()
    )
  );

-- Policy 2: The buyer of the order can view attachments
DROP POLICY IF EXISTS buyer_read ON public.order_attachments;
CREATE POLICY buyer_read ON public.order_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_attachments.order_id AND o.buyer_id = auth.uid()
    )
  );
