# Revisão Arquitetural Definitiva — Modelo Híbrido Multi-Store

## 1. Modelo Conceitual: Franquia Híbrida

```
TIERS DE DADO:

GLOBAL ────→ master data do partner, compartilhado entre todas as lojas
                Ex: customers, financial categories base, fornecedores globais

HYBRID ────→ cadastro global com override por loja (herança + override)
                Ex: products, services, payment methods, contas financeiras
                ├── BASE: entidade global (store_id NULL ou sem store_id)
                └── OVERRIDE: bridge table com campos opcionais de customização
                    (store_products, store_services, store_suppliers, ...)

STORE ─────→ dado operacional pertence a uma única loja
                Ex: orders, stock_movements, appointments, deliveries, returns

USER ──────→ escopo do usuário individual
                Ex: profiles, addresses

SYSTEM ────→ infraestrutura da plataforma
                Ex: audit_logs, 2FA, admin, marketplace system data
```

### Princípios do Modelo

1. **Herança, não duplicação**: cadastro global é criado uma vez; loja só persiste o que é diferente (override)
2. **Bridge tables com campos opcionais**: `store_<entidade>` contém apenas os campos que podem ser override
3. **store_id direto = STORE**: se uma entidade TEM store_id obrigatório, ela é operacional
4. **store_id NULL = GLOBAL/HYBRID**: se store_id é opcional, registros sem store_id são globais
5. **Remover store_id de entidades GLOBAIS**: cliente não deve ter store_id
6. **Remover store_id de entidades HYBRID com bridge**: products não precisa de store_id se store_products existe

---

## 2. Matriz Definitiva

### USER (escopo do usuário)

| Tabela | store_id | partner_id | Status |
|---|---|---|---|
| `profiles` | ❌ | ❌ | ✅ Ok |
| `user_profiles` | ❌ | ❌ | ✅ Ok |
| `user_addresses` | ❌ | ❌ | ✅ Ok |
| `addresses` | ❌ | ❌ | ✅ Ok |
| `user_2fa_*` | ❌ | ❌ | ✅ Ok |

### SYSTEM (infraestrutura)

| Tabela | store_id | partner_id | Status |
|---|---|---|---|
| `plans` | ❌ | ❌ | ✅ Ok |
| `subscriptions` | ❌ | ✅ partner_id | ✅ GLOBAL partner |
| `billing_*` | ❌ | ✅ partner_id | ✅ GLOBAL partner |
| `usage_counters` | ❌ | ❌ (partner_id PK) | ✅ GLOBAL partner |
| `audit_logs` | ❌ | ✅ partner_id | ✅ SYSTEM |
| `admin_*` | ❌ | ❌ | ✅ SYSTEM |
| `notification_*` | ❌ | ❌ (user-level) | ✅ SYSTEM |
| `marketplace_*system*` | ❌ | ❌ | ✅ SYSTEM |
| `unidades_medida` | ❌ | ❌ | ✅ SYSTEM |

### GLOBAL (master data do partner)

| Tabela | store_id | partner_id | Ação |
|---|---|---|---|
| `partners` | ❌ | id (raiz) | ✅ Ok |
| `partner_users` | ❌ | ✅ | ✅ Ok |
| `partner_invitations` | ❌ | ✅ | ✅ Ok |
| **`customers`** | ❌ **(remover)** | ✅ | 🔧 **Migration: dropar store_id** |
| `product_categories` | ❌ | ✅ | ✅ GLOBAL |
| `brands` | ❌ | ✅ | ✅ GLOBAL |
| `product_fiscal_profiles` | ❌ | ✅ | ✅ GLOBAL (dados tributários) |
| `product_logistics` | ❌ | ✅ | ✅ GLOBAL |
| `suppliers` | ❌ **(remover store_id)** | ✅ | 🔧 **Migration + bridge** |
| **`reviews`** | ✅ store_id (manter) | ✅ | 🔧 **STORE (reputação por loja, marketplace usa store_id)** |
| `campaigns` | ❌ | ✅ | ✅ GLOBAL (escopo de loja via promotion_stores) |
| `marketplace_partner_categories` | ❌ | ❌ | ✅ SYSTEM |

### HYBRID (global + override)

