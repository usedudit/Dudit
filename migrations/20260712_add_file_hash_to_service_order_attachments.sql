-- Migration to add file_hash column for file integrity, deduplication, and auditing
ALTER TABLE public.service_order_attachments 
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Index for hashing/deduplication queries
CREATE INDEX IF NOT EXISTS idx_so_attachments_hash ON public.service_order_attachments(file_hash);
