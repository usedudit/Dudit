-- Store only hashes of public refund bearer tokens. Raw tokens are returned to
-- the caller once and can be reissued by an authenticated partner action.
CREATE TABLE IF NOT EXISTS public.billing_refund_public_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_request_id UUID NOT NULL REFERENCES public.billing_refund_requests(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_refund_public_tokens_request
  ON public.billing_refund_public_tokens (refund_request_id, created_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE public.billing_refund_public_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_refund_public_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_refund_public_tokens TO service_role;

-- Preserve every existing public link by hashing it before removing plaintext.
INSERT INTO public.billing_refund_public_tokens (refund_request_id, token_hash, created_at)
SELECT id, encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex'), created_at
FROM public.billing_refund_requests
WHERE token IS NOT NULL
ON CONFLICT (token_hash) DO NOTHING;

ALTER TABLE public.billing_refund_requests
  ALTER COLUMN token DROP NOT NULL,
  ALTER COLUMN token DROP DEFAULT;

UPDATE public.billing_refund_requests
SET token = NULL
WHERE token IS NOT NULL;
