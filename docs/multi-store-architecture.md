# Arquitetura Multi Store — Baseline Oficial

> **Documento de baseline arquitetural.**  
> Fases 1 a 10.1 concluídas. Próximo bloco: Fase 11.

---

## 1. Arquitetura Final do Multi Store

### Princípios Fundamentais

1. **Override > Duplicação** — Produtos, variantes e serviços vivem UMA vez na tabela base.
   Cada loja pode sobrescrever campos específicos (preço, estoque, SKU) via tabelas de override.
   O COALESCE entre override e base é feito exclusivamente nos helpers `buildResolved*()`.

2. **Árvore de Resolução de Estoque** — 4 níveis com precedência:
   ```
   Variante + Loja → store_product_variants (override_stock_quantity)
   Variante       → product_variants (stock_quantity)
   Produto + Loja → store_products (override_stock_quantity)
   Produto        → products (stock_quantity)
   ```

3. **4 Branches nos RPCs** — Todo RPC de estoque implementa 4 branches:
   - Branch 1: variant_id + store_id → `store_product_variants`
   - Branch 2: variant_id only → `product_variants`
   - Branch 3: store_id only → `store_products`
   - Branch 4: neither → `products`

4. **`store_products`/`store_product_variants` = blueprint oficial** — Toda consulta de
   catálogo para uma loja específica DEVE usar `listStoreProducts()`/`listStoreProductVariants()`,
   que internamente faz `LEFT JOIN` com `.filter("store_id", "eq", storeId)` — o PostgREST
   coloca isso na cláusula ON, não WHERE, garantindo que produtos-base apareçam mesmo
   sem override.

5. **Autorização sempre server-side** — O cookie `active_store_id` é APENAS contexto de UI.
   A autorização real é feita por `auth.uid()` + `partner_users` + `store_members` + RLS policies.

6. **Permissões por loja** — `resolveEffectivePermissions()` é a ÚNICA fonte de verdade
   para permissões em uma store específica. OWNER bypass incorporado.

7. **Sem lógica duplicada** — Não existe resolução manual de estoque/preço em lugar nenhum.
   Sempre use os helpers compartilhados (lib/store-products.ts, lib/store-variants.ts).

8. **Índices corretos** — Todas as tabelas de override têm índices compostos
   `(store_id, product_id/variant_id)`.

---

## 2. Todas as Tabelas Envolvidas

### Tabelas Centrais

| Tabela | Função | Fase |
|--------|--------|------|
| `stores` | Lojas (filiais). Contém dados de contato, endereço, fiscais. | Foundation |
| `store_members` | Vincula `partner_users` a lojas específicas com role herdada. | Fase 4 |
| `store_products` | Override de preço/estoque/SKU/ativo por produto+loja. | Fase 5 |
| `store_services` | Override de preço/SKU/ativo por serviço+loja. | Fase 6 |
| `store_product_variants` | Override de estoque/reserva por variante+loja. | Fase 10.1 |

### Tabelas com `store_id` Adicionado

| Tabela | Escopo | Fase |
|--------|--------|------|
| `products` | store_id (para link direto, mas prefira `store_products`) | Foundation |
| `customers` | store_id | Foundation |
| `orders` | store_id | Foundation |
| `order_items` | store_id | Foundation |
| `stock_movements` | store_id | Fase 7 |
| `stock_movement_items` | store_product_id FK | Fase 7 |
| `appointments` | store_id | Fase 8 |
| `transactions` | store_id | Fase 9 |
| `transaction_items` | store_id | Fase 9 |
| `finance_accounts` | store_id | Fase 9 |
| `finance_invoices` | store_id | Fase 9 |
| `pre_sales` | store_id | Fase 10 |
| `sales` | store_id | Fase 10 |
| `sale_items` | store_id | Fase 10 |
| `cash_sessions` | store_id | Fase 10 |
| `cash_movements` | store_id | Fase 10 |
| `services` | store_id | Fase 6 |
| `payment_methods` | store_id | Foundation |

### Tabelas de Apoio (Permissões)

| Tabela | Função |
|--------|--------|
| `partners` | Empresa (dono). Relacionada a `stores` via `partner_id`. |
| `partner_users` | Usuários com acesso ao partner (role + permissions JSON). |
| `user_profiles` | Dados do usuário (nome, avatar). |

