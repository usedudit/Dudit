# Multi-Store — Final Architecture State

> Snapshot arquitetural após conclusão da Fase 4.
> Data: 2026-07-18
> Status: ✅ Finalizado — sem legado de `store_id` nas tabelas base.

---

## 1. Modelo Final de Dados

### 1.1 Classificação das Tabelas

#### 🟦 GLOBAL (sem store_id — dados do parceiro)

| Tabela | Observação |
|--------|-----------|
| `products` | Base global. Associação a lojas via `store_products` |
| `services` | Base global. Associação a lojas via `store_services` |
| `customers` | Cliente é do parceiro, não da loja |
| `suppliers` | Base global. Associação via `store_suppliers` |
| `product_kits` | Base global. Associação via `store_product_kits` |
| `product_variants` | Variação global. Override via `store_product_variants` |
| `partners` | Dados do negócio |
| `stores` | Catálogo de lojas do parceiro |
| `store_members` | Usuários × lojas |
| `brands` | Marcas |
| `product_categories` | Categorias |
| `storage_locations` | Endereços de estoque |
| `recurring_plans` | Planos de assinatura |
| `community_videos` | Conteúdo comunitário |
| `product_fiscal_profiles` | Dados fiscais do produto (atributo do produto, não da loja) |
| `product_logistics` | Dados logísticos do produto |

#### 🟧 STORE (store_id NOT NULL — pertencem a uma loja)

| Tabela | store_id |
|--------|----------|
| `orders` | NOT NULL |
| `order_items` | Via order.store_id |
| `cart_items` | NOT NULL |
| `pre_sales` | NOT NULL |
| `sale_items` | NOT NULL |
| `cash_sessions` | NOT NULL |
| `cash_movements` | NOT NULL |
| `stock_movements` | NOT NULL |
| `transactions` | NOT NULL |
| `accounts_payable` | NOT NULL |
| `accounts_receivable` | NOT NULL |
| `recurring_transactions` | NOT NULL |
| `appointments` | NOT NULL |
| `service_orders` | NOT NULL |
| `deliveries` | NOT NULL (F15) |
| `delivery_settings` | NOT NULL (F15) |
| `store_credits` | NOT NULL |

#### 🟩 HYBRID nullable (store_id NULL = global, preenchido = store-level)

| Tabela | store_id | RLS |
|--------|----------|-----|
| `payment_methods` | NULL | `store_id IS NULL OR user_has_store_access(store_id)` |
| `financial_categories` | NULL | idem |
| `finance_accounts` | NULL | idem |
| `transaction_contacts` | NULL | idem |
| `campaigns` | NULL | idem |
| `promotions` | NULL | idem |
| `coupons` | NULL | idem |
| `delivery_settings` | NULL | idem |
| `quotes` / `quote_items` | NULL | idem |
| `partner_whatsapp_connections` | NULL | idem |
| `whatsapp_messages` | NULL | idem |
| `reviews` | NULL | Leitura global, filtro opcional por store_id |
| `store_products.visibility_scope` | 'all'/'selected'/'exclusive' | Store-level |
| `store_services.visibility_scope` | 'all'/'selected'/'exclusive' | Store-level |

### 1.2 Bridge Tables (GLOBAL → STORE)

| Bridge | Tabela Base | FK | Campos de Override |
|--------|------------|----|-------------------|
| `store_products` | `products` | `product_id`, `store_id` | `override_price`, `override_stock_quantity`, `override_sku`, `is_active`, `visibility_scope`, `marketplace_visible` |
| `store_services` | `services` | `service_id`, `store_id` | `override_price`, `override_stock_quantity`, `override_sku`, `is_active`, `visibility_scope`, `marketplace_visible` |
| `store_suppliers` | `suppliers` | `supplier_id`, `store_id` | `is_active`, `visibility_scope`, `marketplace_visible` |
| `store_product_kits` | `product_kits` | `kit_id`, `store_id` | `override_price`, `is_active`, `visibility_scope`, `marketplace_visible` |
| `store_product_variants` | `product_variants` | `variant_id`, `store_id` | `override_stock_quantity`, `is_active`, `stock_reserved`, `stock_available` |
| `coupon_stores` | `coupons` | `coupon_id`, `store_id` | Associação simples |
| `promotion_stores` | `promotions` | `promotion_id`, `store_id` | Associação simples |

