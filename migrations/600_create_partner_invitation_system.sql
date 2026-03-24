-- ============================================================================
-- 600: Partner Invitation System
-- Creates partner_users and partner_invitations tables
-- Migrates existing partner owners into partner_users as OWNER
-- ============================================================================

-- ─── 1. partner_users ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_users (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id      uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'VIEWER'
                  CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'EDITOR', 'VIEWER')),
  permissions     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,  -- NULL for migrated owners
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partner_users_unique UNIQUE (partner_id, user_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_partner_users_user_id    ON partner_users(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_users_partner_id ON partner_users(partner_id);

-- ─── 2. partner_invitations ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_invitations (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id          uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  email               text,                         -- optional, informational
  token_hash          text NOT NULL,                 -- SHA-256 hash
  role                text NOT NULL DEFAULT 'VIEWER'
                      CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'EDITOR', 'VIEWER')),
  permissions         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id  uuid NOT NULL REFERENCES auth.users(id),
  created_by_role     text NOT NULL,
  expires_at          timestamptz NOT NULL,
  used_at             timestamptz,
  used_by             uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique index on token_hash for O(1) lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_invitations_token_hash
  ON partner_invitations(token_hash);

-- Index for listing invitations by partner
CREATE INDEX IF NOT EXISTS idx_partner_invitations_partner_id
  ON partner_invitations(partner_id);

-- ─── 3. Migrate existing partner owners ─────────────────────────────────────
-- Insert every existing partner owner into partner_users with OWNER role
-- and full permissions. ON CONFLICT DO NOTHING to make this idempotent.

INSERT INTO partner_users (partner_id, user_id, role, permissions, created_by_user_id)
SELECT
  p.id,
  p.user_id,
  'OWNER',
  '{
    "products":  {"view":true,"create":true,"edit":true,"delete":true},
    "services":  {"view":true,"create":true,"edit":true,"delete":true},
    "orders":    {"view":true,"create":true,"edit":true,"delete":true},
    "financial": {"view":true,"create":true,"edit":true,"delete":true},
    "customers": {"view":true,"create":true,"edit":true,"delete":true}
  }'::jsonb,
  NULL  -- no inviter for migrated owners
FROM partners p
ON CONFLICT (partner_id, user_id) DO NOTHING;

-- ─── 4. RLS Policies ────────────────────────────────────────────────────────

ALTER TABLE partner_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_invitations ENABLE ROW LEVEL SECURITY;

-- partner_users: users can read rows for partners they belong to
CREATE POLICY "partner_users_select" ON partner_users
  FOR SELECT USING (
    user_id = auth.uid()
    OR partner_id IN (
      SELECT pu.partner_id FROM partner_users pu WHERE pu.user_id = auth.uid()
    )
  );

-- partner_users: only service role inserts (via admin client)
-- No insert policy for anon/authenticated — server actions use admin client

-- partner_invitations: members can read invitations for their partner
CREATE POLICY "partner_invitations_select" ON partner_invitations
  FOR SELECT USING (
    partner_id IN (
      SELECT pu.partner_id FROM partner_users pu WHERE pu.user_id = auth.uid()
    )
  );

-- partner_invitations: only service role inserts/updates
-- No insert/update policy for anon/authenticated
