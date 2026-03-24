-- Remove problematic RLS policies and recreate safe ones
-- This fixes "Could not find the 'city' column of 'partners' in the schema cache" errors

BEGIN;

-- Drop ALL RLS policies on partners table
DROP POLICY IF EXISTS "Enable read access for public users" ON partners;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON partners;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON partners;
DROP POLICY IF EXISTS "Enable update for owners" ON partners;
DROP POLICY IF EXISTS "Enable delete for owners" ON partners;
DROP POLICY IF EXISTS "Allow insert for new partners" ON partners;
DROP POLICY IF EXISTS "Allow read for own partner data" ON partners;
DROP POLICY IF EXISTS "Allow update for own partner" ON partners;
DROP POLICY IF EXISTS "Allow delete for own partner" ON partners;
DROP POLICY IF EXISTS "Enable insert access for authenticated users as partner" ON partners;

-- Disable RLS temporarily
ALTER TABLE partners DISABLE ROW LEVEL SECURITY;

-- Recreate minimal RLS policies without referencing address columns
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read partners
CREATE POLICY "Public read access" ON partners
  FOR SELECT USING (is_active = true);

-- Allow authenticated users to insert (if they're creating their own partner)
CREATE POLICY "Users can insert their own partner" ON partners
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow partners to update their own data
CREATE POLICY "Partners can update own data" ON partners
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow partners to delete their own
CREATE POLICY "Partners can delete own" ON partners
  FOR DELETE USING (auth.uid() = user_id);

COMMIT;
