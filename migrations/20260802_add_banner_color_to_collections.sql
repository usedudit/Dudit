-- ============================================================================
-- Migration: Add banner_color to collections
-- ============================================================================
-- Add banner_color column to store the avatar color class for consistent
-- avatar/banner matching (like stores/partners)
-- ============================================================================

ALTER TABLE collections
ADD COLUMN IF NOT EXISTS banner_color TEXT;

-- Update existing collections with random colors
UPDATE collections
SET banner_color = (
  CASE (floor(random() * 8)::int)
    WHEN 0 THEN 'bg-red-400'
    WHEN 1 THEN 'bg-orange-400'
    WHEN 2 THEN 'bg-yellow-400'
    WHEN 3 THEN 'bg-green-400'
    WHEN 4 THEN 'bg-blue-400'
    WHEN 5 THEN 'bg-indigo-400'
    WHEN 6 THEN 'bg-purple-400'
    WHEN 7 THEN 'bg-pink-400'
  END
)
WHERE banner_color IS NULL;

-- Update cover_url to match banner_color for existing collections
UPDATE collections
SET cover_url = (
  CASE banner_color
    WHEN 'bg-red-400' THEN 'https://img.dudit.com.br/static/banners/default/Red.png'
    WHEN 'bg-orange-400' THEN 'https://img.dudit.com.br/static/banners/default/Orange.png'
    WHEN 'bg-yellow-400' THEN 'https://img.dudit.com.br/static/banners/default/Yellow.png'
    WHEN 'bg-green-400' THEN 'https://img.dudit.com.br/static/banners/default/Green.png'
    WHEN 'bg-blue-400' THEN 'https://img.dudit.com.br/static/banners/default/Blue.png'
    WHEN 'bg-indigo-400' THEN 'https://img.dudit.com.br/static/banners/default/Purple.png'
    WHEN 'bg-purple-400' THEN 'https://img.dudit.com.br/static/banners/default/Purple.png'
    WHEN 'bg-pink-400' THEN 'https://img.dudit.com.br/static/banners/default/Pink.png'
    ELSE 'https://img.dudit.com.br/static/banners/default/Blue.png'
  END
)
WHERE cover_url IS NULL OR cover_url NOT LIKE 'https://img.dudit.com.br/static/banners/default/%';