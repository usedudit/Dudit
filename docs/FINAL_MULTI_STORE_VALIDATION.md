# Validação Arquitetural Multi-Store — Baseline Final Pós-F4

## Status: ✅ BASELINE FINAL — Architecture: MULTI_STORE_ARCHITECTURE.md

---

## 1. Produtos / Serviços / Kits / Fornecedores

### ✅ Aprovado

| Item | Arquitetura | Implementação | Status |
|------|-------------|--------------|--------|
| Products base sem store_id | GLOBAL + HYBRID bridge | `lib/store-products.ts` — `products` sem store_id, `store_products` com store_id | ✅ |
| Services base sem store_id | GLOBAL + HYBRID bridge | `lib/store-services.ts` — `services` sem store_id, `store_services` com store_id | ✅ |
| Product Variants + store bridge | HYBRID bridge | `lib/store-variants.ts` — `product_variants` + `store_product_variants` com LEFT JOIN | ✅ |
| Kits | HYBRID bridge (não criada) | `store_kits` não existe ainda | ⏳ Fase 3 |
| Fornecedores | HYBRID bridge (não criada) | `store_suppliers` não existe ainda | ⏳ Fase 3 |
| visibility_scope (all/selected/exclusive) | `store_products.visibility_scope` | Implementado em `resolveProduct`, `resolveService`, `listStoreProducts`, `listStoreServices` | ✅ |
| marketplace_visible | `store_products.marketplace_visible` | Implementado em `buildResolvedProduct`, `buildResolvedService`, `filterMarketplaceVisible*` | ✅ |
| Resolved product with COALESCE | `resolved_price`, `resolved_stock_quantity`, `resolved_sku` | `buildResolvedProduct()` centraliza toda lógica de merge | ✅ |
| `fetchMarketplacePartnerProducts` | Filtro `show_in_marketplace` | `lib/store-queries.ts:53-64` | ✅ |
| Nenhum `products.store_id` em código ativo | ❌ NUNCA usar | Zero referências em `app/` ou `lib/` | ✅ |

### 🔴 GAP 1: PDP sem store context

**Arquivo:** `app/[cidadeUf]/[slug]/p/[id]/page.tsx:102`

```ts
const product = await getMarketplaceProduct(id) // ❌ sem storeId
```

A página tem acesso ao `slug` (store slug) via `params.slug` (linha 97), mas não resolve `slug` → `storeId` antes de chamar `getMarketplaceProduct()`. Isso significa que:

- `_getMarketplaceProductBase` NÃO chama `resolveProduct(id, storeId)` (linhas 63-75 de products.ts — só executa se `storeId` é passado)
- Produtos com `visibility_scope='exclusive'` para Loja B aparecem na PDP da Loja A
- Produtos com `visibility_scope='selected'` sem bridge para a loja atual aparecem

**Risco:** 🔴 ALTO — bypass de visibilidade na página de produto

**Correção necessária:** 
```ts
const storeSlug = (await params).slug
const store = storeSlug ? await getStoreBySlug(storeSlug) : null
const product = await getMarketplaceProduct(id, store?.id || null)
```

**Nota:** O mesmo se aplica à página de serviço (`/p/servico/[id]` ou similar). Verificar se o padrão de URL inclui store context.

### 🟡 GAP 2: Reviews sem filtro store_id

**Arquivo:** `app/actions/marketplace/products.ts:143-148`

```ts
async function _getProductReviews(productId: string) {
  // Só filtra por product_id, sem considerar store_id
  .from("reviews")
  .select("...")
  .eq("product_id", productId)
```

A arquitetura diz que `reviews` tem `store_id` opcional e que o ranking por loja deve filtrar por `store_id = X`. Porém `_getProductReviews` retorna **todas** as reviews do produto, sem filtro de loja.

**Risco:** 🟡 MÉDIO — PDP exibe reviews de outras lojas para o mesmo produto

**Correção:** Quando a PDP tem store context, filtrar `reviews` por `store_id = storeId` (ou `store_id IS NULL` para reviews legadas).

---

## 2. Herança e Override

### ✅ Aprovado

