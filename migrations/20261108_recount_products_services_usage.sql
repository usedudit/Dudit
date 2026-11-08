-- Recount products/services usage counters.
--
-- The products_count / services_count counters are maintained by AFTER INSERT /
-- AFTER DELETE triggers, but the app soft-deletes (UPDATE status='deleted') and
-- archives (UPDATE status='arquivado'). Those UPDATEs never fired the triggers,
-- so counters could stay inflated after items left the countable set.
--
-- This one-time backfill aligns the counters with the same countable set used by
-- the app/archiver: non-deleted and non-archived rows.
-- Idempotent: safe to re-run.

BEGIN;

UPDATE public.usage_counters uc
SET products_count = (
        SELECT COUNT(*)::int
        FROM public.products p
        WHERE p.partner_id = uc.partner_id
          AND p.deleted_at IS NULL
          AND (p.status IS NULL OR p.status NOT IN ('deleted', 'arquivado', 'archived'))
    ),
    services_count = (
        SELECT COUNT(*)::int
        FROM public.services s
        WHERE s.partner_id = uc.partner_id
          AND s.deleted_at IS NULL
          AND (s.status IS NULL OR s.status NOT IN ('deleted', 'arquivado', 'archived'))
    ),
    updated_at = now();

COMMIT;
