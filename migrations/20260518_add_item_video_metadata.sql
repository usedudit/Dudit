-- Add optional single-video metadata for products and services.
-- Safe migration: only additive columns plus nullable constraints.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_type TEXT,
  ADD COLUMN IF NOT EXISTS video_thumbnail TEXT,
  ADD COLUMN IF NOT EXISTS video_duration INTEGER,
  ADD COLUMN IF NOT EXISTS video_provider_id TEXT;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS video_type TEXT,
  ADD COLUMN IF NOT EXISTS video_thumbnail TEXT,
  ADD COLUMN IF NOT EXISTS video_duration INTEGER,
  ADD COLUMN IF NOT EXISTS video_provider_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_video_type_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_video_type_check
      CHECK (video_type IS NULL OR video_type IN ('upload', 'youtube', 'vimeo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_video_type_check'
  ) THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_video_type_check
      CHECK (video_type IS NULL OR video_type IN ('upload', 'youtube', 'vimeo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_video_duration_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_video_duration_check
      CHECK (video_duration IS NULL OR (video_duration >= 10 AND video_duration <= 60));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_video_duration_check'
  ) THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_video_duration_check
      CHECK (video_duration IS NULL OR (video_duration >= 10 AND video_duration <= 60));
  END IF;
END $$;

