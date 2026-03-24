-- 1. First, sanitize any existing data that might violate the new constraint.
--    We'll safely default any unrecognized roles to 'VIEWER'.
UPDATE public.partner_invitations 
SET role = 'VIEWER' 
WHERE role NOT IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'DELIVERY', 'VIEWER');

UPDATE public.partner_users 
SET role = 'VIEWER' 
WHERE role NOT IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'DELIVERY', 'VIEWER');

-- 2. Drop the existing constraints
ALTER TABLE public.partner_invitations DROP CONSTRAINT IF EXISTS partner_invitations_role_check;
ALTER TABLE public.partner_users DROP CONSTRAINT IF EXISTS partner_users_role_check;

-- 3. Add the updated constraints
ALTER TABLE public.partner_invitations ADD CONSTRAINT partner_invitations_role_check 
CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'DELIVERY', 'VIEWER'));

ALTER TABLE public.partner_users ADD CONSTRAINT partner_users_role_check 
CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'DELIVERY', 'VIEWER'));