---

## 3. Relacionamentos

```
partners (1) ──────< (N) stores
partners (1) ──────< (N) partner_users
partners (1) ──────< (N) store_members
partners (1) ──────< (N) products
partners (1) ──────< (N) services

stores (1) ────────< (N) store_members
stores (1) ────────< (N) store_products
stores (1) ────────< (N) store_services
stores (1) ────────< (N) store_product_variants
stores (1) ────────< (N) [todas as tabelas com store_id]

products (1) ──────< (N) store_products
products (1) ──────< (N) product_variants
products (1) ──────< (N) [order_items, sale_items, etc.]

product_variants (1) ─< (N) store_product_variants

partner_users (1) ─< (N) store_members
  store_members.store_member_id = partner_users.id
```

---

## 4. Fluxo de Autorização

```
Usuário faz request
  ↓
getCurrentContext() (lib/auth/partner-context.ts)
  ├── Lê cookie: active_partner_id, active_store_id
  ├── Verifica auth.uid() via Supabase
  ├── Carrega partner_users para o partner ativo
  ├── Carrega store_members para store ativa (se houver)
  └── Retorna RequestContext { user, activePartner, allPartners }
       └── activePartner.activeStoreId = cookie store_id (APENAS contexto)

Para mutações/leituras:
  └── requirePermission(partnerId, resource, action)
       └── requirePartnerAccessWithPermission() (lib/auth/authorization.ts)
            └── Verifica partner_users.permissions JSON

Para permissões específicas de loja:
  └── checkPermission(partnerId, resource, action, storeId)
       └── resolveEffectivePermissions(partnerId, storeId) (lib/store-members.ts)
            ├── Busca store_members para (partner_user, store)
            ├── Se OWNER: retorna permissão máxima
            ├── Se member: retorna role + permissions do partner_user
            └── Se não encontrado: permissão negada

RLS no banco:
  └── user_has_store_access(store_id)
       ├── auth.uid() é OWNER do partner da store?
       ├── auth.uid() tem partner_user com acesso ao partner?
       └── auth.uid() tem store_member na store específica?
```

---

## 5. Fluxos de Resolução

### 5.1 Produtos

```
listStoreProducts(partnerId, storeId, options)
  ↓
1. Query base: products (LEFT JOIN store_products)
   .eq("partner_id", partnerId)
   .filter("store_products.store_id", "eq", storeId)  ← PostgREST coloca no ON
  ↓
2. Para cada produto:
   buildResolvedProduct(product, storeOverride)
     resolved_price        = COALESCE(sp.override_price, p.price)
     resolved_stock_qty    = COALESCE(sp.override_stock_quantity, p.stock_quantity)
     resolved_sku          = COALESCE(sp.override_sku, p.sku)
     store_is_active       = COALESCE(sp.is_active, p.is_active)
     has_store_override    = sp.id IS NOT NULL
  ↓
3. Se includeVariants: join store_product_variants via product_variants
```

### 5.2 Variantes

```
resolveVariant(variantId, storeId)
  ↓
1. Busca variant base: product_variants WHERE id = variantId
2. Busca store override: store_product_variants
   WHERE variant_id = variantId AND store_id = storeId
3. Se existe override:
   resolved_stock_quantity = COALESCE(spv.override_stock_quantity, pv.stock_quantity)
4. Se não existe override: usa pv.stock_quantity (backward compatibility)

listStoreProductVariants(productId, storeId)
  ↓
1. Busca todas as variantes base: product_variants WHERE product_id = productId
2. Para cada variante: LEFT JOIN store_product_variants
   .filter("spv.store_id", "eq", storeId)
3. Aplica buildResolvedVariant() em cada uma
```

### 5.3 Serviços

```
Mesmo padrão de store_products:
- store_services.override_price  → COALESCE(sp.override_price, s.price)
- store_services.override_sku    → COALESCE(sp.override_sku, s.sku)
- store_services.is_active       → controle de ativação por loja
```

### 5.4 Estoque

