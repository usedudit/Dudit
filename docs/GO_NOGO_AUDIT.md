# Auditoria Go/No-Go — Modelo Multi-Store Definitivo

## Status: ✅ GO (com ressalvas documentadas)

---

## 1. Validação de Herança / Overrides por Entidade

### 1.1 Produtos e Serviços — Cenários Validados

| Cenário | Como o modelo resolve | Status |
|---|---|---|
| Produto criado na matriz aparece nas lojas por padrão | `products` global + `visibility_scope='all'` (default). Sem store_products necessário. | ✅ |
| Loja altera preço sem afetar outras | `store_products.override_price`. Loja Shopping={R$12}, Loja Centro={R$10 herdado}. | ✅ |
| Loja oculta produto herdado | `store_products.is_active=false` para aquela loja. Demais lojas mantêm visibilidade. | ✅ |
| Loja cria produto exclusivo | `products` global + `store_products` com `visibility_scope='exclusive'` para 1 loja. | ✅ |
| Exclusivo é liberado para outras depois | `scope='exclusive'` → `scope='all'` ou `'selected'`. Adicionar store_products para novas lojas. | ✅ |
| Matriz altera dados base | Herança: loja SEM override recebe o novo valor. Loja COM override mantém o dela. | ✅ |
| Nova loja criada após anos | Zero dados copiados. `resolveProduct(storeId)` já enxerga todos os globais. | ✅ |

**Conclusão**: `visibility_scope` (`all`/`selected`/`exclusive`) + `store_products` cobre **todos** os cenários. Nenhum caso faltando.

### 1.2 Kits

| Cenário | Como resolve | Status |
|---|---|---|
| Kit global herdado | `product_kits` global + `store_kits` (futura bridge) | ✅ |
| Loja altera preço do kit | `store_kits.override_price` | ✅ |
| Loja cria kit exclusivo | `visibility_scope='exclusive'` em `store_kits` | ✅ |

**Necessário**: Criar `store_kits` bridge (Fase 4).

### 1.3 Fornecedores

| Cenário | Como resolve | Status |
|---|---|---|
| Fornecedor global | Sem `store_suppliers` → visível em todas lojas | ✅ |
| Loja desativa fornecedor | `store_suppliers.is_active=false` | ✅ |
| Fornecedor exclusivo | Products padrão: global + `store_suppliers` p/ 1 loja | ✅ |

**Necessário**: Criar `store_suppliers` bridge (Fase 4).

### 1.4 Clientes

| Cenário | Como resolve | Status |
|---|---|---|
| Cliente da marca | `customers.partner_id` → todas lojas veem | ✅ |
| Histórico cross-store | `orders.store_id` preserva loja, `customers` não tem store_id | ✅ |
| Pedido é da loja | `orders.store_id` (STORE) | ✅ |
| Agendamento é da loja | `appointments.store_id` (STORE) | ✅ |
| Marketplace acha cliente | Busca por `partner_id` — loja é irrelevante | ✅ |

**Risco de duplicação**: zero, pois não há store_id para fragmentar.

### 1.5 Cadastros Financeiros (HYBRID Nullable)

| Cenário | Como resolve | Status |
|---|---|---|
| Conta "Mercado Pago" global | `finance_accounts.store_id=NULL` | ✅ |
| Conta "Itaú Centro" específica | `finance_accounts.store_id='centro-uuid'` | ✅ |
| Categoria "Alimentação" global | `financial_categories.store_id=NULL` | ✅ |
| Categoria "Taxa Centro" específica | `financial_categories.store_id='centro-uuid'` | ✅ |
| Loja só vê contas dela + globais | RLS: `store_id IS NULL OR store_id = current_store` | ✅ |

**Necessário**: Adicionar `store_id` nullable + RLS (Fase 2).

### 1.6 Campanhas

| Cenário | Como resolve | Status |
|---|---|---|
| Campanha institucional da marca | `campaigns.store_id=NULL` → todas lojas | ✅ |
| Campanha de unidade específica | `campaigns.store_id='store-uuid'` → só aquela loja | ✅ |
| Promoção dentro de campanha global | `promotion_stores` bridge controla por loja | ✅ |

**Necessário**: Adicionar `store_id` nullable em `campaigns` (Fase 2).

### 1.7 Cupons

