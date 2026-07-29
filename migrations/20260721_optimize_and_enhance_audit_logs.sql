-- 1. Add snapshot and multi-store columns to audit_logs
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS partner_name text,
  ADD COLUMN IF NOT EXISTS actor_name text,
  ADD COLUMN IF NOT EXISTS actor_email text;

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON public.audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON public.audit_logs(actor_email);

-- 3. Automatic synchronization trigger for legacy & timeline columns
CREATE OR REPLACE FUNCTION public.sync_audit_log_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Sync user_id / actor_user_id
  IF NEW.actor_user_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.user_id := NEW.actor_user_id;
  ELSIF NEW.user_id IS NOT NULL AND NEW.actor_user_id IS NULL THEN
    NEW.actor_user_id := NEW.user_id;
  END IF;

  -- Sync table_name / entity_type
  IF NEW.entity_type IS NOT NULL AND (NEW.table_name IS NULL OR NEW.table_name = '' OR NEW.table_name = 'system') THEN
    NEW.table_name := NEW.entity_type;
  ELSIF NEW.table_name IS NOT NULL AND (NEW.entity_type IS NULL OR NEW.entity_type = '' OR NEW.entity_type = 'system') THEN
    NEW.entity_type := NEW.table_name;
  END IF;

  -- Sync action / action_type
  IF NEW.action_type IS NOT NULL AND (NEW.action IS NULL OR NEW.action = '' OR NEW.action = 'UNKNOWN') THEN
    NEW.action := UPPER(NEW.action_type);
  ELSIF NEW.action IS NOT NULL AND (NEW.action_type IS NULL OR NEW.action_type = '') THEN
    NEW.action_type := LOWER(NEW.action);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_audit_log_fields ON public.audit_logs;
CREATE TRIGGER trg_sync_audit_log_fields
  BEFORE INSERT OR UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_audit_log_fields();

-- 4. Optimized Diff-only audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_diff jsonb := '{}'::jsonb;
  v_new_diff jsonb := '{}'::jsonb;
  v_key text;
  v_old_val jsonb;
  v_new_val jsonb;
  v_old_json jsonb;
  v_new_json jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
  v_partner_name text;
  v_store_name text;
  v_partner_id uuid;
  v_store_id uuid;
BEGIN
  -- Try resolving actor details from user_profiles if auth.uid() is set
  IF v_actor_id IS NOT NULL THEN
    SELECT
      COALESCE(NULLIF(trim(up.full_name), ''), 'Usuário'),
      au.email
    INTO v_actor_name, v_actor_email
    FROM public.user_profiles up
    LEFT JOIN auth.users au ON au.id = up.user_id
    WHERE up.user_id = v_actor_id;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_old_json := row_to_json(OLD)::jsonb;
    v_partner_id := (v_old_json->>'partner_id')::uuid;
    v_store_id := (v_old_json->>'store_id')::uuid;

    IF v_partner_id IS NOT NULL THEN
      SELECT store_name INTO v_partner_name FROM public.partners WHERE id = v_partner_id;
    END IF;
    IF v_store_id IS NOT NULL THEN
      SELECT name INTO v_store_name FROM public.stores WHERE id = v_store_id;
    END IF;

    INSERT INTO public.audit_logs (
      table_name, action, old_values, user_id, actor_user_id, partner_id, store_id,
      actor_name, actor_email, partner_name, store_name
    )
    VALUES (
      TG_TABLE_NAME, TG_OP, v_old_json, v_actor_id, v_actor_id, v_partner_id, v_store_id,
      v_actor_name, v_actor_email, v_partner_name, v_store_name
    );
    RETURN OLD;

  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_json := row_to_json(OLD)::jsonb;
    v_new_json := row_to_json(NEW)::jsonb;
    v_partner_id := COALESCE((v_new_json->>'partner_id')::uuid, (v_old_json->>'partner_id')::uuid);
    v_store_id := COALESCE((v_new_json->>'store_id')::uuid, (v_old_json->>'store_id')::uuid);

    -- Calculate DIFF only for changed fields
    FOR v_key IN SELECT jsonb_object_keys(v_new_json) LOOP
      v_old_val := v_old_json->v_key;
      v_new_val := v_new_json->v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_old_diff := jsonb_set(v_old_diff, ARRAY[v_key], COALESCE(v_old_val, 'null'::jsonb));
        v_new_diff := jsonb_set(v_new_diff, ARRAY[v_key], COALESCE(v_new_val, 'null'::jsonb));
      END IF;
    END LOOP;

    -- Only insert log if there was an actual change
    IF v_old_diff != '{}'::jsonb OR v_new_diff != '{}'::jsonb THEN
      IF v_partner_id IS NOT NULL THEN
        SELECT store_name INTO v_partner_name FROM public.partners WHERE id = v_partner_id;
      END IF;
      IF v_store_id IS NOT NULL THEN
        SELECT name INTO v_store_name FROM public.stores WHERE id = v_store_id;
      END IF;

      INSERT INTO public.audit_logs (
        table_name, action, old_values, new_values, user_id, actor_user_id, partner_id, store_id,
        actor_name, actor_email, partner_name, store_name
      )
      VALUES (
        TG_TABLE_NAME, TG_OP, v_old_diff, v_new_diff, v_actor_id, v_actor_id, v_partner_id, v_store_id,
        v_actor_name, v_actor_email, v_partner_name, v_store_name
      );
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'INSERT') THEN
    v_new_json := row_to_json(NEW)::jsonb;
    v_partner_id := (v_new_json->>'partner_id')::uuid;
    v_store_id := (v_new_json->>'store_id')::uuid;

    IF v_partner_id IS NOT NULL THEN
      SELECT store_name INTO v_partner_name FROM public.partners WHERE id = v_partner_id;
    END IF;
    IF v_store_id IS NOT NULL THEN
      SELECT name INTO v_store_name FROM public.stores WHERE id = v_store_id;
    END IF;

    INSERT INTO public.audit_logs (
      table_name, action, new_values, user_id, actor_user_id, partner_id, store_id,
      actor_name, actor_email, partner_name, store_name
    )
    VALUES (
      TG_TABLE_NAME, TG_OP, v_new_json, v_actor_id, v_actor_id, v_partner_id, v_store_id,
      v_actor_name, v_actor_email, v_partner_name, v_store_name
    );
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- 5. Immutability protection for audit_logs
CREATE OR REPLACE FUNCTION public.prevent_audit_log_user_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF session_user = 'supabase_auth_admin' OR current_user = 'supabase_auth_admin' THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSE
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION 'audit_logs is immutable. UPDATE and DELETE are forbidden.';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_user_update ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_prevent_audit_log_user_delete ON public.audit_logs;

CREATE TRIGGER trg_prevent_audit_log_user_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_user_modification();

CREATE TRIGGER trg_prevent_audit_log_user_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_user_modification();
