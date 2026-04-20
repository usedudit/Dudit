-- Allow transactions without a legacy text category (UI shows "-").
ALTER TABLE public.transactions
  ALTER COLUMN category DROP NOT NULL;

ALTER TABLE public.transactions
  ALTER COLUMN category DROP DEFAULT;