| Cenário | Como resolve | Status |
|---|---|---|
| Cupom global | `coupons` sem `coupon_stores` → todas lojas | ✅ |
| Cupom de lojas selecionadas | `coupon_stores` bridge | ✅ JÁ OK |

### 1.8 Promoções

| Cenário | Como resolve | Status |
|---|---|---|
| Promoção global | `promotions` sem `promotion_stores` → todas lojas | ✅ |
| Promoção de lojas selecionadas | `promotion_stores` bridge | ✅ JÁ OK |

### 1.9 Planos Recorrentes

| Cenário | Como resolve | Status |
|---|---|---|
| Plano "5kg ração/mês" global | `recurring_plans` sem store_id | ✅ |
| Assinatura do cliente na loja | `recurring_subscriptions` com store_id | 🔧 Precisa adicionar |

### 1.10 Assinaturas (Dudit)

| Cenário | Como resolve | Status |
|---|---|---|
| Assinatura do partner na Dudit | `subscriptions.partner_id` → GLOBAL SYSTEM | ✅ |
| Recursos por plano | `usage_counters` → GLOBAL SYSTEM | ✅ |

---

## 2. Marketplace — Auditoria de Isolamento

### 2.1 Cadeia de Resolução

```
Requisição do marketplace para loja X:

1. Catálogo
   → ❌ SELECT * FROM products
   → ✅ listStoreProducts(partnerId, storeId)  [já implementado]

2. Preço
   → ❌ products.price
   → ✅ resolved_price (store_products.override_price ?? products.price)

3. Estoque
   → ❌ products.stock_quantity
   → ✅ resolved_stock_quantity (store_products.override_stock_quantity ?? products.stock_quantity)

4. Ranking
   → ❌ AVG(reviews.rating) WHERE product_id = P
   → ✅ AVG(reviews.rating) WHERE product_id = P AND (store_id = X OR store_id IS NULL)

5. Reviews
   → ❌ reviews sem filtro de loja
   → ✅ reviews com store_id = X (ou NULL para reviews legadas)

6. Promoções
   → ❌ promotions sem filtro
   → ✅ promotions + promotion_stores.store_id = X

7. Cupons
   → ❌ coupons sem filtro
   → ✅ coupons + coupon_stores.store_id = X

8. Entrega
   → ❌ delivery_settings sem filtro
   → ✅ delivery_settings.store_id = X

9. Assinaturas recorrentes
   → ❌ recurring_plans sem filtro
   → ✅ recurring_subscriptions.store_id = X

10. Disponibilidade (produto oculto)
    → ✅ store_products.is_active = true (ou sem store_products para 'all')
```

### 2.2 Riscos de Vazamento no Marketplace

| Risco | Onde | Mitigação |
|---|---|---|
| Produto da loja A aparece no catálogo da loja B | `listStoreProducts` sem filtro de store | `listStoreProducts(partnerId, storeId)` já filtra por `store_overrides.store_id` |
| Preço da loja A aparece na loja B | `products.price` sem override | `resolved_price` faz COALESCE |
| Review da loja A no ranking da loja B | `reviews` sem store_id | Filtro `reviews.store_id = X` no ranking por loja |

**Conclusão**: Os `resolveProduct()` e `resolveService()` já existem e centralizam a lógica. O risco é **código novo ignorar esses helpers**. **Regra**: code review deve barrar qualquer `SELECT * FROM products` sem `resolveProduct()`.

---

## 3. Clientes — Validação Cross-Store

```
Cliente João:

Loja Centro (janeiro):
  ├── order (store_id = centro)
  ├── appointment (store_id = centro)
  └── review (store_id = centro)

Loja Shopping (março):
  ├── order (store_id = shopping)
  ├── recurring_subscription (store_id = shopping)
  └── return_request (store_id = shopping)

customers:
  └── João (partner_id = X) ← ÚNICO registro
```

**Funciona corretamente.** O cliente é global, mas cada interação dele tem store_id própria. O marketplace da loja Centro mostra só as interações com `store_id = centro`.

---

## 4. Financeiro — Validação Operacional vs Cadastro

### Operacional (STORE) — já ok

