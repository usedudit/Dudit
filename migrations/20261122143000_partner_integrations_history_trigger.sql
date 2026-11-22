-- Automatic trigger on partner_integrations so ANY current or future integration
-- (Bling, Nuvemshop, Melhor Envio, etc.) automatically records connection &
-- disconnection history in partner_integration_history without needing manual TS calls.
--
-- Note: OAuth tokens, API keys, and secrets are NEVER copied into history.
-- Application helpers (recordIntegrationConnected) can still enrich the open row
-- with encrypted email / SHA-256 email hash / account label when available.

BEGIN;

CREATE OR REPLACE FUNCTION public.mask_compliance_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
  v_at INT;
  v_local TEXT;
  v_domain TEXT;
BEGIN
  v_clean := lower(trim(COALESCE(p_email, '')));
  v_at := position('@' IN v_clean);
  IF v_at <= 1 THEN
    RETURN NULL;
  END IF;

  v_local := substring(v_clean FROM 1 FOR v_at - 1);
  v_domain := substring(v_clean FROM v_at + 1);

  IF length(v_local) <= 2 THEN
    RETURN left(v_local, 1) || '***@' || v_domain;
  END IF;

  RETURN left(v_local, 1) || '***' || right(v_local, 1) || '@' || v_domain;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_partner_integration_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id TEXT;
  v_email_masked TEXT;
  v_connected_at TIMESTAMPTZ;
  v_disconnected_at TIMESTAMPTZ;
  v_existing_id UUID;
  v_closed_count INT := 0;
BEGIN
  -- 1. Handle DELETE of an active connection (skip during full account deletion purge)
  IF TG_OP = 'DELETE' THEN
    IF current_setting('dudit.bypass_payment_method_guard', true) = 'true' THEN
      RETURN OLD;
    END IF;

    IF OLD.status = 'connected' THEN
      v_disconnected_at := NOW();
      UPDATE public.partner_integration_history
      SET disconnected_at = v_disconnected_at,
          updated_at = v_disconnected_at
      WHERE partner_id = OLD.partner_id
        AND provider_slug = OLD.provider_slug
        AND disconnected_at IS NULL;

      GET DIAGNOSTICS v_closed_count = ROW_COUNT;

      IF v_closed_count = 0 THEN
        v_account_id := NULLIF(trim(COALESCE(OLD.account_id, '')), '');
        v_email_masked := public.mask_compliance_email(OLD.account_email);
        IF v_account_id IS NOT NULL OR v_email_masked IS NOT NULL THEN
          INSERT INTO public.partner_integration_history (
            partner_id,
            provider_slug,
            external_account_id,
            external_account_email_masked,
            connected_at,
            disconnected_at
          ) VALUES (
            OLD.partner_id,
            OLD.provider_slug,
            v_account_id,
            v_email_masked,
            COALESCE(OLD.connected_at, OLD.created_at, v_disconnected_at),
            v_disconnected_at
          );
        END IF;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- 2. Handle INSERT or UPDATE transitioning to / updating while 'connected'
  IF NEW.status = 'connected' AND (
    TG_OP = 'INSERT'
    OR OLD.status IS DISTINCT FROM 'connected'
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.account_email IS DISTINCT FROM OLD.account_email
  ) THEN
    v_account_id := NULLIF(trim(COALESCE(NEW.account_id, '')), '');
    v_email_masked := public.mask_compliance_email(NEW.account_email);
    v_connected_at := COALESCE(NEW.connected_at, NOW());

    SELECT id INTO v_existing_id
    FROM public.partner_integration_history
    WHERE partner_id = NEW.partner_id
      AND provider_slug = NEW.provider_slug
      AND disconnected_at IS NULL
      AND external_account_id IS NOT DISTINCT FROM v_account_id
    ORDER BY connected_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.partner_integration_history
      SET external_account_email_masked = COALESCE(v_email_masked, external_account_email_masked),
          updated_at = NOW()
      WHERE id = v_existing_id;
    ELSE
      -- Close any prior open row for a different external account
      UPDATE public.partner_integration_history
      SET disconnected_at = v_connected_at,
          updated_at = NOW()
      WHERE partner_id = NEW.partner_id
        AND provider_slug = NEW.provider_slug
        AND disconnected_at IS NULL;

      INSERT INTO public.partner_integration_history (
        partner_id,
        provider_slug,
        external_account_id,
        external_account_email_masked,
        connected_at,
        disconnected_at
      ) VALUES (
        NEW.partner_id,
        NEW.provider_slug,
        v_account_id,
        v_email_masked,
        v_connected_at,
        NULL
      );
    END IF;

    RETURN NEW;
  END IF;

  -- 3. Handle transition from 'connected' to 'disconnected'
  IF TG_OP = 'UPDATE' AND OLD.status = 'connected' AND NEW.status = 'disconnected' THEN
    v_disconnected_at := COALESCE(NEW.disconnected_at, NOW());

    UPDATE public.partner_integration_history
    SET disconnected_at = v_disconnected_at,
        updated_at = v_disconnected_at
    WHERE partner_id = NEW.partner_id
      AND provider_slug = NEW.provider_slug
      AND disconnected_at IS NULL;

    GET DIAGNOSTICS v_closed_count = ROW_COUNT;

    -- Backfill if the connection existed before this trigger was installed
    IF v_closed_count = 0 THEN
      v_account_id := NULLIF(trim(COALESCE(OLD.account_id, '')), '');
      v_email_masked := public.mask_compliance_email(OLD.account_email);
      IF v_account_id IS NOT NULL OR v_email_masked IS NOT NULL THEN
        INSERT INTO public.partner_integration_history (
          partner_id,
          provider_slug,
          external_account_id,
          external_account_email_masked,
          connected_at,
          disconnected_at
        ) VALUES (
          NEW.partner_id,
          NEW.provider_slug,
          v_account_id,
          v_email_masked,
          COALESCE(OLD.connected_at, OLD.created_at, v_disconnected_at),
          v_disconnected_at
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_partner_integration_history ON public.partner_integrations;

CREATE TRIGGER trg_sync_partner_integration_history
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_partner_integration_history();

COMMIT;
