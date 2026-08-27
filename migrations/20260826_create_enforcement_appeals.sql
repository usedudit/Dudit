-- Migration: Create enforcement_appeals table
-- Handles official appeal submissions for suspended stores, ERP accounts, partners, and banned users.
-- Prevents duplicate/spam submissions and tracks moderation review status.

CREATE TABLE IF NOT EXISTS public.enforcement_appeals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('store', 'partner', 'erp', 'user')),
    entity_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_name TEXT,
    user_phone TEXT,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    reason TEXT,
    appeal_statement TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
    admin_notes TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enforcement_appeals_case_id 
    ON public.enforcement_appeals(case_id);

CREATE INDEX IF NOT EXISTS idx_enforcement_appeals_entity 
    ON public.enforcement_appeals(entity_id, status);

CREATE INDEX IF NOT EXISTS idx_enforcement_appeals_user 
    ON public.enforcement_appeals(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.enforcement_appeals ENABLE ROW LEVEL SECURITY;

-- Users can view their own appeals
CREATE POLICY "Users can view own appeals"
    ON public.enforcement_appeals
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can insert an appeal for themselves
CREATE POLICY "Users can create own appeals"
    ON public.enforcement_appeals
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