```
transactions (store_id ✅)
├── Venda Loja Centro → store_id = centro
├── Venda Loja Shopping → store_id = shopping
└── RLS isola por loja

accounts_payable (store_id ✅)
accounts_receivable (store_id ✅)
recurring_transactions (store_id ✅)
cash_sessions (store_id ✅)
cash_movements (store_id ✅)
```

### Cadastros (HYBRID nullable) — precisa migrar

```
finance_accounts:
├── "Mercado Pago" (store_id = NULL) → global
├── "Itaú Centro" (store_id = centro) → só loja Centro
├── "Itaú Shopping" (store_id = shopping) → só loja Shopping
└── RLS: store_id IS NULL OR store_id = current_store

financial_categories:
├── "Alimentação" (store_id = NULL) → global
├── "Taxa Centro" (store_id = centro) → só loja Centro
└── RLS: mesmo padrão

transaction_contacts:
├── "Fornecedor X" (store_id = NULL) → global
├── "Contato Y Centro" (store_id = centro) → só loja Centro
└── RLS: mesmo padrão
```

**Mercado Pago global** e **contas bancárias por loja** convivem perfeitamente.

---

## 5. Assinaturas/Recorrência — Validação

```
NÍVEL GLOBAL:
  recurring_plans (sem store_id)
  ├── "5kg Ração/mês" → todas lojas podem vender
  └── "Banho Mensal" → todas lojas podem vender

NÍVEL STORE:
  recurring_subscriptions (store_id)
  ├── João assinou "5kg Ração" na Loja Centro → store_id = centro
  ├── Maria assinou "Banho Mensal" na Loja Shopping → store_id = shopping
  └── Marketplace loja Centro mostra assinaturas dela

  recurring_executions (store_id)
  ├── Execução da ração do João na Loja Centro
  └── Marketplace loja Centro mostra execuções dela
```

**Correto.** O plano é da marca, a assinatura é da loja.

---

## 6. Configurações — Separação Final

### GLOBAL (partner-level)

```
┌─────────────────────────────────────┐
│ Assinatura Dudit (plans/subscriptions) │
│ Recursos habilitados (usage_counters)  │
│ Dados tributários (product_fiscal_profiles)* │
│ Mercado Pago (payment_methods NULL)  │
│ Políticas gerais (partner_return_policies) │
│ Campaigns institucionais (store_id=NULL)  │
│ Planos recorrentes (recurring_plans) │
│ Categorias financeiras globais       │
│ Contas financeiras globais           │
│ Fornecedores globais                 │
│ Clientes                             │
│ Categorias de produto/serviço        │
│ Marcas                               │
└─────────────────────────────────────┘
```

### STORE (store-level)

```
┌─────────────────────────────────────┐
│ Horário (stores.opening_hours)      │
│ Endereço (stores.address)            │
│ WhatsApp (partner_whatsapp_connections) │
│ Vitrine (stores.banner_url/logo_url/gallery) │
│ QR Code (store-specific)             │
│ Fluxo operacional (pedidos, PDV, etc)│
│ Entrega (delivery_settings)          │
│ Estoque (store_products overrides)   │
│ Preço (store_products overrides)     │
│ Comissões/Metas (employee, goals)    │
│ Devoluções (returns)                 │
│ Caixa (cash_sessions)                │
│ Agenda (appointments)                │
│ OS (service_orders)                  │
│ Orçamentos (quotes)                  │
│ Contas financeiras específicas       │
│ Categorias financeiras específicas   │
│ Fornecedores específicos             │
│ Produtos/serviços exclusivos         │
│ Produtos/serviços com override       │
│ Promoções (store-scoped)             │
│ Campanhas de unidade                 │
│ Assinaturas de cliente               │
└─────────────────────────────────────┘
```

---

## 7. Pontos de Atenção (Ressalvas do GO)

### ⚠️ Ponto 1: `product_fiscal_profiles` — Risco Brasil

**Classificação atual**: GLOBAL (partner-scoped)
**Risco**: Se lojas têm CNPJ/IE/regime tributário diferentes (filiais), dados fiscais PRECISAM ser por loja.

| Cenário | Funciona? |
|---|---|
| Todas lojas = mesmo CNPJ | ✅ GLOBAL ok |
| Cada loja = CNPJ diferente | ❌ PRECISA ser STORE ou HYBRID |

