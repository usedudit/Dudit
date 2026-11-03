-- Private R2 objects are referenced by file_key and are served through
-- authorization-checked signed URLs. A public file_url is no longer required.
ALTER TABLE public.return_evidence
  ALTER COLUMN file_url DROP NOT NULL;

COMMENT ON COLUMN public.return_evidence.file_url IS
  'Legacy public URL when present; private evidence uses file_key and an authorized signed download URL.';
