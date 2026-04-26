-- ============================================================================
-- Audit Logs Compatibility Layer (legacy + timeline)
-- Ensures audit_logs works for both old and new writers/readers.
-- Safe, idempotent, non-destructive.
-- ============================================================================

-- 1) Ensure all required legacy and timeline columns exist
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS table_name text,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS old_values jsonb,
  ADD COLUMN IF NOT EXISTS new_values jsonb,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS partner_id uuid,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS change_lines text[],
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS source text;

-- 2) Set safe defaults for timeline fields (when missing)
ALTER TABLE public.audit_logs
  ALTER COLUMN source SET DEFAULT 'system';

UPDATE public.audit_logs
SET
  source = COALESCE(NULLIF(source, ''), 'system'),
  change_lines = COALESCE(change_lines, ARRAY['ação registrada.']::text[])
WHERE source IS NULL
   OR source = ''
   OR change_lines IS NULL;

-- 3) Keep user columns synchronized
UPDATE public.audit_logs
SET actor_user_id = user_id
WHERE actor_user_id IS NULL
  AND user_id IS NOT NULL;

UPDATE public.audit_logs
SET user_id = actor_user_id
WHERE user_id IS NULL
  AND actor_user_id IS NOT NULL;

-- 4) Backfill legacy columns from timeline columns
UPDATE public.audit_logs
SET
  table_name = COALESCE(NULLIF(table_name, ''), COALESCE(entity_type, 'system')),
  action = COALESCE(NULLIF(action, ''), UPPER(COALESCE(action_type, 'unknown'))),
  new_values = COALESCE(
    new_values,
    jsonb_build_object(
      'entity_type', entity_type,
      'entity_id', entity_id,
      'action_type', action_type,
      'change_lines', change_lines,
      'metadata', metadata,
      'source', source,
      'actor_user_id', actor_user_id,
      'created_at', created_at
    )
  )
WHERE table_name IS NULL
   OR table_name = ''
   OR action IS NULL
   OR action = ''
   OR new_values IS NULL;

-- 5) Backfill timeline columns from legacy columns
UPDATE public.audit_logs
SET
  entity_type = COALESCE(entity_type, NULLIF(table_name, '')),
  action_type = COALESCE(action_type, LOWER(NULLIF(action, ''))),
  metadata = COALESCE(metadata, new_values -> 'metadata', '{}'::jsonb),
  source = COALESCE(source, 'system'),
  change_lines = COALESCE(
    change_lines,
    CASE
      WHEN jsonb_typeof(new_values -> 'change_lines') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(new_values -> 'change_lines'))
      ELSE ARRAY['ação registrada.']::text[]
    END
  )
WHERE entity_type IS NULL
   OR action_type IS NULL
   OR metadata IS NULL
   OR change_lines IS NULL;

-- 6) Guarantee NOT NULL constraints for columns used by app/history
ALTER TABLE public.audit_logs
  ALTER COLUMN table_name SET NOT NULL,
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN change_lines SET NOT NULL;

-- 7) Helpful indexes for timeline + legacy access
CREATE INDEX IF NOT EXISTS idx_audit_logs_partner_timeline
  ON public.audit_logs(partner_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_partner_created
  ON public.audit_logs(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_action_created
  ON public.audit_logs(table_name, action, created_at DESC);

DO $$
BEGIN
  RAISE NOTICE '✅ audit_logs compatibility migration applied.';
END $$;
