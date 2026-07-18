-- F17+ Fase 1: store_id nullable em tabelas financeiras cadastrais
-- financial_categories, finance_accounts, transaction_contacts
-- Modelo: HYBRID nullable (GLOBAL + opção de vinculação a store)
-- Integridade referencial: ON DELETE SET NULL

BEGIN;

-- ============================================================
-- M4: financial_categories
-- ============================================================

ALTER TABLE financial_categories
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_categories_store_id
  ON financial_categories(store_id);

COMMENT ON COLUMN financial_categories.store_id IS
  'NULL = global; preenchido = vinculado à store específica';

-- ============================================================
-- M5: finance_accounts
-- ============================================================

ALTER TABLE finance_accounts
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_accounts_store_id
  ON finance_accounts(store_id);

COMMENT ON COLUMN finance_accounts.store_id IS
  'NULL = global; preenchido = vinculado à store específica';

-- ============================================================
-- M6: transaction_contacts
-- ============================================================

ALTER TABLE transaction_contacts
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transaction_contacts_store_id
  ON transaction_contacts(store_id);

COMMENT ON COLUMN transaction_contacts.store_id IS
  'NULL = global; preenchido = vinculado à store específica';

COMMIT;