```
create_batch_stock_movement (RPC — 4 branches):

[Branch 1] variant_id + store_id:
  store_product_variants.override_stock_quantity ± qty
  (fallback: product_variants.stock_quantity se override IS NULL)

[Branch 2] variant_id only:
  product_variants.stock_quantity ± qty

[Branch 3] store_id only:
  store_products.override_stock_quantity ± qty
  (fallback: products.stock_quantity se override IS NULL)

[Branch 4] neither:
  products.stock_quantity ± qty

Trigger: sync_spv_stock_availability
  Mantém store_product_variants.stock_available =
    GREATEST(0, COALESCE(override_stock_quantity, 0) - stock_reserved)

Trigger: sync_sp_stock_availability (em store_products)
  Mantém store_products.stock_available =
    GREATEST(0, COALESCE(override_stock_quantity, 0) - stock_reserved)
```

### 5.5 Reservas

```
reserve_order_inventory (RPC — 4 branches):

[Branch 1] variant_id + store_id:
  store_product_variants.stock_reserved += qty
  Valida: effective_stock - reserved >= qty
  effective_stock = COALESCE(spv.override_stock_quantity, pv.stock_quantity)

[Branch 2] variant_id only:
  product_variants.stock_reserved += qty

[Branch 3] store_id only:
  store_products.stock_reserved += qty

[Branch 4] neither:
  products.stock_reserved += qty

release_order_inventory / finalize_order_inventory:
  Mesmo padrão de 4 branches, invertendo a operação.
```

### 5.6 Financeiro

```
Todas as transações financeiras (transactions, transaction_items,
finance_invoices) têm store_id.

- Criação de transaction: usa o store_id ativo do contexto
- Relatórios financeiros: filtram por store_id quando fornecido
- Contas a receber/pagar: store-aware via Fase 9
```

### 5.7 Agenda

```
appointments.store_id:
- Criação de agendamento: usa o store_id ativo
- Visualização: filtra por store_id
- RLS: user_has_store_access(appointments.store_id)
```

### 5.8 PDV (POS)

```
finalize_pos_sale (RPC — 4 branches de validação de estoque):

[Branch 1] variant_id + store_id (p_store_id IS NOT NULL):
  Valida: store_product_variants (effective_stock - reserved >= qty)
  Usa: spv.override_stock_quantity com fallback pv.stock_quantity

[Branch 2] variant_id only:
  Valida: product_variants.stock_available >= qty

[Branch 3] store_id only (p_store_id IS NOT NULL):
  Valida: store_products (override_stock - reserved >= qty)

[Branch 4] neither:
  Valida: products.stock_available >= qty

Calls create_batch_stock_movement com p_store_id para baixa efetiva.
Insere store_id em: sales, sale_items, transactions, cash_movements.
```

---

## 6. Helpers Considerados Source of Truth

| Helper | Arquivo | Função |
|--------|---------|--------|
| `resolveProduct()` | `lib/store-products.ts` | Resolve produto único com override |
| `listStoreProducts()` | `lib/store-products.ts` | Lista produtos com overrides por loja |
| `linkProductToStore()` | `lib/store-products.ts` | Cria vínculo produto+loja |
| `updateStoreProductOverride()` | `lib/store-products.ts` | Atualiza override |
| `resolveVariant()` | `lib/store-variants.ts` | Resolve variante única com override |
| `listStoreProductVariants()` | `lib/store-variants.ts` | Lista variantes com overrides por loja |
| `resolveEffectivePermissions()` | `lib/store-members.ts` | Permissões efetivas por store |
| `userHasStoreAccess()` | `lib/store-members.ts` | Verifica acesso a store |
| `checkStorePermission()` | `lib/store-members.ts` | Verifica permissão específica |
| `checkPermission()` | `lib/permissions/access.ts` | Permissão c/ suporte a storeId |
| `requirePermission()` | `lib/permissions/access.ts` | Requer permissão (lança erro) |
| `reserveOrderInventory()` | `lib/stock/reservations.ts` | Reserva estoque store-aware |
| `releaseOrderInventory()` | `lib/stock/reservations.ts` | Libera reserva store-aware |
| `finalizeOrderInventory()` | `lib/stock/reservations.ts` | Finaliza estoque store-aware |
| `getStoreProductStock()` | `lib/stock/reservations.ts` | Consulta estoque (product+store) |
| `getCurrentContext()` | `lib/auth/partner-context.ts` | Contexto server-side (partner+store) |
| `setActiveStore()` | `lib/auth/partner-context.ts` | Cookie server-side store ativa |

