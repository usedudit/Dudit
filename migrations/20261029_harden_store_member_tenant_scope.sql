-- Keep each store membership inside the partner that owns both records.
-- The application also validates this relation, while these policies protect
-- direct authenticated Supabase writes that bypass Server Actions.

BEGIN;

-- Direct Supabase table mutations must follow the same role hierarchy as the
-- Server Actions. Keep the privileged lookup in one narrowly scoped function.
CREATE OR REPLACE FUNCTION public.can_manage_store_member(
  p_store_id uuid,
  p_partner_user_id uuid,
  p_role text,
  p_permissions jsonb,
  p_operation text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores s
    JOIN public.partner_users target ON target.id = p_partner_user_id
    LEFT JOIN public.partners owner ON owner.id = s.partner_id
    LEFT JOIN public.partner_users actor
      ON actor.partner_id = s.partner_id
     AND actor.user_id = (SELECT auth.uid())
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN owner.user_id = (SELECT auth.uid()) THEN 'owner'
        ELSE lower(coalesce(actor.role_id, actor.role, ''))
      END AS actor_role,
      lower(coalesce(target.role_id, target.role, 'delivery')) AS target_role,
      lower(coalesce(p_role, target.role_id, target.role, 'delivery')) AS assigned_role
    ) resolved
    WHERE s.id = p_store_id
      AND target.partner_id = s.partner_id
      AND s.partner_id IN (SELECT public.get_user_partner_ids())
      AND resolved.actor_role IN ('owner', 'admin', 'manager')
      AND CASE resolved.actor_role
        WHEN 'owner' THEN resolved.target_role <> 'owner'
        WHEN 'admin' THEN resolved.target_role IN ('manager', 'operator', 'delivery')
        WHEN 'manager' THEN resolved.target_role IN ('operator', 'delivery')
        ELSE false
      END
      AND CASE resolved.actor_role
        WHEN 'owner' THEN resolved.assigned_role IN ('admin', 'manager', 'operator', 'delivery')
        WHEN 'admin' THEN resolved.assigned_role IN ('admin', 'manager', 'operator', 'delivery')
        WHEN 'manager' THEN resolved.assigned_role IN ('operator', 'delivery')
        ELSE false
      END
      AND (p_permissions IS NULL OR resolved.actor_role IN ('owner', 'admin'))
      AND (p_operation <> 'delete' OR resolved.actor_role IN ('owner', 'admin'))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_store_member(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store_member(uuid, uuid, text, jsonb, text) TO authenticated;

DROP POLICY IF EXISTS "store_members_select" ON public.store_members;
CREATE POLICY "store_members_select" ON public.store_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      JOIN public.partner_users pu ON pu.id = store_members.partner_user_id
      WHERE s.id = store_members.store_id
        AND pu.partner_id = s.partner_id
        AND (
          pu.user_id = (SELECT auth.uid())
          OR s.partner_id IN (SELECT public.get_user_partner_ids())
        )
    )
  );

DROP POLICY IF EXISTS "store_members_insert" ON public.store_members;
CREATE POLICY "store_members_insert" ON public.store_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_store_member(
      store_members.store_id,
      store_members.partner_user_id,
      store_members.role,
      store_members.permissions,
      'write'
    )
  );

DROP POLICY IF EXISTS "store_members_update" ON public.store_members;
CREATE POLICY "store_members_update" ON public.store_members
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_store_member(
      store_members.store_id,
      store_members.partner_user_id,
      store_members.role,
      store_members.permissions,
      'write'
    )
  )
  WITH CHECK (
    public.can_manage_store_member(
      store_members.store_id,
      store_members.partner_user_id,
      store_members.role,
      store_members.permissions,
      'write'
    )
  );

DROP POLICY IF EXISTS "store_members_delete" ON public.store_members;
CREATE POLICY "store_members_delete" ON public.store_members
  FOR DELETE TO authenticated
  USING (
    public.can_manage_store_member(
      store_members.store_id,
      store_members.partner_user_id,
      store_members.role,
      NULL,
      'delete'
    )
  );

COMMIT;
