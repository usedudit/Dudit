-- ============================================================================
-- Add cart_abandoned notification type for cart recovery sweeps
-- ============================================================================

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'order_created',
    'order_paid',
    'order_shipped',
    'order_delivered',
    'order_cancelled',
    'order_refunded',
    'appointment_created',
    'appointment_confirmed',
    'appointment_reminder',
    'appointment_cancelled',
    'subscription_created',
    'subscription_renewed',
    'message_received',
    'admin_announcement',
    'low_stock',
    'replenishment_suggested',
    'xml_import_completed',
    'cart_abandoned'
  ));

COMMIT;
