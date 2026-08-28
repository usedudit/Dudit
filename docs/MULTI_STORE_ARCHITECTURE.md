# Multi-Store Architecture

> Arquitetura oficial multi-store da DUDIT.
> Baseline: Fase 4.5 - bridge performance optimization.
> Data: 2026-07-18

---

## 1. Modelo de Classificação

Toda tabela no banco segue UMA das seguintes classificações:

### 🟦 GLOBAL - sem store_id, dados do parceiro

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
| `product_fiscal_profiles` | Dados fiscais do produto |
| `product_logistics` | Dados logísticos do produto |

### 🟧 STORE - store_id NOT NULL, pertencem a uma loja

| Tabela | RLS |
|--------|-----|
| `orders`, `order_items` | `user_has_store_access(store_id)` |
| `cart_items` | `user_has_store_access(store_id)` |
| `pre_sales`, `sale_items` | `user_has_store_access(store_id)` |
| `cash_sessions`, `cash_movements` | `user_has_store_access(store_id)` |
| `stock_movements` | `user_has_store_access(store_id)` |
| `transactions` | `user_has_store_access(store_id)` |
| `accounts_payable`, `accounts_receivable` | `user_has_store_access(store_id)` |
| `recurring_transactions` | `user_has_store_access(store_id)` |
| `appointments` | `user_has_store_access(store_id)` |
| `service_orders` | `user_has_store_access(store_id)` |
| `deliveries` | `user_has_store_access(store_id)` |
| `delivery_settings` | `user_has_store_access(store_id)` |
| `store_credits` | `user_has_store_access(store_id)` |

### 🟩 HYBRID nullable - store_id NULL = global, preenchido = store-level

| Tabela | RLS |
|--------|-----|
| `payment_methods` | `store_id IS NULL OR user_has_store_access(store_id)` |
| `financial_categories` | idem |
| `finance_accounts` | idem |
| `transaction_contacts` | idem |
| `campaigns` | idem |
| `promotions` | idem |
| `coupons` | idem |
| `quotes` / `quote_items` | idem |
| `partner_whatsapp_connections` | idem |
| `whatsapp_messages` | idem |
| `reviews` | Leitura global, filtro opcional por store_id |

### 🟪 BRIDGE - tabelas que conectam GLOBAL → STORE

| Bridge | Tabela Base | Unique Key | Override Fields |
|--------|------------|------------|-----------------|
| `store_products` | `products` | `(product_id, store_id)` | `override_price`, `override_stock_quantity`, `override_sku`, `is_active`, `visibility_scope`, `marketplace_visible` |
| `store_services` | `services` | `(service_id, store_id)` | `override_price`, `override_stock_quantity`, `override_sku`, `is_active`, `visibility_scope`, `marketplace_visible` |
| `store_suppliers` | `suppliers` | `(supplier_id, store_id)` | `is_active`, `visibility_scope`, `marketplace_visible` |
| `store_product_kits` | `product_kits` | `(kit_id, store_id)` | `override_price`, `is_active`, `visibility_scope`, `marketplace_visible` |
| `store_product_variants` | `product_variants` | `(variant_id, store_id)` | `override_stock_quantity`, `is_active`, `stock_reserved`, `stock_available` |
| `coupon_stores` | `coupons` | `(coupon_id, store_id)` | Associação simples |
| `promotion_stores` | `promotions` | `(promotion_id, store_id)` | Associação simples |

---

## 2. Bridges como Source of Truth

A associação entre uma entidade GLOBAL e uma STORE **sempre** passa pela bridge correspondente.

**Regra fundamental:** Nenhuma tabela GLOBAL (products, services, customers, suppliers, product_kits) possui coluna `store_id`. A coluna `store_id` foi **removida** dessas 5 tabelas na Fase 4.3.

```
products ──[store_products]──→ stores
services ──[store_services]──→ stores
suppliers ──[store_suppliers]──→ stores
product_kits ──[store_product_kits]──→ stores
product_variants ──[store_product_variants]──→ stores
```

---

## 3. Regras de Override

### 3.1 Herança

```
Campo na bridge = NULL  →  herda valor da tabela base
Campo na bridge = valor →  usa valor da bridge (override)
```

### 3.2 Campos Sobrescrevíveis

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

### 3.3 Campos Não Sobrescrevíveis (GLOBAIS)

| Campo | Motivo |
|-------|--------|
| Nome, descrição, imagens | Produto/serviço é o mesmo em todas as lojas |
| Categoria, marca | Taxonomia global |
| Dados fiscais (NCM, CFOP) | Atributo do produto |
| Dados logísticos (peso, dimensões) | Atributo do produto |