> **Regra:** NUNCA resolva preço/estoque manualmente com queries diretas.
> Sempre passe pelos helpers acima.

---

## 7. RPCs Considerados Source of Truth

| RPC | Arquivo (migration) | Função |
|-----|---------------------|--------|
| `create_batch_stock_movement` | `f101_update_rpcs_*.sql` | Movimento de estoque (4 branches) |
| `reserve_order_inventory` | `f101_update_rpcs_*.sql` | Reserva de estoque (4 branches) |
| `release_order_inventory` | `f101_update_rpcs_*.sql` | Libera reserva (4 branches) |
| `finalize_order_inventory` | `f101_update_rpcs_*.sql` | Finaliza + baixa (4 branches) |
| `finalize_pos_sale` | `20260716_fix_store_aware_rpcs.sql` | Finaliza venda PDV (4 branches + fee/interest) |
| `get_store_product_stock` | `f101_update_rpcs_*.sql` | Consulta estoque com suporte a variant_id |
| `handle_order_payment_stock` | `f101_update_rpcs_*.sql` | Trigger: baixa automática ao pagar pedido |
| `sync_spv_stock_availability` | `f101_create_store_product_variants.sql` | Trigger: mantém stock_available em spv |
| `user_has_store_access` | `f4_update_user_has_store_access.sql` | Função RLS centralizada |
| `transfer_store_stock` | `f7_store_aware_stock.sql` | Transferência entre lojas |

> **Regra:** NUNCA muta `products.stock_quantity`, `product_variants.stock_quantity`,
> `store_products.override_stock_quantity` ou `store_product_variants.override_stock_quantity`
> diretamente. Sempre passe pelos RPCs acima.

---

## 8. Fluxo Completo: Troca de Loja Ativa → Persistência

```
Cliente seleciona loja no StoreSwitcher (UI)
  │
  ▼
useStore().selectStore(storeId)  [lib/store-context.tsx]
  ├── Atualiza estado React: selectedStore = store
  ├── localStorage: "selectedStoreId" = storeId
  ├── Chama server action: setActiveStoreAction(storeId)
  │     └── app/actions/erp/stores.ts: setActiveStoreAction(storeId)
  │          ├── Lê cookie via partner-context: "active_store_id"
  │          ├── Se storeId é válida para o partner: setCookie("active_store_id", storeId, 7d)
  │          └── Se storeId não é válida: lança erro (nunca confia no client)
  │
  ▼
Próximo request server-side:
  └── getCurrentContext() (lib/auth/partner-context.ts)
       ├── Lê cookie "active_store_id"
       ├── activePartner.activeStoreId = cookie value
       └── Disponível em: Server Actions, API Routes, RSC

    Uso no banco:
    └── Server Action passa activeStoreId como filtro:
         listStoreProducts(partnerId, activeStoreId)
         supabase.from("orders").eq("store_id", activeStoreId)
         RPCs com p_store_id := activeStoreId
```

---

## 9. Lista de Migrations (Fases 1–10.1)

### Foundation

| Migration | Descrição |
|-----------|-----------|
| `01_create_stores_table.sql` | Cria tabela `stores` base |
| `02_add_store_id_to_tables.sql` | Adiciona `store_id` em products, customers, orders |
| `03_create_initial_store_for_partners.sql` | Trigger auto-cria store para novos partners |

### Fase 1 — Store Expansion

| Migration | Descrição |
|-----------|-----------|
| `f1_migrate_partner_data_to_stores.sql` | Migra dados de partner para "Loja Principal" |
| `f1_fix_stores_rls.sql` | Corrige RLS em stores para team members |
| `f1_expand_stores.sql` | Expande stores com colunas operacionais/marketplace |

### Fase 3 — RLS e Permissões

| Migration | Descrição |
|-----------|-----------|
| `f3_user_has_store_access.sql` | Cria `user_has_store_access()` |
| `f3_rls_store_aware.sql` | Atualiza RLS policies com store-awareness |
| `f3_rollback.sql` | Rollback Fase 3 |

### Fase 4 — Store Members

| Migration | Descrição |
|-----------|-----------|
| `f4_create_store_members.sql` | Cria `store_members` + RLS |
| `f4_migrate_partner_users_to_store_members.sql` | Migra partner_users existentes |
| `f4_update_user_has_store_access.sql` | Atualiza função para incluir store_members |
| `f4_rollback.sql` | Rollback Fase 4 |