**Recomendação**: Adicionar `store_id` nullable em `product_fiscal_profiles` (HYBRID nullable) já nesta migração, mesmo que a maioria use NULL. É uma coluna a mais sem custo, e evita retrabalho futuro.

**Ação**: Incluir no Grupo B (Fase 2) — risco baixo.

### ⚠️ Ponto 2: `created_store_id` em products (auditoria)

**Sugestão**: Adicionar coluna de auditoria `created_store_id UUID REFERENCES stores` em `products`.

```
products:
├── id
├── partner_id
├── created_store_id ← NOVO (só auditoria, não usado em RLS)
├── name, price, ...
└── (sem store_id de escopo)
```

**Regra**: `created_store_id` é **metadata apenas**. Não usado para RLS, visibilidade, ou herança. Só para saber "esse produto nasceu em qual loja?".

**Ação**: Incluir como parte da migração de limpeza do store_id (Grupo A).

### ⚠️ Ponto 3: Campaigns — store_id nullable

**Decisão**: HYBRID nullable (store_id=NULL = global, store_id=UUID = loja específica).

```
campaigns:
├── "Natal 2026" → store_id=NULL (global)
├── "Aniversário Centro" → store_id='centro-uuid' (só loja Centro)
└── Internamente, promotions dentro dela herdam o escopo
```

**Risco**: Baixo. migration simples, sem backfill complexo.

### ⚠️ Ponto 4: Nova loja — zero cópia

**Confirmado**: Quando uma nova loja é criada, NENHUM dado é copiado. `resolveProduct(storeId)` já resolve tudo por herança. Isso é crítico para performance e sanidade dos dados.

---

## 8. Ordem de Migrações F17+

### Fase 0 — Preparação (segurança)

```
Ordem: 0a → 0b

0a. Backup completo do banco
0b. Criar scripts de rollback para todas as migrations abaixo
```

**Risco**: 🟢 Nenhum. Backup é prevenção.

### Fase 1 — Configuração Inicial (risco baixo)

```
Ordem: 1a → 1b → 1c → 1d

1a. ALTER TABLE store_products ADD COLUMN visibility_scope TEXT DEFAULT 'all'
    ALTER TABLE store_products ADD COLUMN marketplace_visible BOOLEAN DEFAULT true
    ALTER TABLE store_services ADD COLUMN visibility_scope TEXT DEFAULT 'all'
    ALTER TABLE store_services ADD COLUMN marketplace_visible BOOLEAN DEFAULT true

1b. ALTER TABLE product_fiscal_profiles ADD COLUMN store_id UUID REFERENCES stores(id)
    (HYBRID nullable — profilático para regime tributário por filial)

1c. ALTER TABLE financial_categories ADD COLUMN store_id UUID REFERENCES stores(id)
    ALTER TABLE finance_accounts ADD COLUMN store_id UUID REFERENCES stores(id)
    ALTER TABLE transaction_contacts ADD COLUMN store_id UUID REFERENCES stores(id)
    (HYBRID nullable — cadastros financeiros)

1d. ALTER TABLE campaigns ADD COLUMN store_id UUID REFERENCES stores(id)
    (HYBRID nullable — campanhas por loja)
```

**Risco**: 🟢 Baixo. Colunas novas, sem dados a migrar. RLS é adicionada depois.
**Dependência**: Nenhuma. Pode rodar em paralelo.

### Fase 2 — Atualizar RLS (risco baixo)

```
Ordem: 2a → 2b

2a. Atualizar RLS de:
    ├── financial_categories
    ├── finance_accounts
    ├── transaction_contacts
    └── campaigns
    Padrão: (store_id IS NULL OR user_has_store_access(store_id))

2b. Atualizar resolveProduct() e resolveService() para respeitar visibility_scope
```

**Risco**: 🟢 Baixo. RLS é adicionada, não remove existente.
**Dependência**: Fase 1 (precisa das colunas).

### Fase 3 — Criar Bridges (risco médio)

```
Ordem: 3a → 3b

3a. Criar store_kits:
    ├── CREATE TABLE store_kits (id, kit_id, store_id, override_price, is_active, visibility_scope, UNIQUE(kit_id, store_id))
    ├── RLS: user_has_store_access(store_id)
    └── Backfill: para product_kits com store_id, criar store_kits

3b. Criar store_suppliers:
    ├── CREATE TABLE store_suppliers (id, supplier_id, store_id, is_active, UNIQUE(supplier_id, store_id))
    ├── RLS: user_has_store_access(store_id)
    └── Backfill: para suppliers com store_id, criar store_suppliers
```

