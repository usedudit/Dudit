-- Fix OAuth: Populate full_name from auth display_name
UPDATE user_profiles up
SET full_name = (
  SELECT u.raw_user_meta_data->>'full_name' 
  FROM auth.users u 
  WHERE u.id = up.user_id
)
WHERE full_name IS NULL 
  AND user_id IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'full_name' IS NOT NULL
  );

-- Also update from display_name if available
UPDATE user_profiles up
SET full_name = (
  SELECT u.raw_user_meta_data->>'name'
  FROM auth.users u 
  WHERE u.id = up.user_id
)
WHERE full_name IS NULL 
  AND user_id IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'name' IS NOT NULL
  );

-- Fallback: generate from email for any remaining null values
UPDATE user_profiles up
SET full_name = SUBSTRING(
  (SELECT email FROM auth.users WHERE id = up.user_id),
  1,
  POSITION('@' IN (SELECT email FROM auth.users WHERE id = up.user_id)) - 1
)
WHERE full_name IS NULL
  AND user_id IN (SELECT id FROM auth.users);