| Tabela Base | Bridge / Override | store_id na base | Ação |
|---|---|---|---|
| **`products`** | `store_products` | ❌ **(remover)** | 🔧 **Migration: dropar store_id, manter só bridge** |
| **`services`** | `store_services` | ❌ **(remover)** | 🔧 **Migration: dropar store_id, manter só bridge** |
| **`product_variants`** | `store_product_variants` | ❌ | ✅ Ok |
| `payment_methods` | store_id nullable | ✅ nullable | ✅ Ok (já híbrido) |
| **`product_kits`** | ❌ (sem bridge) | ❌ **(remover)** | 🔧 **Criar store_kits + dropar store_id** |
| **`financial_categories`** | ❌ (criar) | ❌ | 🔧 **Adicionar suporte híbrido** |
| **`finance_accounts`** | ❌ (criar) | ❌ | 🔧 **Adicionar suporte híbrido** |
| **`transaction_contacts`** | ❌ (criar) | ❌ | 🔧 **Adicionar suporte híbrido** |
| **`suppliers`** | `store_suppliers` (criar) | ❌ **(remover)** | 🔧 **Criar bridge + dropar store_id** |
| `promotions` | `promotion_stores` | ❌ | ✅ Ok |
| `coupons` | `coupon_stores` | ❌ | ✅ Ok |
| `recurring_plans` (planos do parceiro) | ❌ | ❌ | ✅ GLOBAL (plano do parceiro, assinaturas do cliente são STORE) |
| `storage_locations` | ❌ | ❌ | 🔧 **Adicionar store_id (STORE)** |
| `service_categories` | ❌ | ✅ partner_id | ✅ GLOBAL |

### STORE (operacional)

| Tabela | store_id | Status |
|---|---|---|
| `stores` | id | ✅ Ok |
| `store_members` | ✅ | ✅ Ok |
| `orders` | ✅ | ✅ Ok |
| `order_items` | indireto | ✅ Ok |
| `cart_items` | ✅ | ✅ Ok |
| `pre_sales` | ✅ | ✅ Ok |
| `sales` | ✅ | ✅ Ok |
| `sale_items` | ✅ | ✅ Ok |
| `cash_sessions` | ✅ | ✅ Ok |
| `cash_movements` | ✅ | ✅ Ok |
| `stock_movements` | ✅ | ✅ Ok |
| `stock_movement_items` | indireto | ✅ Ok |
| `appointments` | ✅ | ✅ Ok |
| `appointment_items` | indireto | ✅ Ok |
| `service_orders` | ✅ | ✅ Ok |
| `service_order_*` (sub) | indireto | ✅ Ok |
| `quotes` | ✅ | ✅ Ok |
| `quote_items` | ✅ | ✅ Ok |
| `accounts_payable` | ✅ | ✅ Ok |
| `accounts_receivable` | ✅ | ✅ Ok |
| `transactions` | ✅ | ✅ Ok |
| `transactions_history` | ✅ partner_id | ✅ Ok (herda contexto) |
| `recurring_transactions` | ✅ | ✅ Ok |
| `partner_whatsapp_connections` | ✅ | ✅ Ok |
| `whatsapp_messages` | ✅ | ✅ Ok |
| `delivery_settings` | ✅ | ✅ Ok |
| **`deliveries`** | **❌** | 🔧 **Adicionar store_id** |
| **`delivery_orders`** | **❌** | 🔧 **Adicionar store_id** |
| **`delivery_fee_rules`** | **❌** | 🔧 **Adicionar store_id** |
| **`return_requests`** | **❌** | 🔧 **Adicionar store_id** |
| **`return_items`** | **❌** | 🔧 **Adicionar store_id** |
| **`return_refunds`** | **❌** | 🔧 **Adicionar store_id** |
| **`store_credits`** | **❌** | 🔧 **Adicionar store_id** |
| **`employee_commissions`** | **❌** | 🔧 **Adicionar store_id** |
| **`sales_goals`** | **❌** | 🔧 **Adicionar store_id** |
| **`sales_goal_progress`** | **❌** | 🔧 **Adicionar store_id** |
| **`recurring_subscriptions`** | **❌** | 🔧 **Adicionar store_id** |
| **`recurring_subscription_items`** | **❌** | 🔧 **Adicionar store_id** |
| **`recurring_executions`** | **❌** | 🔧 **Adicionar store_id** |
| **`subscription_item_credits`** | **❌** | 🔧 **Adicionar store_id** |
| **`storage_locations`** | **❌** | 🔧 **Adicionar store_id** |
| **`erp_imports`** | **❌** | 🔧 **Adicionar store_id** |
| **`xml_imports`** | **❌** | 🔧 **Adicionar store_id** |
| **`reports`** | **❌** | 🔧 **Adicionar store_id** |

---

## 3. Análise por Domínio

### 3.1 Produtos e Serviços

**Modelo definitivo**: HYBRID puro via bridge, sem store_id na base.

```
products (GLOBAL)          store_products (bridge)
┌──────────────────┐       ┌─────────────────────────────┐
│ id               │──1:N──│ product_id                  │
│ partner_id       │       │ store_id                    │
│ name, price, sku │       │ override_price              │ ← NULL = herda
│ stock_quantity   │       │ override_stock_quantity     │ ← NULL = herda
│ is_active        │       │ override_sku                │ ← NULL = herda
│ ...              │       │ is_active                   │ ← NULL = herda products.is_active
└──────────────────┘       │ visibility_scope            │ ← 'all' | 'selected' | 'exclusive'
                           │ marketplace_visible         │ ← override visibilidade no marketplace
                           │ created_at                  │
                           │ UNIQUE(product_id, store_id)│
                           └─────────────────────────────┘
```

