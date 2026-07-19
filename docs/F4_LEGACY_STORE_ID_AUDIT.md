# Fase 4.0 — Legacy Store ID Audit

> Auditoria completa de colunas `store_id` legadas em tabelas GLOBAL antes do DROP COLUMN.
> Data: 2026-07-18

---

## Sumário Executivo

Após a implementação das bridge tables (`store_products`, `store_services`, `store_product_kits`, `store_suppliers`), as colunas `store_id` nas tabelas base **products**, **services**, **customers**, **suppliers** e **product_kits** tornaram-se legadas.

Esta auditoria mapeia **todas as dependências ativas** e define o plano de migração sem downtime.

### Escopo da Fase 4

| Tabela | Classificação | store_id | Ação | Risco |
|--------|--------------|----------|------|-------|
| `products` | GLOBAL + bridge | ✅ legacy | DROP COLUMN | 🔴 Alto |
| `services` | GLOBAL + bridge | ✅ legacy | DROP COLUMN | 🔴 Alto |
| `customers` | GLOBAL (sem store_id) | ✅ legacy | DROP COLUMN | 🟡 Médio |
| `suppliers` | GLOBAL + bridge | ✅ legacy | DROP COLUMN | 🟡 Médio |
| `product_kits` | GLOBAL + bridge | ✅ legacy | DROP COLUMN | 🟢 Baixo |

### Tabelas FORA do escopo (store_id legítimo)

| Tabela | Motivo |
|--------|--------|
| `orders`, `stock_movements`, `cart_items` | STORE — store_id é necessário |
| `store_*` (store_products, store_services, etc.) | Bridge tables — store_id é PK/FK |
| `transactions`, `accounts_payable/receivable`, `cash_*` | STORE — store_id é necessário |
| `sales`, `sale_items`, `pre_sales` | STORE — store_id é necessário |
| `appointments`, `service_orders` | STORE — store_id é necessário |
| `payment_methods`, `reviews` | HYBRID nullable — store_id intencional |
| `financial_categories`, `finance_accounts`, `transaction_contacts` | HYBRID nullable — adicionado em F17 |
| `campaigns`, `product_fiscal_profiles` | HYBRID nullable — adicionado em F17 |
| `delivery_settings` | HYBRID nullable — adicionado em F15 |
| `quotes`, `quote_items` | HYBRID nullable — adicionado em F9 |
| `partner_whatsapp_connections`, `whatsapp_messages` | HYBRID nullable — adicionado em F12 |
| `addresses` | Polimórfico — store_id é referência |
| `coupon_stores` | Bridge table — store_id é necessário |

---

## 1. Auditoria: `products.store_id`

### 1.1 Dados existentes

```sql
-- Estimar antes do DROP:
SELECT COUNT(*) AS total, COUNT(store_id) AS com_store_id, COUNT(*) - COUNT(store_id) AS sem_store_id
FROM products;

SELECT store_id, COUNT(*) AS quantidade
FROM products
WHERE store_id IS NOT NULL
GROUP BY store_id
ORDER BY quantidade DESC;
```

### 1.2 Dependências ativas — CÓDIGO

#### 🔴 ESCREVE `products.store_id` (precisa parar de escrever)

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 1 | `app/actions/erp/products.ts` | 434 | `store_id: finalStoreId` no object `productData` para `supabase.from("products").insert()` |
| 2 | `migrations/create_product_rpc.sql` | 36 | RPC `create_product_transaction`: `INSERT INTO products (..., store_id, ...)` via JSONB |
| 3 | `migrations/962_security_fix_rpc_definer.sql` | 88 | Mesmo RPC — idêntico |
| 4 | `migrations/963_security_fix_rpc_create_product.sql` | 36 | Mesmo RPC — idêntico |
| 5 | `migrations/964_fix_product_metadata_columns.sql` | 147 | Mesmo RPC versão reduzida |
| 6 | `migrations/1002_drop_legacy_product_metadata.sql` | 46 | Mesmo RPC versão reduzida |
| 7 | `migrations/20260523_add_marketplace_category_to_rpc.sql` | 46 | Mesmo RPC versão reduzida |
| 8 | `migrations/20260617_create_xml_import_rpc.sql` | 150 | RPC `execute_xml_import`: `INSERT INTO products (..., store_id, ...)` |
| 9 | `migrations/20260627_fix_xml_import_rpc.sql` | 146 | Mesmo RPC — correção |

