-- Remove deprecated VIEWER role from partner access model.
-- New valid roles: OWNER, ADMIN, MANAGER, OPERATOR, DELIVERY.

BEGIN;

-- 1) Normalize existing VIEWER rows to OPERATOR (closest operational profile).
UPDATE public.partner_users
SET role = 'OPERATOR'
WHERE role = 'VIEWER';

UPDATE public.partner_invitations
SET role = 'OPERATOR'
WHERE role = 'VIEWER';

-- 2) Ensure defaults never point to deprecated roles.
ALTER TABLE public.partner_users
  ALTER COLUMN role SET DEFAULT 'OPERATOR';

ALTER TABLE public.partner_invitations
  ALTER COLUMN role SET DEFAULT 'OPERATOR';

-- 3) Rebuild role checks without VIEWER.
ALTER TABLE public.partner_users
  DROP CONSTRAINT IF EXISTS partner_users_role_check;

ALTER TABLE public.partner_users
  ADD CONSTRAINT partner_users_role_check
  CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'DELIVERY'));

ALTER TABLE public.partner_invitations
  DROP CONSTRAINT IF EXISTS partner_invitations_role_check;

ALTER TABLE public.partner_invitations
  ADD CONSTRAINT partner_invitations_role_check
  CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'DELIVERY'));

COMMIT;