**Regras de visibilidade**:
- `visibility_scope = 'all'` (default): produto visível em todas as lojas do partner
- `visibility_scope = 'selected'`: produto visível apenas nas lojas com store_products explícito
- `visibility_scope = 'exclusive'`: produto criado para uma loja específica (exclusivo)

**Resolução em runtime** (pseudo-código):
```
function resolveProductForStore(productId, storeId):
  base = products.findById(productId)
  override = store_products.findByProductAndStore(productId, storeId)
  
  return {
    ...base,
    price: override?.override_price ?? base.price,
    stock: override?.override_stock_quantity ?? base.stock_quantity,
    sku: override?.override_sku ?? base.sku,
    is_active: override?.is_active ?? base.is_active,
    marketplace_visible: override?.marketplace_visible ?? true
  }
```

**Por que remover store_id de products?**
- store_id em products foi um artifact transitório (migration 02)
- Com store_products, o store_id direto na base é redundante
- Produto global (store_id=NULL) vs produto de loja (store_id=UUID) cria duas categorias desnecessárias
- A bridge já resolve o vínculo produto-loja

**Mesmo modelo para services + store_services** ✅

### 3.2 Clientes

**Modelo definitivo**: GLOBAL puro.

```
customers (GLOBAL)
┌──────────────────┐
│ id               │
│ partner_id       │ ← único vínculo
│ name, email, phone │
│ ...              │
│ ❌ store_id      │ ← remover
└──────────────────┘
```

**Justificativa**:
- Cliente é do partner, não da loja
- Todas as lojas compartilham a mesma base de clientes
- Histórico de compras do cliente é cross-store
- Fidelidade/relacionamento é com a marca, não com a filial

**Mudanças necessárias**:
1. `ALTER TABLE customers DROP COLUMN store_id`
2. Atualizar RLS: remover `store_id IS NULL OR user_has_store_access(store_id)`, manter apenas partner_id check
3. Remover código que filtra customers por store_id

### 3.3 Fornecedores

**Modelo definitivo**: HYBRID via bridge.

```
suppliers (GLOBAL)         store_suppliers (bridge)
┌──────────────────┐       ┌─────────────────────────┐
│ id               │──1:N──│ supplier_id             │
│ partner_id       │       │ store_id                │
│ name, email, cnpj│       │ is_active               │
│ ...              │       │ UNIQUE(supplier_id,     │
│ ❌ store_id      │       │         store_id)       │
└──────────────────┘       └─────────────────────────┘
```

**Regras**:
- Sem registro em `store_suppliers` → fornecedor global (visível em todas as lojas)
- Com registro → fornecedor visível na loja específica
- `store_suppliers.is_active = false` → ocultar fornecedor global de uma loja específica
- Fornecedor exclusivo de uma loja → criado como global, vinculado via store_suppliers apenas para aquela loja

### 3.4 Cadastros Financeiros

**Modelo definitivo**: HYBRID (store_id nullable, sem bridge).

```
finance_accounts          financial_categories      transaction_contacts
┌──────────────────┐     ┌──────────────────┐      ┌──────────────────┐
│ id               │     │ id               │      │ id               │
│ partner_id       │     │ partner_id       │      │ partner_id       │
│ name, type       │     │ name, type       │      │ name, phone      │
│ balance          │     │ parent_id        │      │ contact_type     │
│ ✅ store_id NULL │     │ ✅ store_id NULL │      │ ✅ store_id NULL │
│   = global       │     │   = global       │      │   = global       │
└──────────────────┘     └──────────────────┘      └──────────────────┘
```

**Por que nullable store_id e não bridge?**
- Essas entidades são cadastros simples (nome, tipo)
- Não têm campos de override (não há "override_name")
- O único comportamento híbrido é: "essa conta é global" vs "essa conta é só dessa loja"
- store_id nullable é suficiente e mais simples que bridge table

**Regras**:
- `store_id = NULL` → cadastro global (visível em todas as lojas)
- `store_id = UUID` → cadastro exclusivo da loja
- RLS: `store_id IS NULL OR user_has_store_access(store_id)`

### 3.5 Assinaturas

**Separação definitiva**:

```
┌─────────────────────────────────────────────────────────┐
│ DUDIT SUBSCRIPTION (GLOBAL partner)                     │
│ ─────────────────────────────────────────────────────── │
│ plans (preços/planos da plataforma)                     │
│ subscriptions (assinatura do partner)                   │
│ billing_*, usage_counters                              │
│ store_id: ❌                                            │
│ partner_id: ✅ (em subscriptions)                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ RECORRÊNCIA DO PARTNER (STORE-aware)                    │
│ ─────────────────────────────────────────────────────── │
│ recurring_plans → plano de assinatura criado pelo       │
│                   partner (ex: "clube de assinatura")   │
│                   store_id: ❌ (GLOBAL, plano é do      │
│                   partner, não da loja)                 │
│                                                        │
│ recurring_subscriptions → assinatura do cliente         │
│                   store_id: ✅ (pertence a uma loja)    │
│                                                        │
│ recurring_executions → execução da assinatura           │
│                   store_id: ✅ (pertence a uma loja)    │
└─────────────────────────────────────────────────────────┘
```

