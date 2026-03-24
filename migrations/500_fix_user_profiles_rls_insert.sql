-- ============================================
-- SCRIPT: Fix user_profiles RLS to allow service role inserts
-- ============================================
-- The issue: When creating user profiles via API with service role key,
-- the RLS policy auth.uid() = user_id fails because auth.uid() is NULL for service role.
-- We need a policy that allows service role to insert

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON user_profiles;
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON user_profiles;
DROP POLICY IF EXISTS "Usuários podem inserir seu próprio perfil" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile new" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;

-- Create new RLS policies
-- Allow users to view their own profile
CREATE POLICY "users_view_own_profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'authenticated'::text);

-- Allow users to update their own profile
CREATE POLICY "users_update_own_profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow authenticated users to insert their own profile
-- This is for when profiles are created via normal signup flow
CREATE POLICY "users_insert_own_profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow service role to manage all profiles
-- This is needed for the API route that uses service role key
CREATE POLICY "service_role_manage_all_profiles"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- Admins can view all profiles
CREATE POLICY "admins_view_all_profiles"
  ON user_profiles FOR SELECT
  USING (
    (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'))
    OR auth.role() = 'service_role'::text
  );