**Risco**: 🟡 Médio. Backfill pode pegar muitos registros dependendo do volume.
**Dependência**: Nenhuma (tabelas novas).

### Fase 4 — Limpeza de store_id Legacy (risco médio)

```
Ordem: 4a → 4b → 4c → 4d → 4e

4a. customers:
    ├── ALTER TABLE customers DROP COLUMN store_id
    └── Atualizar RLS (remover store_id check)

4b. products:
    ├── ALTER TABLE products ADD COLUMN created_store_id UUID (auditoria)
    ├── Para products com store_id NOT NULL, criar store_products com scope='exclusive' + is_active
    ├── ALTER TABLE products DROP COLUMN store_id
    └── Atualizar RLS (remover store_id check)

4c. services:
    ├── Para services com store_id NOT NULL, criar store_services com scope='exclusive'
    ├── ALTER TABLE services DROP COLUMN store_id
    └── Atualizar RLS (remover store_id check)

4d. product_kits (APÓS store_kits criada):
    ├── ALTER TABLE product_kits DROP COLUMN store_id
    └── Atualizar RLS

4e. suppliers (APÓS store_suppliers criada):
    ├── ALTER TABLE suppliers DROP COLUMN store_id
    └── Atualizar RLS (remover store_id check)
```

**Risco**: 🟡 Médio. Produtos/serviços com store_id NOT NULL precisam de backfill para store_products bridge.
**Dependência**: Fase 3 (bridges prontas para kits e suppliers).
**Cuidado**: Backfill deve ser idempotente e testado em staging.

### Fase 5 — STORE órfãs com store_id (risco ALTO)

```
Ordem: 5a → 5b → 5c → ... (pode paralelizar)

5a. storage_locations:
    ├── ALTER TABLE storage_locations ADD COLUMN store_id UUID NOT NULL DEFAULT (store padrão)
    └── RLS: user_has_store_access(store_id)

5b. deliveries, delivery_orders, delivery_fee_rules:
    ├── deliveries: store_id UUID REFERENCES stores
    ├── delivery_orders: indireto via deliveries
    ├── delivery_fee_rules: indireto via delivery_settings (que já tem store_id)
    └── RLS

5c. return_requests (+ sub-tabelas):
    ├── return_requests: store_id UUID
    ├── return_items: indireto
    ├── return_evidence, return_events, return_refunds: indireto
    ├── return_messages, return_notifications: partner_id + indireto
    ├── store_credits: store_id UUID
    └── RLS

5d. employee_commissions:
    ├── store_id UUID
    └── RLS

5e. sales_goals, sales_goal_progress:
    ├── store_id UUID
    └── RLS

5f. recurring_subscriptions, recurring_subscription_items:
    ├── store_id UUID
    └── RLS

5g. recurring_executions:
    ├── store_id UUID
    └── RLS

5h. subscription_item_credits, subscription_item_credit_ledger:
    ├── store_id UUID
    └── RLS

5i. erp_imports, xml_imports:
    ├── store_id UUID
    └── RLS

5j. reports:
    ├── store_id UUID
    └── RLS

5k. purchase_cost_history:
    ├── store_id UUID
    └── RLS
```

**Risco**: 🔴 ALTO. Maior risco desta migração.
**Estratégia de mitigação**:
1. Para partners com 1 loja: auto-assign `store_id = única store do partner`
2. Para partners com múltiplas lojas: `store_id = NULL` temporário + auditoria manual
3. TODAS as migrações desta fase devem ter **rollback script**
4. Rodar em staging com dados reais (anonimizados) antes de produção

**Dependência**: Nenhuma (colunas independentes).

### Resumo de Ordem

```
Fase 0: Backup + Rollbacks
    ↓
Fase 1: Colunas novas (baixo risco)
    ↓
Fase 2: RLS + resolve functions (baixo risco)
    ↓
Fase 3: Bridges store_kits + store_suppliers (médio risco)
    ↓
Fase 4: Remover store_id legacy (médio risco)
    ↓
Fase 5: Adicionar store_id em STOREs órfãs (ALTO risco)
```