**Decisão**: `recurring_plans` fica GLOBAL (partner-level, o plano é da marca), assim como `subscription_item_credits` e o ledger. Mas `recurring_subscriptions` e `recurring_executions` são STORE-aware. Como `recurring_plans` não tem store_id, as assinaturas (que têm store_id) referenciam planos globais.

### 3.6 Promoções/Cupons/Campanhas

**Modelo definitivo**: Mantém o híbrido atual, que já está correto.

```
campaigns (GLOBAL)
┌──────────────┐
│ partner_id   │
│ name, dates  │
│ is_active    │
└──────┬───────┘
       │ 1:N
┌──────▼──────────┐     ┌─────────────────────────┐
│ promotions       │────│ promotion_stores        │
│ (GLOBAL)         │     │ promotion_id, store_id  │
│ discount, type   │     └─────────────────────────┘
│ campaign_id      │
└──────────────────┘

coupons (GLOBAL)
┌──────────────┐     ┌─────────────────────────┐
│ code, value  │────│ coupon_stores            │
│ partner_id   │     │ coupon_id, store_id      │
└──────────────┘     └─────────────────────────┘
```

✅ Já implementado corretamente nas Fases 1-15.

### 3.7 Marketplace

**Modelo atual suporta**:

| Requisito | Suporte | Como |
|---|---|---|
| Catálogo herdado | ✅ | Produtos globais visíveis em todas as lojas |
| Produtos exclusivos por loja | ✅ | store_products com scope = 'exclusive' |
| Ranking independente por loja | ✅ | reviews têm store_id |
| Estoque independente | ✅ | store_products.override_stock_quantity |
| Preço independente | ✅ | store_products.override_price |
| Disponibilidade independente | ✅ | store_products.is_active |
| Visibilidade marketplace | ✅ | store_products.marketplace_visible |

**Ajuste necessário**: Adicionar `marketplace_visible` em `store_products` e `store_services` para controle independente de visibilidade no marketplace por loja.

---

## 4. O que já está Correto nas 15 Fases

| Fase | O quê | Status |
|---|---|---|
| F1 | stores table + colunas expandidas | ✅ |
| F2 | store_id em tabelas principais (products, customers, orders, etc.) | ✅ Transição |
| F3 | `user_has_store_access()` + RLS store-aware em SELECT | ✅ |
| F4 | store_members + update user_has_store_access | ✅ |
| F5 | store_products bridge | ✅ (ajustar) |
| F6 | store_services bridge | ✅ (ajustar) |
| F7 | Store-aware stock | ✅ |
| F8 | store_id em appointments | ✅ |
| F9 | store_id em financeiro (transactions, AP/AR, quotes) | ✅ |
| F10 | store_id em PDV (pre_sales, sales, cash) | ✅ |
| F11 | Hotfix RLS stores recursion | ✅ |
| F12 | store_id em WhatsApp | ✅ |
| F13 | promotion_stores + coupon_stores | ✅ |
| F14 | store_id em service_orders | ✅ |
| F15 | store_id ativado em payment_methods | ✅ |

---

## 5. O que Precisa Corrigir

### 5.1 Migrations Necessárias

#### Grupo A — Limpeza de store_id em GLOBALS/HYBRIDS (seguro, sem dados novos)

| # | Migration | Risco |
|---|---|---|
| A1 | `ALTER TABLE customers DROP COLUMN store_id` | Baixo (store_id nullable, dados NULL) |
| A2 | `ALTER TABLE products DROP COLUMN store_id` + backfill store_products | Médio (produtos com store_id precisam de store_products) |
| A3 | `ALTER TABLE services DROP COLUMN store_id` + backfill store_services | Médio |
| A4 | `ALTER TABLE product_kits DROP COLUMN store_id` + criar `store_kits` | Médio |
| A5 | `ALTER TABLE suppliers DROP COLUMN store_id` + criar `store_suppliers` + backfill | Médio |

#### Grupo B — Criar suporte HYBRID para cadastros financeiros

| # | Migration | Risco |
|---|---|---|
| B1 | `ALTER TABLE financial_categories ADD COLUMN store_id UUID REFERENCES stores` | Baixo |
| B2 | `ALTER TABLE finance_accounts ADD COLUMN store_id UUID REFERENCES stores` | Baixo |
| B3 | `ALTER TABLE transaction_contacts ADD COLUMN store_id UUID REFERENCES stores` | Baixo |
| B4 | Atualizar RLS destas tabelas (padrão: `store_id IS NULL OR user_has_store_access(store_id)`) | Baixo |