---

## 4. Regras de visibility_scope

### 4.1 Escopos

| Escopo | Comportamento |
|--------|---------------|
| **`all`** | Entidade visível em TODAS as lojas do parceiro, com override se houver |
| **`selected`** | Entidade visível APENAS nas lojas que têm bridge explícita com este scope |
| **`exclusive`** | Entidade visível APENAS na loja que possui a bridge |
| **Sem bridge** | Entidade tratada como global legado (visível em todas as lojas) |

### 4.2 Resolução em Runtime

`resolveProduct(productId, storeId?)`:

1. Busca `store_products` para `(productId, storeId)`
2. Se existe bridge:
   - Aplica overrides via `COALESCE`
   - Respeita `visibility_scope` (já está na bridge)
3. Se **não** existe bridge:
   - Verifica se há bridges para outras lojas
   - Se alguma bridge tem scope='all' → produto visível, sem override
   - Se só há bridges 'selected'/'exclusive' → produto **não visível** para esta loja
   - Se nenhuma bridge existe → produto global legado (visível)

### 4.3 Implementação

Toda resolução passa por `buildResolvedProduct()` em `lib/store-products.ts` e `buildResolvedService()` em `lib/store-services.ts`. **Nunca fazer COALESCE manual.**

---

## 5. Regras de marketplace_visible

### 5.1 Comportamento

```
store_products.marketplace_visible = true  →  aparece no marketplace (discovery/search)
store_products.marketplace_visible = false →  oculto do marketplace, visível no ERP
Sem bridge                                →  usa products.show_in_marketplace (default true)
```

### 5.2 Regra Composta

Um produto é visível no marketplace se:

```sql
(products.show_in_marketplace = true)
AND (
  -- Sem bridge → visível como global legado
  NOT EXISTS (SELECT 1 FROM store_products WHERE product_id = products.id)
  OR EXISTS (
    SELECT 1 FROM store_products
    WHERE product_id = products.id
      AND marketplace_visible = true
      AND is_active = true
  )
)
```

### 5.3 Filtros Implementados

| Função | Arquivo | Contexto |
|--------|---------|----------|
| `filterMarketplaceVisibleProducts` | `lib/store-queries.ts` | Discovery global |
| `filterMarketplaceVisibleServices` | `lib/store-queries.ts` | Discovery global |
| `filterMarketplaceVisibleKits` | `lib/resolve-marketplace-visibility.ts` | Discovery global |
| `filterMarketplaceVisibleSuppliers` | `lib/resolve-marketplace-visibility.ts` | Discovery global |

---

## 6. RLS Patterns

### 6.1 Por Classificação

| Classificação | Policy Pattern |
|--------------|---------------|
| **GLOBAL** | `partner_id IN (SELECT get_user_partner_ids())` |
| **STORE** | `user_has_store_access(store_id)` |
| **HYBRID nullable** | `(store_id IS NULL OR user_has_store_access(store_id))` |
| **BRIDGE** | `store_id IN (SELECT user_store_ids())` (ou RLS via FK na tabela base) |

### 6.2 Funções de Apoio

| Função | Descrição |
|--------|-----------|
| `get_user_partner_ids()` | Retorna partner_ids do usuário autenticado |
| `user_has_store_access(store_id)` | Verifica se usuário tem acesso à loja via `store_members` |
| `user_store_ids()` | Retorna array de store_ids acessíveis |

---

## 7. Fluxos Oficiais

### 7.1 Criação de Produto (ERP)

**Server action:** `app/actions/erp/products.ts` - `createProductAction`

1. Valida permissão do usuário
2. INSERT em `products` (sem `store_id`)
3. Se `storeId` fornecido: chama `linkProductToStore(product.id, storeId)` → INSERT em `store_products`

**RPC (importação JSONB):** `create_product_transaction`

1. INSERT em `products` (sem `store_id`)
2. Se `p_product_data->>'store_id'` existe: INSERT em `store_products`

### 7.2 Criação de Serviço (ERP)

**Server action:** `app/actions/erp/servicos.ts` - `createServiceAction`

1. INSERT em `services` (sem `store_id`)
2. Chama `linkServiceToStore(service.id, storeId)` → INSERT em `store_services`

### 7.3 Duplicação

| Entidade | Função | Comportamento |
|----------|--------|---------------|
| Produto | `duplicateProductsAction` + `ProductService.duplicate()` | Copia product base + replica bridges via `store_products` |
| Serviço | `duplicateServiceAction` | Copia service base + replica bridges via `store_services` |