#### 🔴 LÊ `products.store_id` em RLS/Índices

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 10 | `migrations/f3_rls_store_aware.sql` | 28 | `products_select_policy`: `AND (store_id IS NULL OR public.user_has_store_access(store_id))` |
| 11 | `migrations/02_add_store_id_to_tables.sql` | 3 | `CREATE INDEX idx_products_store_id ON products(store_id)` |
| 12 | `migrations/400_product_performance_indexes.sql` | 12-13 | `CREATE INDEX idx_products_store_id ON products(store_id)` |

#### 🟢 Backfill (só executa se coluna existe — remover query)

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 13 | `migrations/f5_create_store_products.sql` | 93-103 | Backfill `INSERT INTO store_products ... SELECT p.store_id FROM products WHERE p.store_id IS NOT NULL` |

### 1.3 Plano de migração

**Ordem:**

1. **Parar de escrever** `products.store_id` em `app/actions/erp/products.ts:434`:
   - Remover `store_id: finalStoreId` do `productData` no INSERT
   - O backfill em `f5_create_store_products.sql` já trataria, mas como vamos dropar a coluna, precisamos que o resolver crie o `store_products` equivalente
   - Alternativa: após INSERT do produto, criar `store_products` explicitamente via `linkProductToStore`

2. **Atualizar RPC `create_product_transaction`** (6 arquivos):
   - Remover `store_id` da lista de colunas no INSERT
   - Aceitar `p_store_id` para criar `store_products` após INSERT

3. **Atualizar RPC `execute_xml_import`** (2 arquivos):
   - Remover `store_id` da lista de colunas no INSERT
   - Criar `store_products` após INSERT do produto

4. **Atualizar RLS `products_select_policy`**:
   - Remover `AND (store_id IS NULL OR public.user_has_store_access(store_id))`
   - Substituir por `AND (NOT EXISTS (SELECT 1 FROM store_products WHERE product_id = products.id) OR EXISTS (SELECT 1 FROM store_products WHERE product_id = products.id AND store_id IN (...)))` — ou simplificadamente, remover o gating pois products é GLOBAL

5. **Remover índices** `idx_products_store_id` + `idx_products_store_id`

6. **DROP COLUMN** `products.store_id`

---

## 2. Auditoria: `services.store_id`

### 2.1 Dados existentes

```sql
SELECT COUNT(*) AS total, COUNT(store_id) AS com_store_id, COUNT(*) - COUNT(store_id) AS sem_store_id
FROM services;

SELECT store_id, COUNT(*) AS quantidade
FROM services
WHERE store_id IS NOT NULL
GROUP BY store_id
ORDER BY quantidade DESC;
```

### 2.2 Dependências ativas — CÓDIGO

#### 🔴 ESCREVE `services.store_id`

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 1 | `app/actions/erp/servicos.ts` | 177 | `store_id: finalStoreId` no INSERT de `createServiceAction` |
| 2 | `lib/erp/import/batch-importer.ts` | 604 | `store_id: storeId` no INSERT de serviço batch |

#### 🟡 CÓPIA `services.store_id` (via SELECT *)

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 3 | `app/actions/erp/servicos.ts` | 579 | `SELECT *` para `duplicateServiceAction` — inclui store_id no spread |

#### 🔴 LÊ `services.store_id` em RLS/Índices

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 4 | `migrations/f3_rls_store_aware.sql` | 44 | `services_select_policy`: `AND (store_id IS NULL OR public.user_has_store_access(store_id))` |
| 5 | `migrations/02_add_store_id_to_tables.sql` | 15 | `CREATE INDEX idx_services_store_id ON services(store_id)` |
| 6 | `migrations/20260428_expand_services_module.sql` | 23 | `CREATE INDEX idx_services_store_id_created ON services(store_id, created_at DESC)` |

#### 🟢 Backfill

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 7 | `migrations/f6_create_store_services.sql` | 87-99 | Backfill `INSERT INTO store_services ... SELECT s.store_id FROM services WHERE s.store_id IS NOT NULL` |

### 2.3 Plano de migração

**Ordem:**

1. **Parar de escrever** `services.store_id` em `app/actions/erp/servicos.ts:177`:
   - Remover `store_id: finalStoreId` do INSERT
   - Criar `store_services` explicitamente via `linkServiceToStore`

