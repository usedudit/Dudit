BEGIN;

CREATE TABLE IF NOT EXISTS public.quote_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  file_key          TEXT NOT NULL,
  file_name         TEXT,
  file_type         TEXT,
  file_size         BIGINT,
  category          TEXT NOT NULL DEFAULT 'normal' CHECK (category IN ('normal', 'antes', 'depois')),
  uploaded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_hash         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_attachments_quote_id ON public.quote_attachments(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_attachments_category ON public.quote_attachments(category);
CREATE INDEX IF NOT EXISTS idx_quote_attachments_hash ON public.quote_attachments(file_hash);

ALTER TABLE public.quote_attachments ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.quote_attachments FROM PUBLIC, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.quote_attachments TO service_role;

DROP POLICY IF EXISTS quote_attachments_select ON public.quote_attachments;
CREATE POLICY quote_attachments_select ON public.quote_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_attachments.quote_id
        AND q.partner_id IN (SELECT public.get_user_partner_ids())
        AND (q.store_id IS NULL OR public.user_has_store_access(q.store_id))
    )
  );

COMMIT;