#### Grupo C — Adicionar store_id em STOREs órfãs

| # | Migration | Risco |
|---|---|---|
| C1 | `ALTER TABLE deliveries ADD COLUMN store_id` + RLS | Alto (dados existentes sem store_id) |
| C2 | `ALTER TABLE delivery_orders ADD COLUMN store_id` (indireto) | Alto |
| C3 | `ALTER TABLE delivery_fee_rules ADD COLUMN store_id` | Alto |
| C4 | `ALTER TABLE return_requests ADD COLUMN store_id` + RLS | Alto |
| C5 | `ALTER TABLE return_items, return_refunds, return_evidence, etc.` (indireto) | Alto |
| C6 | `ALTER TABLE store_credits ADD COLUMN store_id` + RLS | Alto |
| C7 | `ALTER TABLE employee_commissions ADD COLUMN store_id` + RLS | Alto |
| C8 | `ALTER TABLE sales_goals ADD COLUMN store_id` + RLS | Alto |
| C9 | `ALTER TABLE sales_goal_progress ADD COLUMN store_id` | Alto |
| C10 | `ALTER TABLE recurring_subscriptions ADD COLUMN store_id` + RLS | Alto |
| C11 | `ALTER TABLE recurring_subscription_items ADD COLUMN store_id` | Alto |
| C12 | `ALTER TABLE recurring_executions ADD COLUMN store_id` + RLS | Alto |
| C13 | `ALTER TABLE subscription_item_credits ADD COLUMN store_id` | Alto |

#### Grupo D — Melhorias na bridge

| # | Migration | Risco |
|---|---|---|
| D1 | `ALTER TABLE store_products ADD COLUMN visibility_scope TEXT` ('all'/'selected'/'exclusive') | Baixo |
| D2 | `ALTER TABLE store_products ADD COLUMN marketplace_visible BOOLEAN` | Baixo |
| D3 | `ALTER TABLE store_services ADD COLUMN visibility_scope TEXT` | Baixo |
| D4 | `ALTER TABLE store_services ADD COLUMN marketplace_visible BOOLEAN` | Baixo |

### 5.2 Gaps Críticos vs. Nice-to-Have

#### 🔴 Críticos (store_id ausente em operacionais)

```
1. deliveries + delivery_orders + delivery_fee_rules
2. return_requests + return_items + return_refunds + store_credits
3. employee_commissions
4. sales_goals + sales_goal_progress
5. recurring_subscriptions + recurring_executions
```

**Impacto**: Sem store_id nestas tabelas, o multi-store não funciona para estes módulos. Um usuário com acesso a múltiplas lojas vê dados de todas as lojas misturados.

#### 🟡 Médios (classificação incorreta)

```
6. customers → remover store_id
7. suppliers → criar store_suppliers bridge, remover store_id
8. products → remover store_id, manter só store_products
9. services → remover store_id, manter só store_services
```

**Impacto**: Funciona hoje, mas o modelo fica inconsistente. Produto com store_id direto + store_products cria duas formas de vincular produto a loja.

#### 🔵 Baixos (HYBRID faltante)

```
10. financial_categories → adicionar store_id nullable
11. finance_accounts → adicionar store_id nullable
12. transaction_contacts → adicionar store_id nullable
```

**Impacto**: Categorias e contas financeiras são hoje GLOBAL (partner-scoped). Funciona para single-store. Para multi-store, falta a capacidade de criar contas específicas por filial.

---

## 6. Matriz Completa (167 tabelas)

```
LEGENDA:
✅ = já implementado corretamente
🔧 = precisa migration
🤔 = requer decisão adicional
```

### USER (5)

| Tabela | Classe | store_id | Ação |
|---|---|---|---|
| profiles | USER | ❌ | ✅ |
| user_profiles | USER | ❌ | ✅ |
| user_addresses | USER | ❌ | ✅ |
| addresses | USER | ❌ | ✅ |
| addresses (consolidada) | USER | ❌ | ✅ |

### SYSTEM (~25)