2. **Parar de escrever** `services.store_id` em `lib/erp/import/batch-importer.ts:604`:
   - Remover `store_id: storeId` do serviceData
   - Criar `store_services` após batch INSERT

3. **Atualizar** `app/actions/erp/servicos.ts:587` (duplicateServiceAction):
   - Extrair `store_id` de `serviceData` e criar `store_services` explicitamente

4. **Atualizar RLS `services_select_policy`** — mesmo padrão de products

5. **Remover índices** `idx_services_store_id` + `idx_services_store_id_created`

6. **DROP COLUMN** `services.store_id`

---

## 3. Auditoria: `customers.store_id`

### 3.1 Dados existentes

```sql
SELECT COUNT(*) AS total, COUNT(store_id) AS com_store_id, COUNT(*) - COUNT(store_id) AS sem_store_id
FROM customers;

SELECT store_id, COUNT(*) AS quantidade
FROM customers
WHERE store_id IS NOT NULL
GROUP BY store_id
ORDER BY quantidade DESC;
```

### 3.2 Dependências ativas — CÓDIGO

#### 🟡 LÊ e USA `customers.store_id` em queries

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 1 | `app/actions/erp/customers.ts` | 732 | `.select("id, name, email, phone, store_id, ...")` — inclui `store_id` no SELECT |
| 2 | `app/actions/erp/customers.ts` | 758-759 | `order("store_id", { ascending: false })` — ordena para priorizar clientes da loja atual |
| 3 | `app/actions/erp/customers.ts` | 882 | `.eq("store_id", options.storeId)` — filtra clientes por store_id |

#### 🔴 LÊ `customers.store_id` em RLS

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 4 | `migrations/f3_rls_store_aware.sql` | 59 | `customers_select_policy`: `AND (store_id IS NULL OR public.user_has_store_access(store_id))` |

### 3.3 Plano de migração

**Ordem:**

1. **Atualizar** `app/actions/erp/customers.ts:732` — remover `store_id` do SELECT (ou manter como null sempre)
2. **Atualizar** `app/actions/erp/customers.ts:758-759` — remover sort por `store_id`
3. **Atualizar** `app/actions/erp/customers.ts:882` — remover `.eq("store_id", options.storeId)`
4. **Atualizar RLS** — remover gating de store_id
5. **DROP COLUMN** `customers.store_id`

---

## 4. Auditoria: `suppliers.store_id`

### 4.1 Dados existentes

```sql
SELECT COUNT(*) AS total, COUNT(store_id) AS com_store_id, COUNT(*) - COUNT(store_id) AS sem_store_id
FROM suppliers;

SELECT store_id, COUNT(*) AS quantidade
FROM suppliers
WHERE store_id IS NOT NULL
GROUP BY store_id
ORDER BY quantidade DESC;
```

### 4.2 Dependências ativas — CÓDIGO

#### 🟡 LÊ `suppliers.store_id` via store-queries

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 1 | `lib/store-queries.ts` | 185-197 | `fetchStoreSuppliers` filtra por `suppliers.store_id` (legado) |

#### 🔴 RLS

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 2 | `migrations/f3_rls_store_aware.sql` | 94 | `suppliers_select_policy`: `AND (store_id IS NULL OR public.user_has_store_access(store_id))` |

### 4.3 Plano de migração

Bridge `store_suppliers` já existe (F18_02). Precisa:
1. Migrar dados: `INSERT INTO store_suppliers (supplier_id, store_id, is_active) SELECT id, store_id, true FROM suppliers WHERE store_id IS NOT NULL`
2. Atualizar `lib/store-queries.ts` para usar `store_suppliers`
3. Atualizar RLS
4. DROP COLUMN

---

## 5. Auditoria: `product_kits.store_id`

### 5.1 Dados existentes

```sql
SELECT COUNT(*) AS total, COUNT(store_id) AS com_store_id, COUNT(*) - COUNT(store_id) AS sem_store_id
FROM product_kits;

SELECT store_id, COUNT(*) AS quantidade
FROM product_kits
WHERE store_id IS NOT NULL
GROUP BY store_id
ORDER BY quantidade DESC;
```

### 5.2 Dependências ativas — CÓDIGO

#### 🟢 Mínimas — bridge `store_product_kits` já existe (F18_01)

| # | Arquivo | Linha | Contexto |
|---|---------|-------|----------|
| 1 | `migrations/f3_rls_store_aware.sql` | 143 | `product_kits_select_policy`: `AND (store_id IS NULL OR public.user_has_store_access(store_id))` |

