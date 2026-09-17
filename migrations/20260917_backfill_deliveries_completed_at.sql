-- Migration: Backfill `completed_at` on already-cancelled/failed deliveries so the
-- ERP "Entregas" cards can display when the delivery was concluded.
-- No new columns are added (completed_at already exists).
-- Best-effort: only fills rows that have a matching delivery_status_changed
-- audit log entry pointing to a cancelled/failed status; leaves others NULL.

UPDATE public.deliveries d
SET completed_at = (
  SELECT al.created_at
  FROM public.audit_logs al
  WHERE al.entity_type = 'delivery'
    AND al.entity_id = d.id
    AND al.action_type = 'delivery_status_changed'
    AND (al.metadata->>'newStatus') IN ('cancelled', 'delivery_failed')
  ORDER BY al.created_at DESC
  LIMIT 1
)
WHERE d.status IN ('cancelled', 'delivery_failed')
  AND d.completed_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.audit_logs al
    WHERE al.entity_type = 'delivery'
      AND al.entity_id = d.id
      AND al.action_type = 'delivery_status_changed'
      AND (al.metadata->>'newStatus') IN ('cancelled', 'delivery_failed')
  );
