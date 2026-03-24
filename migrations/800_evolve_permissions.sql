-- ============================================================================
-- Migration: Evolve Permission System
-- Adds OPERATOR and DELIVERY roles, migrates EDITOR → OPERATOR
-- ============================================================================

-- 1. Migrate existing EDITOR users to OPERATOR
UPDATE public.partner_users
SET role = 'OPERATOR'
WHERE role = 'EDITOR';

-- 2. Add check constraint for valid roles (if not already present)
-- This ensures only valid role values can be stored
DO $$
BEGIN
    -- Drop old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'partner_users_role_check'
    ) THEN
        ALTER TABLE public.partner_users DROP CONSTRAINT partner_users_role_check;
    END IF;

    -- Add updated constraint with new roles
    ALTER TABLE public.partner_users
    ADD CONSTRAINT partner_users_role_check
    CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'DELIVERY', 'VIEWER'));
END $$;

-- 3. Log the migration in audit_logs
INSERT INTO public.audit_logs (table_name, action, new_values)
VALUES (
    'partner_users',
    'migration.roles_evolved',
    jsonb_build_object(
        'description', 'Evolved permission system: EDITOR → OPERATOR, added DELIVERY role',
        'old_roles', '["OWNER","ADMIN","MANAGER","EDITOR","VIEWER"]',
        'new_roles', '["OWNER","ADMIN","MANAGER","OPERATOR","DELIVERY","VIEWER"]',
        'migrated_at', now()
    )
);