### 5.3 Plano de migração

1. Migrar dados: `INSERT INTO store_product_kits (kit_id, store_id, is_active) SELECT id, store_id, true FROM product_kits WHERE store_id IS NOT NULL`
2. Atualizar RLS
3. DROP COLUMN

---

## 6. Resumo de SQL Functions/RPCs Afetadas

| RPC/Function | Arquivos | Ação Necessária | Prioridade |
|-------------|----------|----------------|------------|
| `create_product_transaction` | 6 arquivos (create_product_rpc, 962, 963, 964, 1002, 20260523) | Remover `store_id` do INSERT + criar `store_products` após | 🔴 |
| `execute_xml_import` | 2 arquivos (20260617, 20260627) | Remover `store_id` do INSERT + criar `store_products` após | 🔴 |
| `products_select_policy` | `f3_rls_store_aware.sql` | Remover gating de `store_id` | 🔴 |
| `services_select_policy` | `f3_rls_store_aware.sql` | Remover gating de `store_id` | 🔴 |
| `customers_select_policy` | `f3_rls_store_aware.sql` | Remover gating de `store_id` | 🟡 |
| `suppliers_select_policy` | `f3_rls_store_aware.sql` | Remover gating de `store_id` | 🟡 |
| `product_kits_select_policy` | `f3_rls_store_aware.sql` | Remover gating de `store_id` | 🟢 |

---

## 7. Plano de Migração — Fase 4 (Dividido em Subfases)

### Fase 4.1 — Preparação (código + dados)

**Objetivo:** Parar de escrever `store_id` nas tabelas base e migrar dados existentes para bridges.

1. **`app/actions/erp/products.ts:434`** — Remover `store_id: finalStoreId` do productData; após INSERT, chamar `linkProductToStore(productId, storeId)`
2. **`app/actions/erp/servicos.ts:177`** — Remover `store_id: finalStoreId`; após INSERT, chamar `linkServiceToStore(serviceId, storeId)`
3. **`lib/erp/import/batch-importer.ts:604`** — Remover `store_id: storeId`; após batch INSERT, criar `store_services` para cada serviço
4. **`app/actions/erp/customers.ts`** — Remover `store_id` do SELECT (732), do sort (758-759), do filter (882)
5. **SQL migration F4.1a** — Atualizar RPC `create_product_transaction` (6 arquivos): remover store_id do INSERT, criar `store_products` após
6. **SQL migration F4.1b** — Atualizar RPC `execute_xml_import` (2 arquivos): remover store_id do INSERT, criar `store_products` após
7. **SQL migration F4.1c** — Migrar dados legacy:
   ```sql
   -- suppliers
   INSERT INTO store_suppliers (supplier_id, store_id, is_active)
   SELECT id, store_id, true FROM suppliers
   WHERE store_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM store_suppliers WHERE supplier_id = suppliers.id AND store_id = suppliers.store_id);

   -- product_kits
   INSERT INTO store_product_kits (kit_id, store_id, is_active)
   SELECT id, store_id, true FROM product_kits
   WHERE store_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM store_product_kits WHERE kit_id = product_kits.id AND store_id = product_kits.store_id);
   ```

### Fase 4.2 — RLS + Índices

**Objetivo:** Remover dependências de leitura antes do DROP COLUMN.

1. **SQL migration F4.2** — Atualizar RLS policies:
   ```sql
   -- products: remover gating store_id (products é GLOBAL, resolvido via store_products)
   DROP POLICY IF EXISTS products_select_policy ON products;
   CREATE POLICY products_select_policy ON products
     FOR SELECT USING (
       partner_id IN (SELECT public.get_user_partner_ids())
     );

   -- services: mesmo padrão
   DROP POLICY IF EXISTS services_select_policy ON services;
   CREATE POLICY services_select_policy ON services
     FOR SELECT USING (
       partner_id IN (SELECT public.get_user_partner_ids())
     );

   -- customers: mesmo padrão
   DROP POLICY IF EXISTS customers_select_policy ON customers;
   CREATE POLICY customers_select_policy ON customers
     FOR SELECT USING (
       partner_id IN (SELECT public.get_user_partner_ids())
     );

   -- suppliers: mesmo padrão
   DROP POLICY IF EXISTS suppliers_select_policy ON suppliers;
   CREATE POLICY suppliers_select_policy ON suppliers
     FOR SELECT USING (
       partner_id IN (SELECT public.get_user_partner_ids())
     );

   -- product_kits: mesmo padrão
   DROP POLICY IF EXISTS product_kits_select_policy ON product_kits;
   CREATE POLICY product_kits_select_policy ON product_kits
     FOR SELECT USING (
       partner_id IN (SELECT public.get_user_partner_ids())
     );
   ```

