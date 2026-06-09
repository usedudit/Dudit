-- ============================================================================
-- Notification preferences & type constraint update
-- ============================================================================

BEGIN;

-- ─── 1. Update CHECK constraint to include new types ───────────────────────

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
    'admin_announcement'
  ));

-- ─── 2. Notification preferences ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT notification_preferences_user_type_unique UNIQUE (user_id, type)
);

COMMENT ON TABLE public.notification_preferences IS 'Per-user notification preferences per type.';
COMMENT ON COLUMN public.notification_preferences.enabled IS 'Global toggle for this notification type (in-app + push).';
COMMENT ON COLUMN public.notification_preferences.push_enabled IS 'Separate toggle for push delivery only.';

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
    ON public.notification_preferences (user_id);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_select_own ON public.notification_preferences;
CREATE POLICY notification_preferences_select_own ON public.notification_preferences
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_preferences_insert_own ON public.notification_preferences;
CREATE POLICY notification_preferences_insert_own ON public.notification_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_preferences_update_own ON public.notification_preferences;
CREATE POLICY notification_preferences_update_own ON public.notification_preferences
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_preferences_delete_own ON public.notification_preferences;
CREATE POLICY notification_preferences_delete_own ON public.notification_preferences
    FOR DELETE USING (auth.uid() = user_id);

COMMIT;