---

## 9. Tabelas que NÃO devem ser alteradas

Nenhuma migration deve tocar nestas tabelas:

```
USER:
  profiles, user_profiles, user_addresses, addresses

SYSTEM:
  plans, subscriptions, usage_counters, billing_*,
  processed_webhook_events, audit_logs, admin_*,
  user_2fa_*, email_*, account_deletions, compliance_logs,
  rate_limit_logs, suspicious_activities,
  notifications, push_subscriptions, notification_*,
  collections, collection_items, favorites,
  comunidade_videos, advertisements,
  marketplace_*system* (synonym, metrics),
  fraud_checks, address_coordinates_cache

GLOBAL (já corretas):
  partners, partner_users, partner_invitations,
  product_categories, service_categories, brands,
  product_logistics,
  partner_return_policies, partner_payment_methods,
  partner_risk_events, partner_moderation_actions,
  service_order_sequences, unavailable_types,
  product_suppliers, campaign_customers, coupon_customers,
  promotion_usages (indireto ok)

STORE (já corretas):
  stores, store_members,
  orders, order_items, order_attachments, orders_history,
  cart_items, pre_sales, sales, sale_items,
  cash_sessions, cash_movements,
  stock_movements, stock_movement_items, stock_movement_attachments,
  appointments, appointment_items,
  service_orders + sub (já têm store_id),
  quotes + sub (já têm store_id),
  accounts_payable, accounts_receivable,
  transactions, transactions_history, transaction_payments, transaction_attachments,
  recurring_transactions,
  partner_whatsapp_connections, whatsapp_messages, whatsapp_automation_logs, whatsapp_scheduled_jobs,
  delivery_settings,
  reviews (já têm store_id)
```

---

## 10. Matriz Go/No-Go Final

### ✅ GO (aprovação total)

| Item | Veredito |
|---|---|
| Products/Services model | ✅ GO |
| Customers GLOBAL | ✅ GO |
| Suppliers bridge | ✅ GO |
| Financial HYBRID nullable | ✅ GO |
| Subscriptions split | ✅ GO |
| Marketing HYBRID | ✅ GO |
| Marketplace isolation | ✅ GO |
| Config split GLOBAL/STORE | ✅ GO |
| visibility_scope (all/selected/exclusive) | ✅ GO |
| New store flow | ✅ GO |
| Exclusive product flow | ✅ GO |
| F1-F16 audit | ✅ Nada a reverter |
| 163/163 tables audited | ✅ Completo |

### ⚠️ RESSALVAS (GO condicional)

| Ressalva | Ação | Quando |
|---|---|---|
| `product_fiscal_profiles` pode precisar de store_id para filiais com CNPJ diferente | Adicionar store_id nullable (HYBRID) na Fase 1b | Antes de qualquer outra migração |
| `created_store_id` em products para auditoria | Adicionar coluna na Fase 4b (junto com remoção do store_id antigo) | Junto com limpeza legacy |
| Código novo pode ignorar `resolveProduct()` | Regra de code review: barrar `SELECT * FROM products` sem `resolveProduct()` | Contínuo |
| Fase 5 (STORE órfãs) tem dados existentes sem store_id | Estratégia: partner single-store = auto-assign, multi-store = NULL + auditoria | Durante Fase 5 |

### 🔴 NO-GO (não aprovado)

Nenhum. Modelo fechado sem objeções.

---

## 11. Decisão Final

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ✅  MODELO ARQUITETURAL APROVADO                           ║
║                                                              ║
║   Go-ahead para iniciar F17+ com as seguintes premissas:     ║
║                                                              ║
║   1. Fase 0: Backup + rollbacks (obrigatório)               ║
║   2. Fase 1: Colunas novas + product_fiscal_profiles         ║
║   3. Fase 2: RLS + resolve functions atualizadas             ║
║   4. Fase 3: Bridges store_kits + store_suppliers            ║
║   5. Fase 4: Remover store_id legacy + created_store_id      ║
║   6. Fase 5: STORE órfãs (ALTO risco — cuidado máximo)      ║
║                                                              ║
║   Ressalvas documentadas em 4 pontos acima.                  ║
║   Nenhum bloqueio para iniciar.                              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```