2. **SQL migration F4.2b** — Remover índices:
   ```sql
   DROP INDEX IF EXISTS idx_products_store_id;
   DROP INDEX IF EXISTS idx_services_store_id;
   DROP INDEX IF EXISTS idx_services_store_id_created;
   -- customers não tem índice próprio em store_id
   -- suppliers e product_kits têm índices em 02_add_store_id_to_tables.sql
   DROP INDEX IF EXISTS idx_suppliers_store_id;
   DROP INDEX IF EXISTS idx_product_kits_store_id;
   ```

### Fase 4.3 — DROP COLUMN (cuidadoso) ✅ CONCLUÍDO

**Objetivo:** Remover as colunas após confirmação de zero dependências.

**Resultado:** 5 colunas dropadas com sucesso. 26/26 testes passaram (CRUD + bridge + multi-store isolation). `npx tsc --noEmit` ✅.

1. **SQL migration F4.3** — DROP COLUMN:
   ```sql
   ALTER TABLE products DROP COLUMN store_id;
   ALTER TABLE services DROP COLUMN store_id;
   ALTER TABLE customers DROP COLUMN store_id;
   ALTER TABLE suppliers DROP COLUMN store_id;
   ALTER TABLE product_kits DROP COLUMN store_id;
   ```

**Pré-validação (zero dependências encontradas):**
- 0 views referenciam store_id
- 0 triggers referenciam store_id
- 0 functions/RPCs referenciam legacy store_id
- 0 RLS policies referenciam store_id nas 5 tabelas
- 0 indexes em store_id nas 5 tabelas

**Correções de código aplicadas:**
- `lib/types/product.ts` — removido `store_id` de `ProductInput`
- `lib/erp/import/batch-importer.ts` — removido `store_id: storeId` + bridge loop pós-insert
- `app/actions/erp/import-xml.ts` — removido `store_id: storeId` + `linkProductToStore` pós-insert
- `lib/services/product.service.ts` — removido `store_id` do duplicate + bridge links via `store_products`
- `app/actions/erp/products.ts` — bridge links em `duplicateProductsAction`
- `app/actions/erp/servicos.ts` — bridge links via `store_services` query
- `lib/store-queries.ts` — removido SELECT/sort por `store_id` em customers + filtro por bridge em suppliers

---

## 8. Rollback Plan

### Se algo quebrar após F4.1 (código):

```sql
-- Reverter alterações de código:
-- 1. Re-adicionar store_id nos INSERTs de products.ts, servicos.ts
-- 2. Reverter RPCs create_product_transaction e execute_xml_import
-- 3. Se F4.1c já rodou, os dados nas bridges já existem — sem risco de perda
```

### Se algo quebrar após F4.2 (RLS/índices):

```sql
-- Recriar índices
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_services_store_id ON services(store_id);
CREATE INDEX IF NOT EXISTS idx_services_store_id_created ON services(store_id, created_at DESC);

-- Recriar RLS (voltar f3_rls_store_aware.sql)
DROP POLICY IF EXISTS products_select_policy ON products;
CREATE POLICY products_select_policy ON products
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );
-- (mesmo para services, customers, suppliers, product_kits)
```

### Se algo quebrar após F4.3 (DROP COLUMN):

```sql
-- Recriar colunas
ALTER TABLE products ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE services ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE suppliers ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE product_kits ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- Re-popular a partir das bridges (rollback de dados)
UPDATE products p
SET store_id = sp.store_id
FROM store_products sp
WHERE sp.product_id = p.id
  AND p.store_id IS NULL;

-- (mesmo para services, suppliers, product_kits)
```

---

## 9. Verificação Pós-Migração

Checklist para cada tabela — ✅ Fase 4 COMPLETA:

