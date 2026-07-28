-- Migration: Standardize fiscal columns across stores, customers, suppliers

BEGIN;

-- ============================================================================
-- 1. STORES
-- ============================================================================

-- Remove constraint antiga (caso exista)
ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_business_type_check;

-- Renomeia a coluna apenas se ela existir
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'stores'
          AND column_name = 'business_type'
    ) THEN
        ALTER TABLE stores
            RENAME COLUMN business_type TO person_type;
    END IF;
END $$;

-- Adiciona constraint nova
ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_person_type_valid;

ALTER TABLE stores
    ADD CONSTRAINT stores_person_type_valid
        CHECK (person_type IN ('pf', 'pj', 'foreign'));

COMMENT ON COLUMN stores.person_type IS
'Tipo de pessoa: pf, pj ou foreign';

-- ============================================================================
-- 2. CUSTOMERS
-- ============================================================================

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS razao_social TEXT,
    ADD COLUMN IF NOT EXISTS crt TEXT;

COMMENT ON COLUMN customers.razao_social IS
'Razão Social (apenas PJ)';

COMMENT ON COLUMN customers.crt IS
'Código de Regime Tributário: 1=Simples Nacional, 3=Regime Normal, 4=MEI';

-- Migração do regime_tributario -> crt (somente se a coluna existir)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers'
          AND column_name = 'regime_tributario'
    ) THEN

        UPDATE customers
           SET crt = '1'
         WHERE regime_tributario ILIKE 'Simples nacional%';

        UPDATE customers
           SET crt = '3'
         WHERE regime_tributario = 'Regime normal';

        UPDATE customers
           SET crt = '4'
         WHERE regime_tributario = 'MEI';

    END IF;
END $$;

ALTER TABLE customers
    DROP CONSTRAINT IF EXISTS customers_regime_tributario_valid,
    DROP CONSTRAINT IF EXISTS customers_contribuinte_icms_valid;

ALTER TABLE customers
    DROP COLUMN IF EXISTS regime_tributario,
    DROP COLUMN IF EXISTS contribuinte_icms;

-- ============================================================================
-- 3. SUPPLIERS
-- ============================================================================

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS razao_social TEXT,
    ADD COLUMN IF NOT EXISTS crt TEXT,
    ADD COLUMN IF NOT EXISTS ie_isento BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT;

COMMENT ON COLUMN suppliers.razao_social IS
'Razão Social (apenas PJ)';

COMMENT ON COLUMN suppliers.crt IS
'Código de Regime Tributário: 1=Simples Nacional, 3=Regime Normal, 4=MEI';

COMMENT ON COLUMN suppliers.ie_isento IS
'Indica se é Isento de Inscrição Estadual';

COMMENT ON COLUMN suppliers.inscricao_municipal IS
'Inscrição Municipal';

-- Migração do regime_tributario -> crt (somente se existir)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'suppliers'
          AND column_name = 'regime_tributario'
    ) THEN

        UPDATE suppliers
           SET crt = '1'
         WHERE regime_tributario ILIKE 'Simples nacional%';

        UPDATE suppliers
           SET crt = '3'
         WHERE regime_tributario = 'Regime normal';

        UPDATE suppliers
           SET crt = '4'
         WHERE regime_tributario = 'MEI';

    END IF;
END $$;

ALTER TABLE suppliers
    DROP COLUMN IF EXISTS regime_tributario,
    DROP COLUMN IF EXISTS contribuinte_icms;

COMMIT;