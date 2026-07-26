-- Add store_id to community_videos
ALTER TABLE public.community_videos ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_community_videos_store ON public.community_videos(store_id);