| Regra | Como resolve | Implementação | Status |
|-------|-------------|--------------|--------|
| Campo na bridge = NULL → herda base | COALESCE | `buildResolvedProduct` usa `override.override_price ?? product.price` | ✅ |
| Preço override por loja | `store_products.override_price` | ✅ |
| Estoque override por loja | `store_products.override_stock_quantity` | ✅ |
| SKU override por loja | `store_products.override_sku` | ✅ |
| Produto oculto em loja específica | `store_products.is_active = false` | ✅ |
| Produto exclusivo de loja | `visibility_scope = 'exclusive'` | ✅ em resolveProduct, resolveService |
| Loja sem bridge = herda tudo | `allLinks` check — sem bridge e sem scope='all' links → retorna null | ✅ |

### 📋 Regra oficial de herança documentada

```
CAMPO NO PRODUCTS BASE:      products.price = R$ 10,00
CAMPO NO STORE_PRODUCTS:    override_price = NULL  →  resolve p/ R$ 10,00 (herdado)
CAMPO NO STORE_PRODUCTS:    override_price = 12.00 →  resolve p/ R$ 12,00 (override)

VISIBILITY:
  Sem store_products → visível em TODAS as lojas (legacy global)
  store_products com visibility_scope='all' → visível, com override se houver
  store_products com visibility_scope='selected' → visível SÓ nas lojas com bridge
  store_products com visibility_scope='exclusive' → visível SÓ na loja com bridge
  store_products.is_active=false → oculto naquela loja
  store_products.marketplace_visible=false → oculto no marketplace (mas visível no ERP)
```

### Campos — Herdáveis vs Sobrescrevíveis vs Globais vs Store-only

| Campo | Herdável | Sobrescrevível | Global | Store-only |
|-------|----------|----------------|--------|------------|
| Nome | ✅ | ❌ | ✅ | ❌ |
| Descrição | ✅ | ❌ | ✅ | ❌ |
| Imagens | ✅ | ❌ | ✅ | ❌ |
| Categoria | ✅ | ❌ | ✅ | ❌ |
| Marca | ✅ | ❌ | ✅ | ❌ |
| Preço | ✅ | ✅ (override_price) | ✅ | ✅ |
| Estoque | ✅ | ✅ (override_stock_quantity) | ✅ | ✅ |
| SKU | ✅ | ✅ (override_sku) | ✅ | ✅ |
| Ativo | ✅ | ✅ (store_products.is_active) | ✅ | ✅ |
| Visibilidade marketplace | ✅ | ✅ (marketplace_visible) | ✅ | ✅ |
| Visibility scope | N/A | ✅ (store_products.visibility_scope) | ❌ | ✅ |
| Dados fiscais (NCM, CFOP) | ❌ (GLOBAL) | 🔧 pendente | ✅ | ❌ |
| Dados logísticos (peso, dimensões) | ❌ (GLOBAL) | ❌ | ✅ | ❌ |

---

## 3. Marketplace — Fluxo Completo

### ✅ Aprovado

| Fluxo | Store Context | Resolvedor | Status |
|-------|--------------|------------|--------|
| Marketplace Discovery | Global (sem loja específica) | `filterMarketplaceVisibleProducts` | ✅ |
| Marketplace Search | Global | `filterMarketplaceVisibleProducts/Services` | ✅ |
| Página da Loja | ✅ `storeId` resolvido do slug | `listStoreProducts(partnerId, storeId)` | ✅ |
| PDP (com store context) | ⚠️ NÃO passa storeId | `getMarketplaceProduct(id)` sem storeId | 🔴 GAP 1 |
| Checkout | ✅ `storeId` do carrinho | `resolveProduct(productId, storeId)` | ✅ |
| Carrinho | ✅ `storeId` do item | Server actions validam | ✅ |
| Cupons | `coupon_stores` bridge | Já implementado | ✅ |
| Campanhas | `campaigns.store_id` nullable | Migration pronta (F17_03) | ✅ |
| Assinaturas | `recurring_plans` GLOBAL, `recurring_subscriptions` STORE | Pendente store_id | ⏳ Fase 5 |
| Entrega | `delivery_settings.store_id` | Já implementado | ✅ |

### Ranking — Validação por Loja

