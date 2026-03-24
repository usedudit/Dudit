-- ============================================
-- DIAGNOSTIC SCRIPT: Check user_profiles RLS policies
-- ============================================
-- This script helps verify that the RLS policies are correctly configured

-- Check all policies on user_profiles table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_profiles'
ORDER BY policyname;

-- Check table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_profiles'
ORDER BY ordinal_position;

-- Count profiles
SELECT COUNT(*) as total_profiles FROM user_profiles;

-- List recent profiles (last 10)
SELECT 
  user_id,
  full_name,
  pending_partner_registration,
  created_at,
  updated_at
FROM user_profiles
ORDER BY created_at DESC
LIMIT 10;
