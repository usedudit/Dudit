-- Drop the old profiles table since we're using user_profiles instead
-- This migration removes the outdated profiles table and its constraints

-- Drop policies on profiles table
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

-- Drop the profiles table (if it exists)
drop table if exists public.profiles cascade;