| Métrica | Arquitetura | Implementação | Status |
|---------|-------------|--------------|--------|
| Ranking global | AVG(rating) sem filtro store | ✅ — `ranking.ts` processa dados recebidos | ✅ |
| Ranking por loja | AVG(rating) com `store_id = X` | 🔧 — `_getProductReviews` não filtra por store_id | 🟡 GAP 2 |
| Reviews por loja | `reviews.store_id = X OR NULL` | Mesmo gap — GET reviews sem filtro store | 🟡 GAP 2 |
| Marketplace score | `marketplace_score` no product | Score do produto base, não por loja | ✅ (aceitável) |
| Cache/Redis | Isolado por storeId no cache key | `store-products-${storeId}`, `store-services-${storeId}` | ✅ |

---

## 4. Client / Server Security

### ✅ Aprovado

| Aspecto | Status |
|---------|--------|
| Queries client-side `products`/`services` | 2 encontrados e corrigidos na F2.6 (gift queries) |
| Server actions aceitam storeId do client | Validam via `assertCanBuyFromPartner` + `getCurrentUser` |
| Trocar storeId manualmente | RLS `user_has_store_access(store_id)` impede |
| RLS HYBRID nullable | `(store_id IS NULL OR user_has_store_access(store_id))` ✅ |
| RLS STORE | `user_has_store_access(store_id)` ✅ |
| RLS GLOBAL | `partner_id IN get_user_partner_ids()` ✅ |
| Loaders client-side | `lib/store-queries.ts` — ERP admin autenticado (correto) |
| `use-store-data.ts` | Dead code (0 imports) — latente |

---

## 5. Financeiro

### ✅ Aprovado

| Tabela | Classificação | store_id | RLS | Status |
|--------|--------------|----------|-----|--------|
| `transactions` | STORE | ✅ NOT NULL | `user_has_store_access` | ✅ |
| `accounts_payable` | STORE | ✅ NOT NULL | `user_has_store_access` | ✅ |
| `accounts_receivable` | STORE | ✅ NOT NULL | `user_has_store_access` | ✅ |
| `cash_sessions` | STORE | ✅ NOT NULL | `user_has_store_access` | ✅ |
| `cash_movements` | STORE | ✅ NOT NULL | `user_has_store_access` | ✅ |
| `recurring_transactions` | STORE | ✅ NOT NULL | `user_has_store_access` | ✅ |
| `financial_categories` | HYBRID nullable | 🔧 Adicionado | `(store_id IS NULL OR user_has_store_access)` ✅ f17_04 | ✅ |
| `finance_accounts` | HYBRID nullable | 🔧 Adicionado | `(store_id IS NULL OR user_has_store_access)` ✅ f17_04 | ✅ |
| `transaction_contacts` | HYBRID nullable | 🔧 Adicionado | `(store_id IS NULL OR user_has_store_access)` ✅ f17_04 | ✅ |
| `payment_methods` | HYBRID nullable | ✅ Existente | `(store_id IS NULL OR user_has_store_access)` | ✅ |

### Vazamento Financeiro

**Risco: 🟢 NENHUM.** Operações financeiras (transactions, contas a pagar/receber, caixa) têm `store_id NOT NULL` com RLS `user_has_store_access(store_id)`. Cadastros financeiros híbridos têm `store_id NULLABLE` com RLS que isola por loja.

---

## 6. Produtos/Serviços Globais vs Loja — Regra Oficial

### Quando uma NOVA loja é criada

**Ela herda automaticamente (sem criar dados):**

| Entidade | Herda? | Mecanismo |
|----------|--------|-----------|
| Produtos | ✅ Herda — visíveis sem bridge | `resolveProduct(storeId)` retorna produtos com scope='all' ou sem bridge |
| Serviços | ✅ Herda — mesmo padrão | `resolveService(storeId)` |
| Kits | ✅ Herda (após Fase 3) | `store_kits` não criada → visível como global |
| Fornecedores | ✅ Herda — visíveis sem bridge | `store_suppliers` não criada → visível |
| Clientes | ✅ Herda — GLOBAL sem store_id | `customers` sem store_id |
| Categorias financeiras | ✅ Herda — GLOBAL | `store_id IS NULL` → visível |
| Contas financeiras | ✅ Herda — GLOBAL | `store_id IS NULL` → visível |
| Contatos | ✅ Herda — GLOBAL | `store_id IS NULL` → visível |
| Campanhas | ✅ Herda — GLOBAL | `store_id IS NULL` → visível |
| Métodos de pagamento | ✅ Herda — GLOBAL | `store_id IS NULL` → visível |
| Planos recorrentes | ✅ Herda — GLOBAL | `recurring_plans` sem store_id |
| Vídeos comunidade | ✅ Herda — GLOBAL | `community_videos` sem store_id |

