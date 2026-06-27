-- ============================================================================
-- Notification system: in-app center + FCM push (database is source of truth)
-- ============================================================================

BEGIN;

-- ─── notifications ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'order_created',
        'order_paid',
        'order_shipped',
        'order_delivered',
        'appointment_created',
        'appointment_confirmed',
        'appointment_reminder',
        'appointment_cancelled',
        'subscription_created',
        'subscription_renewed',
        'message_received',
        'admin_announcement'
    )),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT notifications_idempotency_key_unique UNIQUE (idempotency_key)
);

COMMENT ON TABLE public.notifications IS 'In-app notification center - always persisted before push delivery.';
COMMENT ON COLUMN public.notifications.idempotency_key IS 'Race-safe dedup key: {type}:{entity}:{user}:{variant}';

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications (user_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications (user_id, created_at DESC)
    WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_entity
    ON public.notifications (entity_type, entity_id)
    WHERE entity_id IS NOT NULL;

-- ─── push_subscriptions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    device_name TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT push_subscriptions_user_token_unique UNIQUE (user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON public.push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_fcm_token
    ON public.push_subscriptions (fcm_token);

-- ─── delivery audit log ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('push', 'in_app')),
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
    push_subscription_id UUID REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification
    ON public.notification_delivery_log (notification_id, created_at DESC);

-- ─── scheduled jobs (appointment reminders) ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
    run_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_scheduled_jobs_pending
    ON public.notification_scheduled_jobs (run_at)
    WHERE status = 'pending';

-- ─── RLS: notifications ─────────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Inserts only via service role (server-side creation)

-- ─── RLS: push_subscriptions ───────────────────────────────────────────────

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
    FOR DELETE USING (auth.uid() = user_id);

-- ─── RLS: delivery log (read own notifications only) ───────────────────────

ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_delivery_log_select_own ON public.notification_delivery_log;
CREATE POLICY notification_delivery_log_select_own ON public.notification_delivery_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE n.id = notification_delivery_log.notification_id
              AND n.user_id = auth.uid()
        )
    );

-- ─── Batch mark read (server-side via RPC for authenticated users) ─────────

CREATE OR REPLACE FUNCTION public.mark_notifications_read(
    p_notification_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_notification_ids IS NULL OR cardinality(p_notification_ids) = 0 THEN
        RETURN 0;
    END IF;

    UPDATE public.notifications
    SET is_read = true,
        read_at = COALESCE(read_at, now())
    WHERE id = ANY(p_notification_ids)
      AND user_id = auth.uid()
      AND is_read = false;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notifications_read(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;

-- ─── Unread count helper ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::bigint
    FROM public.notifications
    WHERE user_id = auth.uid()
      AND is_read = false;
$$;

REVOKE ALL ON FUNCTION public.get_unread_notification_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;

-- ─── Realtime publication ───────────────────────────────────────────────────

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN others THEN NULL;
        END;
    END IF;
END $$;

COMMIT;
