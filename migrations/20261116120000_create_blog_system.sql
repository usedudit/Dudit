-- ============================================================================
-- Blog / Portal de Dicas da Dudit ("Blog do Dino")
-- ============================================================================
-- Public editorial content managed by the admin panel.
-- Reads are public for published posts; writes are service-role only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    subtitle TEXT,
    excerpt TEXT,
    content TEXT NOT NULL DEFAULT '',
    cover_image_url TEXT,
    cover_image_alt TEXT,
    category TEXT NOT NULL DEFAULT 'geral',
    tags TEXT[] NOT NULL DEFAULT '{}',
    author_name TEXT NOT NULL DEFAULT 'Equipe Dudit',
    author_role TEXT NOT NULL DEFAULT 'Time Dudit',
    status TEXT NOT NULL DEFAULT 'draft',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT[] NOT NULL DEFAULT '{}',
    key_takeaways TEXT[] NOT NULL DEFAULT '{}',
    faq JSONB NOT NULL DEFAULT '[]'::jsonb,
    reading_time_minutes INTEGER NOT NULL DEFAULT 1,
    views_count BIGINT NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blog_posts_status_check CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT blog_posts_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT blog_posts_reading_time_check CHECK (reading_time_minutes >= 0),
    CONSTRAINT blog_posts_faq_is_array CHECK (jsonb_typeof(faq) = 'array')
);

COMMENT ON TABLE public.blog_posts IS 'Editorial blog posts for the Dudit tips portal (Blog do Dino).';
COMMENT ON COLUMN public.blog_posts.content IS 'Sanitized rich-text HTML. Always re-sanitize before rendering.';
COMMENT ON COLUMN public.blog_posts.faq IS 'Array of {question, answer} objects used for FAQPage structured data.';

CREATE INDEX IF NOT EXISTS idx_blog_posts_publication
    ON public.blog_posts (status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_category_publication
    ON public.blog_posts (category, status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_featured
    ON public.blog_posts (is_featured, published_at DESC)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_blog_posts_tags
    ON public.blog_posts USING GIN (tags);

-- Full-text search over the fields shown in listings.
-- Tags are intentionally excluded: array_to_string() is STABLE, not IMMUTABLE,
-- so it cannot be used in an index expression. Tag search is handled in the app.
CREATE INDEX IF NOT EXISTS idx_blog_posts_search
    ON public.blog_posts
    USING GIN (
        to_tsvector(
            'portuguese',
            coalesce(title, '') || ' ' || coalesce(subtitle, '') || ' ' || coalesce(excerpt, '')
        )
    );

-- Keep updated_at fresh on every write.
DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER update_blog_posts_updated_at
    BEFORE UPDATE ON public.blog_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published blog posts" ON public.blog_posts;
CREATE POLICY "Public can read published blog posts"
    ON public.blog_posts
    FOR SELECT
    TO anon, authenticated
    USING (status = 'published' AND published_at IS NOT NULL AND published_at <= NOW());

-- Writes are intentionally not exposed to anon/authenticated.
REVOKE INSERT, UPDATE, DELETE ON public.blog_posts FROM anon, authenticated;
GRANT SELECT ON public.blog_posts TO anon, authenticated;

-- ─── Admin audit support ────────────────────────────────────────────────────
ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_target_type_check;
ALTER TABLE public.admin_audit_logs
ADD CONSTRAINT admin_audit_logs_target_type_check
CHECK (target_type IN (
    'user', 'partner', 'product', 'service', 'subscription',
    'system', 'review', 'return_request', 'advertisement',
    'marketplace_synonym_group', 'marketplace_synonym_term',
    'delivery_driver', 'community_video', 'refund_request', 'purchase', 'payment',
    'service_order', 'quote', 'promotion', 'blog_post'
));