### O que a loja PODE fazer depois:

| Ação | Como | Exemplo |
|------|------|---------|
| **Esconder** produto herdado | Criar `store_products.is_active=false` | "Coca Cola 2L não vende nesta loja" |
| **Esconder** fornecedor herdado | Criar `store_suppliers.is_active=false` | "Distribuidora ABC desativada nesta loja" |
| **Sobrescrever** preço/estoque/SKU | `store_products.override_*` | "Preço R$12 na Loja Centro" |
| **Criar exclusivo** | `products` global + `store_products` com scope='exclusive' | "Combo Executivo Centro" |
| **Tornar selecionado** | `store_products.visibility_scope='selected'` | "Promoção só em lojas selecionadas" |
| **Ocultar do marketplace** | `store_products.marketplace_visible=false` | "Produto só no ERP, não no site" |
| **Criar conta financeira própria** | `finance_accounts` com `store_id=UUID` | "Itaú Centro" |
| **Criar categoria financeira própria** | `financial_categories` com `store_id=UUID` | "Taxa Centro" |

### O que a loja NÃO pode:

| Ação | Motivo |
|------|--------|
| Excluir produto base | Produto é GLOBAL da marca |
| Remover cliente | Cliente é da marca, não da loja |
| Mudar nome/descrição global do produto | Seria confuso — produto é o mesmo |
| Ver dados financeiros de outra loja | RLS impede |
| Ver produtos exclusive de outra loja | `visibility_scope='exclusive'` + `storeId` filter impede |

---

## 7. Resumo de Problemas Encontrados

### ~~🔴 GAP 1 — PDP sem store context~~ ✅ CORRIGIDO

| Item | Detalhe |
|------|---------|
| **Arquivos** | `app/[cidadeUf]/[slug]/p/[id]/page.tsx`, `app/[cidadeUf]/[slug]/s/[id]/page.tsx` |
| **Problema** | `getMarketplaceProduct(id)` chamado sem `storeId`, ignorando visibility_scope |
| **Correção** | Resolver `slug → storeId` via `getStoreBySlug(slug)` e passar para `getMarketplaceProduct(id, storeId)` / `getMarketplaceService(id, storeId)` |
| **Resultado** | `_getMarketplaceProductBase` agora ativa `resolveProduct(id, storeId)` — respeita `visibility_scope`, `is_active`, `marketplace_visible` |

### ~~🟡 GAP 2 — Reviews sem filtro store_id~~ ✅ CORRIGIDO

| Item | Detalhe |
|------|---------|
| **Arquivos** | `app/actions/marketplace/products.ts`, `app/actions/marketplace/services.ts` |
| **Problema** | `_getProductReviews` retorna reviews de TODAS as lojas para o produto |
| **Correção** | Aceitar `storeId` opcional e filtrar `reviews.store_id = storeId OR store_id IS NULL` |
| **Resultado** | PDP com storeId: mostra apenas reviews da loja + reviews legadas. PDP sem storeId: mostra todas (backward compat). |

### ✅ Fases 3–4 Concluídas (até F4.5)

