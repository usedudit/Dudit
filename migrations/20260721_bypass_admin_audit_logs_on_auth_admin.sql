-- Recreate prevent_audit_log_modification function to allow Supabase Auth Admin to update/delete reference fields during user deletion
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF session_user = 'supabase_auth_admin' OR current_user = 'supabase_auth_admin' THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSE
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION 'admin_audit_logs is immutable. UPDATE and DELETE are forbidden.';
  RETURN NULL;
END;
$$;
