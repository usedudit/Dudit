-- ============================================================
-- FAVORITES / WISHLIST SYSTEM
-- Supports: produto, servico (future: parceiro, loja)
-- ============================================================

-- 1. Create the favorites table
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('produto', 'servico', 'parceiro', 'loja')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Unique composite index to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique
    ON public.favorites (user_id, item_id, item_type);

-- 3. Index for fast user lookups (favorites page)
CREATE INDEX IF NOT EXISTS idx_favorites_user_id
    ON public.favorites (user_id, created_at DESC);

-- 4. Index for fast item lookups (checking if item is favorited)
CREATE INDEX IF NOT EXISTS idx_favorites_item
    ON public.favorites (item_id, item_type);

-- 5. Index for analytics: counting favorites per item
CREATE INDEX IF NOT EXISTS idx_favorites_item_count
    ON public.favorites (item_id, item_type, created_at);

-- 6. RLS Policies
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- Users can read their own favorites
CREATE POLICY "Users can read own favorites"
    ON public.favorites
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own favorites
CREATE POLICY "Users can insert own favorites"
    ON public.favorites
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "Users can delete own favorites"
    ON public.favorites
    FOR DELETE
    USING (auth.uid() = user_id);

-- Service role bypass (for server actions)
CREATE POLICY "Service role full access on favorites"
    ON public.favorites
    FOR ALL
    USING (auth.role() = 'service_role');