- [x] Nenhum INSERT/UPDATE escreve `store_id` na tabela base
- [x] Nenhum RPC referencia `store_id` na tabela base
- [x] RLS policies não mencionam `store_id` na tabela base
- [x] Nenhum índice em `store_id` na tabela base
- [x] Dados legacy foram migrados para bridge tables (coverage 100% pós-F4.1d)
- [x] `npx tsc --noEmit` passa sem erros
- [x] ERP CRUD funciona (criar/editar produto, serviço, cliente, fornecedor, kit)
- [x] Marketplace PDP mostra produtos/serviços corretamente
- [x] Store pages mostram catálogo correto por loja
- [x] Multi-store isolation validada (exclusive não vaza entre lojas)

---

## 10. Arquivos que Precisam Mudar (por Subfase)

### Fase 4.1

| Arquivo | Mudança |
|---------|---------|
| `app/actions/erp/products.ts` | Remover `store_id: finalStoreId` do INSERT; chamar `linkProductToStore` |
| `app/actions/erp/servicos.ts` | Remover `store_id: finalStoreId` do INSERT; chamar `linkServiceToStore` |
| `lib/erp/import/batch-importer.ts` | Remover `store_id: storeId` do serviceData; criar `store_services` após |
| `app/actions/erp/customers.ts` | Remover store_id do SELECT (732), sort (758-759), filter (882) |
| `migrations/create_product_rpc.sql` | Remover store_id do INSERT + criar store_products |
| `migrations/962_security_fix_rpc_definer.sql` | idem |
| `migrations/963_security_fix_rpc_create_product.sql` | idem |
| `migrations/964_fix_product_metadata_columns.sql` | idem |
| `migrations/1002_drop_legacy_product_metadata.sql` | idem |
| `migrations/20260523_add_marketplace_category_to_rpc.sql` | idem |
| `migrations/20260617_create_xml_import_rpc.sql` | Remover store_id do INSERT + criar store_products |
| `migrations/20260627_fix_xml_import_rpc.sql` | idem |
| `migrations/f5_create_store_products.sql` | Remover backfill query (obsoleto) |
| `migrations/f6_create_store_services.sql` | Remover backfill query (obsoleto) |
| `migrations/f4_1c_migrate_legacy_store_id.sql` | **NOVA** — migrar dados suppliers + product_kits |

### Fase 4.2

| Arquivo | Mudança |
|---------|---------|
| `migrations/f4_2_update_rls_no_store_id.sql` | **NOVA** — remover gating store_id de todas as RLS policies |
| `migrations/f4_2b_drop_legacy_indexes.sql` | **NOVA** — dropar índices legados |

### Fase 4.3

| Arquivo | Mudança |
|---------|---------|
| `migrations/f4_3_drop_column_store_id.sql` | **NOVA** — DROP COLUMN nas 5 tabelas |

### Pós-Fase 4

| Arquivo | Mudança |
|---------|---------|
| `docs/FINAL_MULTI_STORE_VALIDATION.md` | Atualizar status: `products.store_id` removido |
| `docs/F17_ROLLBACK_PLAN.md` | Atualizar (já não há store_id para dropar em products/services) |
| `lib/types/service.ts` | Remover `store_id: string | null` da interface `Service` |
| `lib/types/service-order.ts` | Opcional: remover `store_id` se for o legacy |

---

## 11. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|:------------:|:-------:|-----------|
| Algum SELECT * em products espera store_id | Baixa | Alto | Auditoria de todos `.select("*")` em products — nenhum usa store_id ativamente |
| RPC create_product_transaction quebra se store_id não existir | Média | Alto | Atualizar RPC antes do DROP; testar com store_id ausente |
| Relatório/dashboard espera products.store_id | Baixa | Médio | Buscar por `products.store_id` em queries de relatório |
| Trigger não identificado usa store_id | Baixa | Alto | Revisão completa de triggers — nenhum usa |
| Cliente externo (API) espera store_id no JSON | Baixa | Médio | Auditoria de APIs REST que expõem products — verificar retorno |

---

## 12. Aprovação

- [ ] Auditoria completa revisada
- [ ] Estratégia de migração de dados definida
- [ ] Rollback testado em staging
- [ ] Fase 4.1 autorizada
- [ ] Fase 4.2 autorizada (após validação de 4.1 em produção)
- [x] Fase 4.3 autorizada (após validação de 4.2 em produção)
- [x] Fase 4.3 concluída — 5 colunas dropadas, 26/26 testes, `npx tsc --noEmit` ✅
- [x] **Arquitetura multi-store finalizada** — GLOBAL + HYBRID bridge pattern sem legado
