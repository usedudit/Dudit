# F17+ Rollback Plan

## Instruções

Cada migration abaixo tem seu comando ROLLBACK correspondente.
Sempre testar rollback em staging antes de produção.

---

## Fase 1 - Schema Foundation

### M1: `visibility_scope` + `marketplace_visible` em store_products

**Forward:**
```sql
ALTER TABLE store_products ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'all'
  CHECK (visibility_scope IN ('all', 'selected', 'exclusive'));
ALTER TABLE store_products ADD COLUMN IF NOT EXISTS marketplace_visible BOOLEAN DEFAULT true;
```

**Rollback:**
```sql
ALTER TABLE store_products DROP COLUMN IF EXISTS visibility_scope;
ALTER TABLE store_products DROP COLUMN IF EXISTS marketplace_visible;
```

**Risco:** 🟢 Baixo (colunas novas, sem dados existentes)
**Idempotente:** Sim (IF NOT EXISTS)

### M2: `visibility_scope` + `marketplace_visible` em store_services

**Forward:**
```sql
ALTER TABLE store_services ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'all'
  CHECK (visibility_scope IN ('all', 'selected', 'exclusive'));
ALTER TABLE store_services ADD COLUMN IF NOT EXISTS marketplace_visible BOOLEAN DEFAULT true;
```

**Rollback:**
```sql
ALTER TABLE store_services DROP COLUMN IF EXISTS visibility_scope;
ALTER TABLE store_services DROP COLUMN IF EXISTS marketplace_visible;
```

**Risco:** 🟢 Baixo
**Idempotente:** Sim

### M3: `store_id` nullable em product_fiscal_profiles

**Forward:**
```sql
ALTER TABLE product_fiscal_profiles ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_product_fiscal_profiles_store_id ON product_fiscal_profiles(store_id);
```

**Rollback:**
```sql
DROP INDEX IF EXISTS idx_product_fiscal_profiles_store_id;
ALTER TABLE product_fiscal_profiles DROP COLUMN IF EXISTS store_id;
```

**Risco:** 🟢 Baixo (coluna nova, NULL default)
**Idempotente:** Sim

### M4: `store_id` nullable em financial_categories

**Forward:**
```sql
ALTER TABLE financial_categories ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_financial_categories_store_id ON financial_categories(store_id);
```

**Rollback:**
```sql
DROP INDEX IF EXISTS idx_financial_categories_store_id;
ALTER TABLE financial_categories DROP COLUMN IF EXISTS store_id;
```

**Risco:** 🟢 Baixo
**Idempotente:** Sim

### M5: `store_id` nullable em finance_accounts

**Forward:**
```sql
ALTER TABLE finance_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_finance_accounts_store_id ON finance_accounts(store_id);
```

**Rollback:**
```sql
DROP INDEX IF EXISTS idx_finance_accounts_store_id;
ALTER TABLE finance_accounts DROP COLUMN IF EXISTS store_id;
```

**Risco:** 🟢 Baixo
**Idempotente:** Sim

### M6: `store_id` nullable em transaction_contacts

**Forward:**
```sql
ALTER TABLE transaction_contacts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transaction_contacts_store_id ON transaction_contacts(store_id);
```

**Rollback:**
```sql
DROP INDEX IF EXISTS idx_transaction_contacts_store_id;
ALTER TABLE transaction_contacts DROP COLUMN IF EXISTS store_id;
```

**Risco:** 🟢 Baixo
**Idempotente:** Sim

### M7: `store_id` nullable em campaigns

**Forward:**
```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_store_id ON campaigns(store_id);
```

**Rollback:**
```sql
DROP INDEX IF EXISTS idx_campaigns_store_id;
ALTER TABLE campaigns DROP COLUMN IF EXISTS store_id;
```

**Risco:** 🟢 Baixo
**Idempotente:** Sim

---

## Fase 2 - RLS + Runtime (preview, implementar depois)

Cada policy nova será criada com DROP POLICY IF EXISTS antes, permitindo rollback simples: dropar a nova e recriar a antiga se necessário.

---

## Fase 3 - Bridges (preview)

### store_kits

**Forward:** CREATE TABLE store_kits (...)
**Rollback:** DROP TABLE IF EXISTS store_kits CASCADE;

### store_suppliers

**Forward:** CREATE TABLE store_suppliers (...)
**Rollback:** DROP TABLE IF EXISTS store_suppliers CASCADE;

---

## Fase 4 - Remoção de Legado (preview)

⚠️ **Rollback destas migrations requer restaurar colunas com dados.**
Estratégia: antes de dropar coluna, criar backup table:

```sql
-- Backup antes de dropar
CREATE TABLE products_store_id_backup AS
SELECT id, store_id FROM products WHERE store_id IS NOT NULL;

-- Remover coluna
ALTER TABLE products DROP COLUMN store_id;

-- Rollback (restaurar)
ALTER TABLE products ADD COLUMN store_id UUID REFERENCES stores(id);
UPDATE products p SET store_id = b.store_id
FROM products_store_id_backup b WHERE p.id = b.id;
DROP TABLE products_store_id_backup;
```

Esta estratégia se aplica a: products, services, customers, product_kits, suppliers.

---

## Fase 5 - STORE órfãs (preview)

⚠️ **Maior risco.** Para cada tabela, a estratégia é:

1. Adicionar coluna (ALTER TABLE ADD COLUMN store_id)
2. Preencher dados: single-store partners = auto-assign
3. Tornar NOT NULL após preenchimento
4. Adicionar RLS

Rollback = dropar coluna (perde dados de store_id).
Para rollback seguro, criar backup antes de popular.