| Tabela | Classe | store_id | Ação |
|---|---|---|---|
| plans | SYSTEM | ❌ | ✅ |
| subscriptions | GLOBAL partner | ❌ | ✅ |
| billing_purchases | GLOBAL partner | ❌ | ✅ |
| billing_payments | GLOBAL partner | ❌ | ✅ |
| billing_invoices | GLOBAL partner | ❌ | ✅ |
| billing_events | GLOBAL partner | ❌ | ✅ |
| usage_counters | GLOBAL partner | ❌ | ✅ |
| unidades_medida | SYSTEM | ❌ | ✅ |
| marketplace_partner_categories | SYSTEM | ❌ | ✅ |
| marketplace_synonym_groups | SYSTEM | ❌ | ✅ |
| marketplace_synonym_terms | SYSTEM | ❌ | ✅ |
| marketplace_metrics_events | SYSTEM | ❌ | ✅ |
| audit_logs | SYSTEM | ❌ | ✅ |
| admin_roles | SYSTEM | ❌ | ✅ |
| admin_audit_logs | SYSTEM | ❌ | ✅ |
| admin_step_up_tokens | SYSTEM | ❌ | ✅ |
| admin_actions | SYSTEM | ❌ | ✅ |
| user_2fa_secrets | SYSTEM | ❌ | ✅ |
| user_2fa_backup_codes | SYSTEM | ❌ | ✅ |
| user_2fa_settings | SYSTEM | ❌ | ✅ |
| user_2fa_attempts | SYSTEM | ❌ | ✅ |
| email_send_log | SYSTEM | ❌ | ✅ |
| email_change_otps | SYSTEM | ❌ | ✅ |
| account_deletions | SYSTEM | ❌ | ✅ |
| compliance_logs | SYSTEM | ❌ | ✅ |
| rate_limit_logs | SYSTEM | ❌ | ✅ |
| suspicious_activities | SYSTEM | ❌ | ✅ |
| notifications | SYSTEM (user) | ❌ | ✅ |
| push_subscriptions | SYSTEM (user) | ❌ | ✅ |
| notification_delivery_log | SYSTEM | ❌ | ✅ |
| notification_preferences | SYSTEM (user) | ❌ | ✅ |
| notification_scheduled_jobs | GLOBAL partner | ❌ | ✅ |
| processed_webhook_events | SYSTEM | ❌ | ✅ |
| collections | SYSTEM (user) | ❌ | ✅ |
| collection_items | SYSTEM | ❌ | ✅ |
| community_videos | GLOBAL | ❌ partner_id | 🔧 GLOBAL (vinculado ao plano do partner) |
| favorites | SYSTEM (user) | ❌ | ✅ |
| advertisements | SYSTEM | ❌ | ✅ |
| fraud_checks | SYSTEM | ❌ | ✅ |

### GLOBAL (~12)

| Tabela | Classe | store_id | Ação |
|---|---|---|---|
| partners | GLOBAL | ❌ | ✅ |
| partner_users | GLOBAL | ❌ | ✅ |
| partner_invitations | GLOBAL | ❌ | ✅ |
| customers | GLOBAL | ❌ | 🔧 remover store_id |
| product_categories | GLOBAL | ❌ | ✅ |
| service_categories | GLOBAL | ❌ | ✅ |
| brands | GLOBAL | ❌ | ✅ |
| storage_locations | STORE | ❌ | 🔧 adicionar store_id |
| product_fiscal_profiles | GLOBAL | ❌ | ✅ |
| product_logistics | GLOBAL | ❌ | ✅ |
| campaigns | GLOBAL | ❌ | ✅ |
| reviews | STORE | ✅ store_id (manter) | 🔧 STORE (reputação por loja) |
| partner_return_policies | GLOBAL | ❌ | ✅ |
| community_videos | GLOBAL | ❌ partner_id | 🔧 GLOBAL (plano do partner) |

### HYBRID (~10 entidades + bridges)

| Tabela | Classe | store_id/support | Ação |
|---|---|---|---|
| products | HYBRID | bridge: store_products | 🔧 remover store_id direto |
| services | HYBRID | bridge: store_services | 🔧 remover store_id direto |
| product_variants | HYBRID | bridge: store_product_variants | ✅ |
| product_kits | HYBRID | bridge: store_kits (criar) | 🔧 |
| suppliers | HYBRID | bridge: store_suppliers (criar) | 🔧 |
| payment_methods | HYBRID | store_id nullable | ✅ |
| financial_categories | HYBRID | store_id nullable | 🔧 adicionar |
| finance_accounts | HYBRID | store_id nullable | 🔧 adicionar |
| transaction_contacts | HYBRID | store_id nullable | 🔧 adicionar |
| promotions | HYBRID | bridge: promotion_stores | ✅ |
| coupons | HYBRID | bridge: coupon_stores | ✅ |
| recurring_plans | GLOBAL | ❌ | ✅ |

### STORE (~35)