---

## 2. Regras Oficiais

### 2.1 Herança

```
Campo na bridge = NULL  →  herda valor da tabela base
Campo na bridge = valor  →  usa valor da bridge (override)
```

### 2.2 Override Fields

| Campo Base | Campo Bridge | Tipo |
|-----------|-------------|------|
| `products.price` | `store_products.override_price` | NUMERIC(10,2) |
| `products.stock_quantity` | `store_products.override_stock_quantity` | INTEGER |
| `products.sku` | `store_products.override_sku` | TEXT |
| `services.price` | `store_services.override_price` | NUMERIC(10,2) |
| `services.stock_quantity` | `store_services.override_stock_quantity` | INTEGER |
| `services.sku` | `store_services.override_sku` | TEXT |
| `product_kits.kit_price` | `store_product_kits.override_price` | NUMERIC(10,2) |
| `product_variants.stock_quantity` | `store_product_variants.override_stock_quantity` | INTEGER |

### 2.3 Visibility Scope

| Escopo | Comportamento |
|--------|---------------|
| **`all`** | Produto visível em TODAS as lojas do parceiro, com override se houver |
| **`selected`** | Produto visível APENAS nas lojas que têm bridge explícita |
| **`exclusive`** | Produto visível APENAS na loja dona da bridge |
| **Sem bridge** | Produto tratado como global legado (visível em todas as lojas) |

### 2.4 Marketplace Visibility

```
store_products.marketplace_visible = true  →  aparece no marketplace (discovery/search)
store_products.marketplace_visible = false →  oculto do marketplace, mas visível no ERP
Sem bridge                                     →  usa products.show_in_marketplace (default true)
```

**Regra de visibilidade marketplace composta:**

```sql
-- Um produto é visível no marketplace se:
(products.show_in_marketplace = true)
AND (
  -- Sem bridge → visível (legacy global)
  NOT EXISTS (SELECT 1 FROM store_products WHERE product_id = products.id)
  OR EXISTS (
    SELECT 1 FROM store_products
    WHERE product_id = products.id
      AND marketplace_visible = true
      AND is_active = true
      AND (visibility_scope = 'all' OR visibility_scope = 'selected' OR visibility_scope = 'exclusive')
      -- 'selected'/'exclusive' são resolvidos no contexto da loja
  )
)
```

### 2.5 Resolução (Runtime)

```
resolveProduct(productId, storeId?) → ResolvedProduct
  - Se storeId é fornecido:
    1. Busca store_products para (productId, storeId)
    2. Se existe: mergeia overrides, aplica visibility_scope
    3. Se não existe: retorna produto base (sem override)
  - Se storeId é null: retorna produto base (contexto global)
```

**Helpers implementados:**
- `buildResolvedProduct()` — `lib/store-products.ts`
- `buildResolvedService()` — `lib/store-services.ts`
- `resolveKitsForStore()` — `lib/resolve-marketplace-visibility.ts`
- `resolveSuppliersForStore()` — `lib/resolve-marketplace-visibility.ts`

---

## 3. Fluxos Validados

### 3.1 Criação de Produto (ERP)

**Server action:** `app/actions/erp/products.ts` — `createProductAction`
1. Valida permissão do usuário
2. INSERT em `products` (sem `store_id`)
3. Se `storeId` fornecido: chama `linkProductToStore(product.id, storeId)` → insere em `store_products`

**RPC:** `create_product_transaction` (via JSONB)
1. INSERT em `products` (sem `store_id`)
2. Se `p_product_data->>'store_id'` existe: INSERT em `store_products`

### 3.2 Criação de Serviço (ERP)