| Item | Status | Risco |
|------|--------|-------|
| `store_product_kits` bridge | ✅ Concluído | 🟡 Médio |
| `store_suppliers` bridge | ✅ Concluído | 🟡 Médio |
| Resolver functions (kits+suppliers) | ✅ Concluído | 🟡 Médio |
| **Remover store_id legacy (products, services, customers, suppliers, product_kits)** | **✅ F4.3 CONCLUÍDO** | 🟡 Médio |
| — F4.0: Auditoria completa | ✅ | 🟢 |
| — F4.1: Parar writes + bridge backfill | ✅ | 🟢 |
| — F4.2: RLS atualizado + indexes dropados | ✅ | 🟢 |
| — F4.3: DROP COLUMN nas 5 tabelas | ✅ | 🟢 |
| — F4.4: Post-migration integrity audit (65 checks, 0 falhas) | ✅ | 🟢 |
| — F4.5: N+1 optimization (variants batch query) | ✅ | 🟢 |
| **Oficial Architecture Baseline** | **✅ MULTI_STORE_ARCHITECTURE.md** | 🟢 |
| STORE órfãs (deliveries, returns, etc) | 🔄 Pendente Fase 5 | 🔴 Alto |
| `product_fiscal_profiles` store_id nullable | 🔄 Pendente Fase 1b | 🟢 Baixo |
| `created_store_id` em products | 🔄 Pendente Fase 4b | 🟢 Baixo |
| Marketplace discover/search para kits+suppliers | 🔄 Pendente | 🟢 Baixo |

---

## 8. Matriz GO / NO-GO Final

### ✅ GO — Aprovado sem ressalvas

| Item | Veredito |
|------|----------|
| Products/Services resolve + bridge pattern | ✅ |
| visibility_scope (all/selected/exclusive) | ✅ |
| store_products/store_services override fields | ✅ |
| product_variants + store_product_variants | ✅ |
| Marketplace Discovery + Search | ✅ (F2.5) |
| Store page (catálogo) | ✅ |
| RLS HYBRID nullable (financeiro) | ✅ (f17_04) |
| RLS STORE (operações) | ✅ |
| Checkout + Carrinho | ✅ |
| F2.6 Client Hardening | ✅ |
| Client-side audit (0 bypasses ativos) | ✅ |
| npx tsc --noEmit | ✅ |

### ~~⚠️ GO Condicional — Corrigir antes da Fase 3~~ ✅ CORREÇÕES APLICADAS

| Ressalva | Status | Arquivos |
|----------|--------|---------|
| 🔴 PDP sem store context | ✅ Corrigido | Product PDP + Service PDP |
| 🟡 Reviews sem filtro store_id | ✅ Corrigido | products.ts + services.ts |

### ~~🔴 Bloqueios para Fase 3~~ ✅ Fase 3 Concluída

Nenhum bloqueio. Fase 3 executada com sucesso:
- `migrations/f18_01_create_store_product_kits.sql` — bridge com override_price, visibility_scope, marketplace_visible, RLS
- `migrations/f18_02_create_store_suppliers.sql` — bridge com visibility_scope, marketplace_visible, RLS
- `lib/resolve-marketplace-visibility.ts` — `filterMarketplaceVisibleKits`, `filterMarketplaceVisibleSuppliers`, `resolveKitsForStore`, `resolveSuppliersForStore`

---

## 9. Decisão Final

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ✅  GO — FUNDAÇÃO F1-F3 APROVADA                          ║
║                                                              ║
║   A arquitetura híbrida está corretamente implementada       ║
║   nos pontos críticos:                                       ║
║                                                              ║
║   • resolveProduct/resolveService com visibility_scope ✅    ║
║   • store_products/store_services bridge pattern ✅          ║
║   • Marketplace filtered (F2.5) + client audit (F2.6) ✅    ║
║   • RLS híbrida nullable para financeiro ✅                 ║
║   • Nenhum products.store_id ou services.store_id ativo ✅   ║
║   • Fase 4 completa: 5 colunas legacy DROPPED ✅             ║
║   • F4.4: Post-migration audit 65/65 checks aprovados ✅    ║
║   • F4.5: N+1 batch variant query otimizado ✅              ║
║   • Arquitetura documentada em MULTI_STORE_ARCHITECTURE.md  ║
║                                                              ║
║   2 GAPs encontrados e corrigidos:                         ║
║   🔴 PDP store context ✅                                   ║
║   🟡 Reviews store filter ✅                                 ║
║                                                              ║
║   Fase 3 concluída: store_product_kits + store_suppliers    ║
║   + resolver functions para kits e fornecedores.             ║
║                                                              ║
║   Fase 4 concluída: legacy store_id removido das 5 tabelas  ║
║   base. Arquitetura multi-store finalizada sem legado.       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```
