BEGIN;

CREATE OR REPLACE FUNCTION public.create_finance_account_with_opening_balance_atomic(
  p_partner_id uuid,
  p_user_id uuid,
  p_store_id uuid,
  p_name text,
  p_type text,
  p_initial_balance numeric,
  p_current_balance numeric,
  p_is_default boolean,
  p_opening_transaction_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_account_id uuid;
  v_initial numeric;
  v_current numeric;
  v_should_default boolean;
  v_account_json jsonb;
BEGIN
  IF p_partner_id IS NULL OR p_user_id IS NULL
     OR p_name IS NULL OR btrim(p_name) = '' OR length(p_name) > 150
     OR p_type IS NULL OR p_type NOT IN ('cash', 'bank', 'wallet')
     OR p_initial_balance IS NULL OR p_current_balance IS NULL
     OR p_opening_transaction_date IS NULL
     OR abs(p_initial_balance) >= 1000000000000
     OR abs(p_current_balance) >= 1000000000000 THEN
    RAISE EXCEPTION 'Finance account values are invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.partners p WHERE p.id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner not found' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.partner_id = p_partner_id
  ) THEN
    RAISE EXCEPTION 'Store is outside this partner' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.finance_accounts fa
    WHERE fa.partner_id = p_partner_id AND lower(fa.name) = lower(btrim(p_name))
  ) THEN
    RAISE EXCEPTION 'A finance account with this name already exists' USING ERRCODE = '23505';
  END IF;

  v_initial := round(p_initial_balance, 2);
  v_current := round(p_current_balance, 2);
  INSERT INTO public.finance_accounts (
    partner_id, store_id, name, type, initial_balance, current_balance,
    is_active, is_default, is_system_managed, integration_source
  ) VALUES (
    p_partner_id, p_store_id, btrim(p_name), p_type, v_initial, 0,
    true, false, false, NULL
  ) RETURNING id INTO v_account_id;

  v_should_default := coalesce(p_is_default, false) OR NOT EXISTS (
    SELECT 1 FROM public.finance_accounts fa
    WHERE fa.partner_id = p_partner_id AND fa.type = p_type
      AND fa.is_default = true AND fa.id <> v_account_id
      AND fa.integration_source IS DISTINCT FROM 'mercadopago'
      AND fa.store_id IS NOT DISTINCT FROM p_store_id
  );
  IF v_should_default THEN
    UPDATE public.finance_accounts fa
    SET is_default = false, updated_at = now()
    WHERE fa.partner_id = p_partner_id AND fa.type = p_type
      AND fa.id <> v_account_id
      AND fa.integration_source IS DISTINCT FROM 'mercadopago'
      AND fa.store_id IS NOT DISTINCT FROM p_store_id;
    UPDATE public.finance_accounts
    SET is_default = true, updated_at = now()
    WHERE id = v_account_id AND partner_id = p_partner_id;
  END IF;

  IF abs(v_current) >= 0.005 THEN
    PERFORM public.create_manual_financial_transactions_atomic(
      p_partner_id,
      jsonb_build_array(jsonb_build_object(
        'partner_id', p_partner_id,
        'store_id', p_store_id,
        'description', 'Saldo inicial - ' || btrim(p_name),
        'category', 'Ajuste de saldo',
        'account_id', v_account_id,
        'amount', v_current,
        'due_date', NULL,
        'payment_date', p_opening_transaction_date,
        'transaction_date', p_opening_transaction_date,
        'status', 'paid',
        'payment_type', 'Ajuste',
        'original_amount', abs(v_current),
        'fee_amount', 0,
        'transaction_type', 'adjustment',
        'origin', 'manual',
        'created_by_user_id', p_user_id
      ))
    );
  END IF;

  SELECT jsonb_build_object(
    'id', fa.id, 'name', fa.name, 'type', fa.type,
    'initial_balance', fa.initial_balance, 'current_balance', fa.current_balance,
    'is_active', fa.is_active, 'is_default', fa.is_default,
    'created_at', fa.created_at, 'updated_at', fa.updated_at,
    'is_system_managed', fa.is_system_managed, 'integration_source', fa.integration_source
  ) INTO v_account_json
  FROM public.finance_accounts fa
  WHERE fa.id = v_account_id AND fa.partner_id = p_partner_id;
  RETURN jsonb_build_object('success', true, 'accountId', v_account_id, 'account', v_account_json);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_finance_account_atomic(
  p_partner_id uuid,
  p_account_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_account public.finance_accounts%ROWTYPE;
  v_patch record;
  v_name text;
  v_type text;
  v_will_default boolean;
  v_account_json jsonb;
BEGIN
  IF p_partner_id IS NULL OR p_account_id IS NULL
     OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR p_patch = '{}'::jsonb
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key)
       WHERE k.key NOT IN ('name', 'type', 'initial_balance', 'is_active', 'is_default')
     ) THEN
    RAISE EXCEPTION 'Finance account update values are invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.partners p WHERE p.id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found' USING ERRCODE = '42501'; END IF;

  SELECT fa.* INTO v_account
  FROM public.finance_accounts fa
  WHERE fa.id = p_account_id AND fa.partner_id = p_partner_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Finance account not found' USING ERRCODE = '42501'; END IF;

  SELECT x.* INTO v_patch
  FROM jsonb_to_record(p_patch) AS x(
    name text, type text, initial_balance numeric, is_active boolean, is_default boolean
  );
  v_name := CASE WHEN p_patch ? 'name' THEN btrim(v_patch.name) ELSE v_account.name END;
  v_type := CASE WHEN p_patch ? 'type' THEN v_patch.type ELSE v_account.type END;
  IF v_name IS NULL OR v_name = '' OR length(v_name) > 150
     OR v_type IS NULL OR v_type NOT IN ('cash', 'bank', 'wallet')
     OR (p_patch ? 'initial_balance' AND (
       v_patch.initial_balance IS NULL OR abs(v_patch.initial_balance) >= 1000000000000
     ))
     OR (p_patch ? 'is_active' AND v_patch.is_active IS NULL)
     OR (p_patch ? 'is_default' AND v_patch.is_default IS NULL) THEN
    RAISE EXCEPTION 'Finance account update values are invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.finance_accounts fa
    WHERE fa.partner_id = p_partner_id AND fa.id <> p_account_id
      AND lower(fa.name) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'A finance account with this name already exists' USING ERRCODE = '23505';
  END IF;

  v_will_default := CASE WHEN p_patch ? 'is_default'
    THEN v_patch.is_default ELSE v_account.is_default END;
  IF v_account.integration_source IS DISTINCT FROM 'mercadopago'
     AND v_will_default AND v_type IN ('cash', 'bank', 'wallet') THEN
    UPDATE public.finance_accounts fa
    SET is_default = false, updated_at = now()
    WHERE fa.partner_id = p_partner_id AND fa.type = v_type
      AND fa.id <> p_account_id
      AND fa.integration_source IS DISTINCT FROM 'mercadopago'
      AND fa.store_id IS NOT DISTINCT FROM v_account.store_id;
  END IF;

  UPDATE public.finance_accounts fa
  SET name = v_name,
      type = v_type,
      initial_balance = CASE WHEN p_patch ? 'initial_balance'
        THEN round(v_patch.initial_balance, 2) ELSE fa.initial_balance END,
      is_active = CASE WHEN p_patch ? 'is_active' THEN v_patch.is_active ELSE fa.is_active END,
      is_default = CASE WHEN p_patch ? 'is_default' THEN v_patch.is_default ELSE fa.is_default END,
      updated_at = now()
  WHERE fa.id = p_account_id AND fa.partner_id = p_partner_id;

  SELECT jsonb_build_object(
    'id', fa.id, 'name', fa.name, 'type', fa.type,
    'initial_balance', fa.initial_balance, 'current_balance', fa.current_balance,
    'is_active', fa.is_active, 'is_default', fa.is_default,
    'created_at', fa.created_at, 'updated_at', fa.updated_at,
    'is_system_managed', fa.is_system_managed, 'integration_source', fa.integration_source
  ) INTO v_account_json
  FROM public.finance_accounts fa
  WHERE fa.id = p_account_id AND fa.partner_id = p_partner_id;
  RETURN jsonb_build_object('success', true, 'accountId', p_account_id, 'account', v_account_json);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_appointment_payment_transaction_atomic(
  p_partner_id uuid,
  p_appointment_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_appointment_id uuid;
  v_reference_note text;
  v_existing_id uuid;
  v_created jsonb;
BEGIN
  IF p_partner_id IS NULL OR p_appointment_id IS NULL
     OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Appointment payment values are invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) <> 1 THEN
    RAISE EXCEPTION 'Appointment payment must contain one transaction' USING ERRCODE = '22023';
  END IF;

  SELECT a.id INTO v_appointment_id
  FROM public.appointments a
  WHERE a.id = p_appointment_id AND a.partner_id = p_partner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found for this partner' USING ERRCODE = '42501';
  END IF;

  v_reference_note := 'appointment:' || p_appointment_id::text || ':payment';
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(
      partner_id uuid, reference_note text, transaction_type text
    )
    WHERE r.partner_id IS DISTINCT FROM p_partner_id
       OR r.reference_note IS DISTINCT FROM v_reference_note
       OR r.transaction_type IS DISTINCT FROM 'income'
  ) THEN
    RAISE EXCEPTION 'Appointment transaction is outside the expected context'
      USING ERRCODE = '42501';
  END IF;

  SELECT t.id INTO v_existing_id
  FROM public.transactions t
  WHERE t.partner_id = p_partner_id AND t.reference_note = v_reference_note
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'transactionId', v_existing_id);
  END IF;

  v_created := public.create_manual_financial_transactions_atomic(p_partner_id, p_rows);
  v_existing_id := (v_created -> 'ids' ->> 0)::uuid;
  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'Appointment transaction was not created' USING ERRCODE = '40001';
  END IF;
  RETURN jsonb_build_object('success', true, 'alreadyProcessed', false, 'transactionId', v_existing_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_finance_account_with_opening_balance_atomic(
  uuid, uuid, uuid, text, text, numeric, numeric, boolean, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_finance_account_with_opening_balance_atomic(
  uuid, uuid, uuid, text, text, numeric, numeric, boolean, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.update_finance_account_atomic(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_finance_account_atomic(uuid, uuid, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_appointment_payment_transaction_atomic(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_payment_transaction_atomic(uuid, uuid, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