### Fase 5 — Store Products

| Migration | Descrição |
|-----------|-----------|
| `f5_create_store_products.sql` | Cria `store_products` + trigger + RLS |
| `f5_rollback.sql` | Rollback Fase 5 |

### Fase 6 — Store Services

| Migration | Descrição |
|-----------|-----------|
| `f6_create_store_services.sql` | Cria `store_services` + RLS |
| `f6_rollback.sql` | Rollback Fase 6 |

### Fase 7 — Store-Aware Stock

| Migration | Descrição |
|-----------|-----------|
| `f7_store_aware_stock.sql` | Store_product_id em stock_movement_items + RPCs |
| `f7_rollback.sql` | Rollback Fase 7 |

### Fase 8 — Agenda

| Migration | Descrição |
|-----------|-----------|
| `f8_add_store_id_to_appointments.sql` | Adiciona store_id em appointments |
| `f8_rollback.sql` | Rollback Fase 8 |

### Fase 9 — Financeiro

| Migration | Descrição |
|-----------|-----------|
| `f9_add_store_id_to_financial_tables.sql` | Adiciona store_id em tabelas financeiras |
| `f9_rollback.sql` | Rollback Fase 9 |

### Fase 10 — PDV/Caixa

| Migration | Descrição |
|-----------|-----------|
| `f10_add_store_id_to_pos_tables.sql` | Adiciona store_id em POS + RPC finalize_pos_sale |
| `f10_rollback.sql` | Rollback Fase 10 |

### Fase 10.1 — Variantes Store-Aware

| Migration | Descrição |
|-----------|-----------|
| `f101_create_store_product_variants.sql` | Cria `store_product_variants` + trigger + RLS |
| `f101_update_rpcs_store_product_variants.sql` | Atualiza RPCs para 4 branches com variant_id |
| `f101_rollback.sql` | Rollback Fase 10.1 |

### Fixes Pós-Fase

| Migration | Descrição |
|-----------|-----------|
| `20260716_fix_store_aware_rpcs.sql` | Corrige `finalize_pos_sale` (regressão) + Branch 1/3 fallback |

### Outras Migrations Relacionadas

| Migration | Descrição |
|-----------|-----------|
| `210_add_fiscal_fields_to_stores.sql` | Campos fiscais em stores |
| `060_multi_item_stock_movements.sql` | Suporte multi-item em stock_movements |

---

## 10. Fluxos que Continuam Globais (por Decisão Arquitetural)

| Fluxo | Motivo |
|-------|--------|
| **Assinaturas recorrentes** (recurring_subscriptions) | Subscriptions são por partner, não por store. O estoque verificado é o global. |
| **Marketplace / Vitrine** | Venda online não tem store_id — o estoque considerado é o agregado do partner. |
| **Importação XML/NFe** | Documento fiscal é por CNPJ do partner, não por filial. |
| **Relatórios gerais / Dashboard** | Dashboard mostra visão do partner. Filtro por loja é opcional e pode ser adicionado depois. |
| **Configurações do sistema** (settings) | Configurações de plano, integrações, etc. são por partner. |
| **Produtividade / Metas** | Metas são por partner ou por usuário, não por loja. |
| **Catálogo de cupons/promoções** | Promoções podem ser globais ou por loja (a definir). |
| **Entregas / logística** | Delivery é por pedido, que já tem store_id. Rota de entrega pode cruzar lojas. |
| **Audit logs** | Logs são por partner — store_id é metadata opcional. |

---

## 11. Pendências Conhecidas para Fases Futuras

### Fase 11 — Override de Preço em Variantes
- `store_product_variants` não tem `override_price_adjustment` nem `override_sku`
- Atualmente o preço da variante é global (product_variants.price_adjustment)
- **Estimativa:** adicionar colunas + resolver em `resolveVariant()`

### Fase 12 — Marketplace Store-Aware
- Vitrine online não filtra por loja
- `decrement_stock_atomic` não é store-aware (usado no checkout do marketplace)
- **Risco:** venda online pode consumir estoque da loja errada

### Fase 13 — Dashboard por Loja
- Dashboard atual é global por partner
- Adicionar seletor de loja no dashboard
- Queries de estoque baixo atualmente lêem `products.stock_quantity`