| Tabela | Classe | store_id | Ação |
|---|---|---|---|
| stores | STORE | id | ✅ |
| store_members | STORE | ✅ | ✅ |
| orders | STORE | ✅ | ✅ |
| order_items | STORE | indireto | ✅ |
| order_attachments | STORE | indireto | ✅ |
| orders_history | STORE | ✅ partner_id | ✅ |
| cart_items | STORE | ✅ | ✅ |
| pre_sales | STORE | ✅ | ✅ |
| sales | STORE | ✅ | ✅ |
| sale_items | STORE | ✅ | ✅ |
| cash_sessions | STORE | ✅ | ✅ |
| cash_movements | STORE | ✅ | ✅ |
| stock_movements | STORE | ✅ | ✅ |
| stock_movement_items | STORE | indireto | ✅ |
| stock_movement_attachments | STORE | indireto | ✅ |
| purchase_cost_history | STORE | ❌ partner_id | ✅ (herda contexto) |
| appointments | STORE | ✅ | ✅ |
| appointment_items | STORE | indireto | ✅ |
| service_orders | STORE | ✅ | ✅ |
| service_order_services | STORE | indireto | ✅ |
| service_order_products | STORE | indireto | ✅ |
| service_order_history | STORE | indireto | ✅ |
| service_order_attachments | STORE | indireto | ✅ |
| quotes | STORE | ✅ | ✅ |
| quote_items | STORE | ✅ | ✅ |
| quotes_history | STORE | ✅ partner_id | ✅ |
| quote_interactions | STORE | indireto | ✅ |
| accounts_payable | STORE | ✅ | ✅ |
| accounts_receivable | STORE | ✅ | ✅ |
| transactions | STORE | ✅ | ✅ |
| transactions_history | STORE | ✅ partner_id | ✅ |
| recurring_transactions | STORE | ✅ | ✅ |
| transaction_payments | STORE | indireto | ✅ |
| transaction_attachments | STORE | indireto | ✅ |
| partner_whatsapp_connections | STORE | ✅ | ✅ |
| whatsapp_templates | STORE | ❌ partner_id | ✅ (plantillas globais) |
| whatsapp_messages | STORE | ✅ | ✅ |
| whatsapp_automation_logs | STORE | ❌ partner_id | ✅ |
| whatsapp_scheduled_jobs | STORE | ❌ partner_id | ✅ |
| delivery_settings | STORE | ✅ | ✅ |
| deliveries | STORE | ❌ | 🔧 adicionar |
| delivery_orders | STORE | ❌ | 🔧 adicionar |
| delivery_fee_rules | STORE | ❌ | 🔧 adicionar |
| return_requests | STORE | ❌ | 🔧 adicionar |
| return_items | STORE | ❌ | 🔧 adicionar |
| return_evidence | STORE | ❌ | 🔧 adicionar |
| return_events | STORE | ❌ | 🔧 adicionar |
| return_refunds | STORE | ❌ | 🔧 adicionar |
| return_messages | STORE | ❌ | 🔧 adicionar |
| return_notifications | STORE | ❌ | 🔧 adicionar |
| store_credits | STORE | ❌ | 🔧 adicionar |
| employee_commissions | STORE | ❌ | 🔧 adicionar |
| sales_goals | STORE | ❌ | 🔧 adicionar |
| sales_goal_progress | STORE | ❌ | 🔧 adicionar |
| recurring_subscriptions | STORE | ❌ | 🔧 adicionar |
| recurring_subscription_items | STORE | ❌ | 🔧 adicionar |
| recurring_executions | STORE | ❌ | 🔧 adicionar |
| subscription_item_credits | STORE | ❌ | 🔧 adicionar |
| subscription_item_credit_ledger | STORE | ❌ | 🔧 adicionar |
| erp_imports | STORE | ❌ partner_id | 🔧 adicionar store_id |
| xml_imports | STORE | ❌ partner_id | 🔧 adicionar store_id |
| reports | STORE | ❌ partner_id | 🔧 adicionar store_id |
| partner_risk_events | GLOBAL | ❌ partner_id | ✅ (decisão: risco é do partner) |
| partner_moderation_actions | GLOBAL | ❌ partner_id | ✅ (decisão: moderação é do partner) |

---

## 7. Resumo de Ações

```
GRUPO A (Limpeza): 5 migrations, risco médio, sem criação de dados novos
  └── Dropar store_id de: customers, products, services, product_kits, suppliers

GRUPO B (HYBRID financeiro): 3 migrations + RLS, risco baixo
  └── Adicionar store_id nullable em: financial_categories, finance_accounts, transaction_contacts

GRUPO C (STORE órfãs): 13 migrations, risco alto (dados existentes)
  └── Adicionar store_id em: deliveries, delivery_orders, delivery_fee_rules,
      return_requests (+sub), store_credits, employee_commissions,
      sales_goals (+progress), recurring_subscriptions (+sub),
      recurring_executions, subscription_item_credits

GRUPO D (Melhorias bridge): 4 migrations, risco baixo
  └── Adicionar visibility_scope + marketplace_visible em: store_products, store_services

GRUPO E (Novas bridges): 3 migrations, risco médio
  └── Criar: store_kits, store_suppliers
```

---

## 8. Decisões Fechadas

Todas as pendências foram resolvidas:

| Decisão | Escolha | store_id? |
|---|---|---|
| `recurring_plans` (planos do parceiro) | **GLOBAL** — plano é do parceiro, assinaturas do cliente são STORE | ❌ manter sem store_id |
| `storage_locations` | **STORE** — local físico pertence a uma loja | 🔧 adicionar store_id |
| `erp_imports`, `xml_imports`, `reports` | **STORE-aware** — importação/relatório é operação de loja | 🔧 adicionar store_id |
| `partner_risk_events`, `partner_moderation_actions` | **GLOBAL** — risco/moderação é do partner | ❌ manter sem store_id |
| `suppliers` | **Bridge** `store_suppliers` — padrão products | 🔧 criar bridge, dropar store_id direto |
| `product_kits` | **Bridge** `store_kits` — padrão products | 🔧 criar bridge, dropar store_id direto |