**Server action:** `app/actions/erp/servicos.ts` — `createServiceAction`
1. INSERT em `services` (sem `store_id`)
2. Chama `linkServiceToStore(service.id, storeId)`

### 3.3 Duplicação

| Entidade | Função | Comportamento |
|----------|--------|---------------|
| Produto (server action) | `duplicateProductsAction` | Copia base product, replica bridges via `store_products` |
| Produto (service layer) | `ProductService.duplicate()` | Copia base product, replica bridges via `store_products` |
| Serviço (server action) | `duplicateServiceAction` | Copia base service, replica bridges via `store_services` |

### 3.4 Importação

| Fluxo | Caminho | Bridge |
|-------|---------|--------|
| XML (RPC) | `execute_xml_import` | `store_products` insert após criar produto |
| XML (server action) | `importProductsFromXMLAction` | `linkProductToStore` após insert |
| Batch import | `importProductBatch` + `importServiceBatch` | `linkProductToStore` / `linkServiceToStore` após batch insert |

### 3.5 Marketplace

| Fluxo | Função | Arquivo |
|-------|--------|---------|
| Discovery (global) | `filterMarketplaceVisibleProducts` | `lib/store-queries.ts` |
| Search (global) | `filterMarketplaceVisibleServices` | `lib/store-queries.ts` |
| Store page | `listStoreProducts(partnerId, storeId)` | `lib/store-queries.ts` |
| PDP | `getMarketplaceProduct(id, storeId?)` | `app/actions/marketplace/products.ts` |
| Checkout | `resolveProduct(productId, storeId)` + validações | `app/actions/erp/orders.ts` |

### 3.6 RLS por Classificação

| Classificação | Policy Pattern | Exemplo |
|--------------|---------------|---------|
| **GLOBAL** | `partner_id IN (SELECT get_user_partner_ids())` | `products`, `services`, `customers` |
| **STORE** | `user_has_store_access(store_id)` | `orders`, `transactions` |
| **HYBRID nullable** | `store_id IS NULL OR user_has_store_access(store_id)` | `payment_methods`, `campaigns` |
| **Bridge tables** | `store_id IN (user_store_ids())` + RLS via FK | `store_products`, `store_services` |

---

## 4. Breaking Changes Realizados

### 4.1 Colunas Removidas (F4.3)

| Tabela | Coluna | Data |
|--------|--------|------|
| `products` | `store_id` | 2026-07-18 |
| `services` | `store_id` | 2026-07-18 |
| `customers` | `store_id` | 2026-07-18 |
| `suppliers` | `store_id` | 2026-07-18 |
| `product_kits` | `store_id` | 2026-07-18 |

**Rollback disponível:** Ver `migrations/f4_3_drop_column_store_id.sql` (comentário no final).

### 4.2 Queries Migradas

| Arquivo | Mudança |
|---------|---------|
| `lib/store-queries.ts:93` | Removido `store_id` do SELECT customers |
| `lib/store-queries.ts:110-111` | Removido sort por `store_id` em customers |
| `lib/store-queries.ts:192` | `fetchStoreSuppliers` migrado de `suppliers.store_id` para `store_suppliers` bridge |

### 4.3 RPCs Alteradas (F4.1a + F4.1b)

| RPC | Mudança |
|-----|---------|
| `create_product_transaction` | INSERT em products sem store_id; cria `store_products` após |
| `execute_xml_import` | INSERT em products sem store_id; cria `store_products` após |

### 4.4 RLS Policies Atualizadas (F4.2)

| Tabela | Policy Antiga | Policy Nova |
|--------|--------------|-------------|
| `products` | `store_id IS NULL OR user_has_store_access(store_id)` | `partner_id IN (get_user_partner_ids())` |
| `services` | idem | idem |
| `customers` | idem | idem |
| `suppliers` | idem | idem |
| `product_kits` | idem | idem |

### 4.5 Índices Removidos (F4.2)

| Índice | Tabela |
|--------|--------|
| `idx_products_store_id` | `products` |
| `idx_services_store_id` | `services` |
| `idx_services_store_id_created` | `services` |
| `idx_suppliers_store_id` | `suppliers` |
| `idx_product_kits_store_id` | `product_kits` |