### Fase 14 — Assinaturas Store-Aware
- Subscriptions não têm store_id
- Ao criar pedido recorrente, verificar estoque por loja (se subscription tiver store)
- `checkStockAvailability()` em `recurring-execution.service.ts` precisa ser atualizado

### Dívida Técnica
- `store-queries.ts` — `fetchStoreProducts` foi migrado para `store_products` mas não é usado por ninguém (pode ser removido)
- `dashboard.ts` — Queries de estoque baixo lêem `products.stock_quantity` diretamente (aceitável por ser read-only)
- `decrement_stock` (RPC legacy em `037_add_decrement_stock_rpc.sql`) — não usado, pode ser deprecado
- `create_manual_stock_movement` (RPC em `052_add_reason_to_stock_movements.sql`) — não é store-aware, usado apenas em fluxo legado de ajuste manual

---

## 12. Checklist Final

### Estabilidade da Arquitetura ✅

| Item | Status |
|------|--------|
| Override fields semânticos (COALESCE nos helpers) | ✅ |
| 4 branches em todos os RPCs de estoque | ✅ |
| RLS store-aware em todas as tabelas com store_id | ✅ |
| Store_members com resolução de permissões | ✅ |
| Helpers Source of Truth identificados e centralizados | ✅ |
| RPCs Source of Truth identificados e centralizados | ✅ |
| Árvore de estoque clara e documentada | ✅ |
| Rollbacks implementados para todas as fases | ✅ |
| Typecheck: 0 erros | ✅ |
| Auditoria completa realizada e inconscistências corrigidas | ✅ |

### Pontos de Atenção ⚠️

| Ponto | Risco | Mitigação |
|-------|-------|-----------|
| Migrações 20260xxx sobrescreveram RPCs store-aware | Regressão | `20260716_fix_store_aware_rpcs.sql` corrigiu; próximas migrações DEVEM tratar com `DROP ... IF EXISTS` antes de recriar |
| `create_batch_stock_movement` Branch 1/3 usava 0 como fallback | Data corruption se override NULL | ✅ Corrigido |
| Dashboard lê `products.stock_quantity` | Alerta de estoque baixo pode ser impreciso | Aceitável (read-only). Melhorar na Fase 13 |
| `checkStockAvailability` em subscriptions lê estoque global | Pode aprovar pedido sem estoque real por loja | Aceitável (subscriptions não têm store_id). Melhorar na Fase 14 |

### Riscos Futuros 🔴

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Nova migration que recria `finalize_pos_sale` sem store-awareness | Média | Alto | Adicionar code review check: "define finalize_pos_sale → verificar p_store_id" |
| Marketplace checkout sem store-awareness consumir estoque errado | Baixa | Alto | Fase 12: tornar `decrement_stock_atomic` store-aware |
| Trigger `handle_order_payment_stock` ser sobrescrito sem variant_id | Média | Alto | Adicionar verificação em code review |
| Esquecer de passar `store_id` em novo RPC/helper | Média | Médio | Guia de estilo: "todo RPC de estoque deve ter 4 branches" |
| Usar `products.stock_quantity` em nova funcionalidade | Alta | Médio | Documentação e code review |

### Oportunidades de Simplificação 🟢

| Oportunidade | Benefício | Esforço |
|--------------|-----------|---------|
| Unificar `buildResolvedProduct`/`buildResolvedVariant` em uma única função genérica `buildResolved<T>` | Reduz duplicação | Baixo |
| Criar trigger único de sync de stock_available que cobre store_products e store_product_variants | Manutenibilidade | Baixo |
| Remover `store-queries.ts` (dead code) | Cleanup | Mínimo |
| Consolidar `create_batch_stock_movement` e `create_manual_stock_movement` | Reduz superfície de ataque | Médio |
| Adicionar `store_id` em subscriptions (Fase 14) | Permite estoque por loja em recorrentes | Alto |
| Extrair constantes de branches para enum ou tipo compartilhado | Type safety | Baixo |

---

> **Documento gerado em:** 16/07/2026  
> **Próxima fase:** Fase 11 — Override de Preço em Variantes  
> **Status:** ✅ Fases 1–10.1 concluídas e auditadas. Baseline oficial.