### 7.4 Importação

| Fluxo | Caminho | Bridge |
|-------|---------|--------|
| XML (RPC) | `execute_xml_import` | `store_products` INSERT após criar produto |
| XML (server action) | `importProductsFromXMLAction` | `linkProductToStore` após INSERT |
| Batch import | `importProductBatch` + `importServiceBatch` | `linkProductToStore` / `linkServiceToStore` |

### 7.5 Consulta no Marketplace

| Fluxo | Função | Arquivo |
|-------|--------|---------|
| Discovery global | `filterMarketplaceVisibleProducts` / `filterMarketplaceVisibleServices` | `lib/store-queries.ts` |
| Store page (catálogo) | `listStoreProducts(partnerId, storeId)` / `listStoreServices(partnerId, storeId)` | `lib/store-queries.ts` |
| PDP | `getMarketplaceProduct(id, storeId?)` / `getMarketplaceService(id, storeId?)` | `app/actions/marketplace/products.ts` |
| Checkout | `resolveProduct(productId, storeId)` + validações | `app/actions/erp/orders.ts` |
| Carrinho | `resolveProduct(productId, storeId)` | Server actions |

### 7.6 Herança Automática (Nova Loja)

Quando uma nova loja é criada, ela herda **automaticamente** sem criar dados:

| Entidade | Herda? | Mecanismo |
|----------|--------|-----------|
| Produtos | ✅ | `resolveProduct(storeId)` retorna produtos sem bridge ou com scope='all' |
| Serviços | ✅ | `resolveService(storeId)` mesmo padrão |
| Kits | ✅ | Nenhuma bridge → global |
| Fornecedores | ✅ | Nenhuma bridge → global |
| Clientes | ✅ | GLOBAL sem store_id |
| Categorias financeiras | ✅ | `store_id IS NULL` → visível |
| Contas financeiras | ✅ | `store_id IS NULL` → visível |
| Campanhas | ✅ | `store_id IS NULL` → visível |
| Métodos de pagamento | ✅ | `store_id IS NULL` → visível |

---

## 8. Funções Core

| Função | Arquivo | Descrição |
|--------|---------|-----------|
| `resolveProduct(productId, storeId?)` | `lib/store-products.ts` | Resolve produto com overrides e visibility_scope |
| `listStoreProducts(partnerId, storeId, opts?)` | `lib/store-products.ts` | Lista produtos resolvidos (com LEFT JOIN batch) |
| `linkProductToStore(productId, storeId, overrides?)` | `lib/store-products.ts` | Cria/atualiza bridge produto-loja |
| `updateStoreProductOverride(productId, storeId, overrides)` | `lib/store-products.ts` | Atualiza overrides existentes |
| `unlinkProductFromStore(productId, storeId)` | `lib/store-products.ts` | Remove bridge |
| `getProductStoreLinks(productId)` | `lib/store-products.ts` | Lista bridges de um produto |
| `resolveVariant(variantId, storeId)` | `lib/store-variants.ts` | Resolve variante com override |
| `listStoreProductVariants(productId, storeId, opts?)` | `lib/store-variants.ts` | Lista variantes de 1 produto (LEFT JOIN) |
| `listStoreProductVariantsBatch(productIds, storeId, opts?)` | `lib/store-variants.ts` | Lista variantes de N produtos (1 query) |
| `resolveService(serviceId, storeId?)` | `lib/store-services.ts` | Resolve serviço com overrides |
| `listStoreServices(partnerId, storeId, opts?)` | `lib/store-services.ts` | Lista serviços resolvidos |
| `resolveKitsForStore(kits, storeId)` | `lib/resolve-marketplace-visibility.ts` | Resolve kits com override |
| `resolveSuppliersForStore(suppliers, storeId)` | `lib/resolve-marketplace-visibility.ts` | Resolve fornecedores com override |

---

## 9. Otimizações de Performance

### 9.1 Batch Queries

| Problema | Solução | Arquivo |
|----------|---------|---------|
| N+1 em variantes por produto | `listStoreProductVariantsBatch()` - única query com `IN (...)` | `lib/store-variants.ts` |
| N+1 em visibility_scope check | Query única com `IN (productIds)` + Map em memória | `lib/store-products.ts:156-179` |

### 9.2 LEFT JOIN vs Subqueries

Prefere-se LEFT JOIN único com store_products/store_product_variants em vez de subqueries N+1, desde que o volume não exceda ~100 registros por página (padrão atual: limit=100).