---

## 9. Documentos Gerados

| Documento | Conteúdo |
|---|---|
| `docs/MULTI_STORE_DATA_MODEL.md` | Definições dos 5 tiers, regras de herança, visibility scope, criação, RLS, casos de uso, anti-patterns |
| `docs/FINAL_PER_TABLE_AUDIT.md` | Auditoria individual de 163 tabelas com classificação, motivo, store_id, bridge, fallback, risco vazamento, impacto marketplace |

---

## 10. Validação Final do Modelo

### 10.1 visibility_scope cobre todos os casos?

| Caso | scope | Como |
|---|---|---|
| Produto global herdado (visível em todas lojas) | `all` (default) | Sem store_products necessário. Preço/estoque globais. |
| Produto global com override em loja | `all` + store_products | store_products opcional. Override price/stock apenas se preenchido. |
| Produto oculto em loja específica | `all` + store_products.is_active=false | Loja não vê o produto. Demais lojas mantêm visibilidade. |
| Produto visível em lojas selecionadas | `selected` + store_products | Apenas lojas com store_products.is_active=true enxergam. |
| Produto exclusivo de uma loja | `exclusive` + store_products | Apenas 1 store_products permitido. Nenhuma outra loja vê. |

**Conclusão**: ✅ `all` / `selected` / `exclusive` cobre todos os 5 casos de uso.

### 10.2 F1-F16 Decision Audit

| Fase | O quê | Manter? | Observação |
|---|---|---|---|
| F1 | Criar stores table + colunas | ✅ Manter | Fundação correta |
| F2 | store_id em tabelas principais | 🔧 **Evoluir** | store_id em products/services/customers/suppliers/kits → remover (bridge já existe ou será criada). Manter em orders, stock_movements, cart_items, payment_methods, reviews. |
| F3 | user_has_store_access() + RLS | ✅ Manter | Essencial para o modelo |
| F4 | store_members + update access | ✅ Manter | Essencial para o modelo |
| F5 | store_products bridge | ✅ Manter | Adicionar visibility_scope + marketplace_visible |
| F6 | store_services bridge | ✅ Manter | Adicionar visibility_scope + marketplace_visible |
| F7 | Store-aware stock | ✅ Manter | Nada a reverter |
| F8 | store_id em appointments | ✅ Manter | Correto como STORE |
| F9 | store_id em financeiro (transactions, AP/AR, quotes) | ✅ Manter | Correto como STORE |
| F10 | store_id em PDV | ✅ Manter | Correto como STORE |
| F11 | Hotfix RLS stores recursion | ✅ Manter | Bugfix necessário |
| F12 | store_id em WhatsApp | ✅ Manter | Correto como STORE |
| F13 | promotion_stores + coupon_stores | ✅ Manter | Corretamente HYBRID |
| F14 | store_id em service_orders | ✅ Manter | Correto como STORE |
| F15 | store_id ativado em payment_methods | ✅ Manter | Corretamente HYBRID |
| F16 | Integração frontend multi-store | ✅ Manter | Já implementado |

**Nada a reverter.** Apenas evoluir: o store_id direto em products/services/customers/suppliers/kits (adicionado na F2) era um passo transitório correto para a época, que agora será substituído pelo padrão bridge (F5/F6 + novas bridges).

### 10.3 Status Final do Modelo

```
┌─────────────────────────────────────────────────────────┐
│           MODELO ARQUITETURAL DEFINITIVO                │
├─────────────────────────────────────────────────────────┤
│ ✅ 163/163 tabelas analisadas                           │
│ ✅ 5 tiers definidos (GLOBAL/HYBRID/STORE/USER/SYSTEM)  │
│ ✅ 2 padrões HYBRID (bridge + nullable)                 │
│ ✅ visibility_scope valida 5 casos de uso               │
│ ✅ 6 decisões de design fechadas                        │
│ ✅ F1-F16 auditado — nada a reverter                    │
│ ✅ Regras de herança documentadas                       │
│ ✅ Padrões RLS definidos por tier                       │
│ ✅ Anti-patterns documentados                           │
│                                                         │
│ MIGRAÇÕES PENDENTES:                                    │
│   Grupo A (limpeza): 5 migrations, risco médio          │
│   Grupo B (HYBRID financeiro): 3 migrations, baixo      │
│   Grupo C (STORE órfãs): 13 migrations, risco alto      │
│   Grupo D (melhorias bridge): 4 migrations, baixo       │
│   Grupo E (novas bridges): 2 migrations, risco médio    │
└─────────────────────────────────────────────────────────┘
```