---

## 5. Checklist de Segurança

### ✅ Nenhuma coluna legacy ativa

| Coluna | Status | Source of Truth |
|--------|--------|----------------|
| `products.store_id` | ❌ DROPPED | `store_products` |
| `services.store_id` | ❌ DROPPED | `store_services` |
| `customers.store_id` | ❌ DROPPED | Partner-level (customer é global) |
| `suppliers.store_id` | ❌ DROPPED | `store_suppliers` |
| `product_kits.store_id` | ❌ DROPPED | `store_product_kits` |

### ✅ Nenhuma dependência de código ativa

- [x] Nenhum INSERT/UPDATE em TypeScript escreve `store_id` nas 5 tabelas
- [x] Nenhum RPC referencia `store_id` nas 5 tabelas
- [x] Nenhuma trigger referencia `store_id`
- [x] Nenhuma view referencia `store_id`
- [x] Nenhuma RLS policy referencia `store_id` nas 5 tabelas
- [x] Nenhum index em `store_id` nas 5 tabelas
- [x] `npx tsc --noEmit` passa sem erros

### ✅ Bridges como Source of Truth

| Associação | Bridge | Cobertura |
|-----------|--------|-----------|
| Produto → Loja | `store_products` | 24/24 produtos (100%) |
| Serviço → Loja | `store_services` | 8/8 serviços (100%) |
| Fornecedor → Loja | `store_suppliers` | 0/0 (sem dados legacy) |
| Kit → Loja | `store_product_kits` | 0/0 (sem dados legacy) |
| Variante → Loja | `store_product_variants` | Implementado |

### ✅ RLS Validada

- [x] GLOBAL: `partner_id IN (get_user_partner_ids())`
- [x] STORE: `user_has_store_access(store_id)`
- [x] HYBRID: `store_id IS NULL OR user_has_store_access(store_id)`
- [x] Service role key consegue ler/escrever todas as tabelas

### ✅ Testes Finais

- [x] **26/26 testes automatizados** passaram (CRUD + bridge + multi-store isolation)
- [x] Produto exclusive da Loja A **não** visível para Loja B
- [x] `store_products.visibility_scope = 'selected'` respeita bridge
- [x] `store_products.marketplace_visible = false` oculta do marketplace
- [x] INSERT sem `store_id` funciona em todas as 5 tabelas
- [x] Bridge link + override fields acessíveis

---

## 6. Resumo de Migrations Aplicadas (Fase 4)

| Migration | Objetivo | Status |
|-----------|----------|--------|
| `f4_1a_update_create_product_rpc.sql` | Atualizar RPC `create_product_transaction` | ✅ |
| `f4_1b_update_xml_import_rpc.sql` | Atualizar RPC `execute_xml_import` | ✅ |
| `f4_1c_migrate_legacy_bridges.sql` | Migrar suppliers + kits legacy para bridges | ✅ |
| `f4_1d_backfill_missing_bridges.sql` | Backfill de segurança (coverage 100%) | ✅ |
| `f4_2_update_rls_and_drop_indexes.sql` | Atualizar RLS + dropar indexes | ✅ |
| `f4_3_drop_column_store_id.sql` | DROP COLUMN nas 5 tabelas | ✅ |

---

## 7. Próximos Passos (Fora do Escopo F4)

| Item | Prioridade | Descrição |
|------|-----------|-----------|
| Fase 5 — STORE órfãs | 🔴 Alta | Revisar `deliveries`, `returns`, `service_orders` que ainda podem ter inconsistências de store_id |
| Fase 1b — Fiscal store_id nullable | 🟢 Baixa | Adicionar `store_id` nullable em `product_fiscal_profiles` se necessário |
| Marketplace discover/search para kits+suppliers | 🟢 Baixa | Implementar filtros de marketplace para kits e fornecedores |
| `created_store_id` em products | 🟢 Baixa | Campo opcional para rastrear loja de origem do produto |
