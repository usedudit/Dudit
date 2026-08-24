-- ============================================================================
-- FEEDBACK SYSTEM - Real User Feedback Collection & Discord Integration
-- ============================================================================

BEGIN;

-- ─── 1. feedbacks table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('onboarding', 'help_article', 'general', 'bug')),
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    message TEXT NOT NULL,
    page_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feedbacks IS 'Stores real user feedback across onboarding, help center, bugs, and general suggestions.';

CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at
    ON public.feedbacks (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id
    ON public.feedbacks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedbacks_partner_id
    ON public.feedbacks (partner_id, created_at DESC)
    WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feedbacks_type_status
    ON public.feedbacks (type, status, created_at DESC);

-- ─── 2. feedback_prompts table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedback_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT unique_prompt_user_partner_type UNIQUE (user_id, partner_id, type)
);

COMMENT ON TABLE public.feedback_prompts IS 'Tracks prompt presentation lifecycle (e.g. ERP onboarding after 7 days) per user and partner.';

CREATE INDEX IF NOT EXISTS idx_feedback_prompts_lookup
    ON public.feedback_prompts (user_id, partner_id, type);

-- ─── 3. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_prompts ENABLE ROW LEVEL SECURITY;

-- feedbacks: Authenticated users can insert their own feedback
CREATE POLICY "Users can create own feedbacks"
    ON public.feedbacks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- feedbacks: Users can view their own feedbacks
CREATE POLICY "Users can view own feedbacks"
    ON public.feedbacks FOR SELECT
    USING (auth.uid() = user_id);

-- feedbacks: Admins can manage all feedbacks
CREATE POLICY "Admins can manage all feedbacks"
    ON public.feedbacks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin', 'moderator')
        )
    );

-- feedback_prompts: Users can create and manage their own prompt status
CREATE POLICY "Users can create own feedback prompts"
    ON public.feedback_prompts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own feedback prompts"
    ON public.feedback_prompts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback prompts"
    ON public.feedback_prompts FOR UPDATE
    USING (auth.uid() = user_id);

-- feedback_prompts: Admins can manage all feedback prompts
CREATE POLICY "Admins can manage all feedback prompts"
    ON public.feedback_prompts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin', 'moderator')
        )
    );

COMMIT;
