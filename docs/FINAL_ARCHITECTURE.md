# Arquitetura Final Definitiva — Dudit Multi-Store

## 1. Os Cinco Tiers

```
TIER       | store_id  | partner_id | Herda?     | Exemplo
───────────┼───────────┼────────────┼────────────┼────────────────────
GLOBAL     | ❌ nunca  | ✅ sempre  | N/A        | customers, brands
HYBRID     | ⚠️ opcional| ✅ sempre | ✅ base + override | products + store_products
STORE      | ✅ sempre | ✅ sempre  | ❌ próprio  | orders, stock
USER       | ❌ nunca  | ❌ nunca   | N/A        | profiles
SYSTEM     | ❌ nunca  | ⚠️ opcional| N/A        | plans, audit_logs
```

---

## 2. GLOBAL Definitivo

Dados da marca/partner. **Compartilhados entre todas as lojas.** Sem store_id, sem bridge.

### Regras

- Criado pela matriz (owner/admin do partner)
- Toda loja enxerga automaticamente
- NÃO pode ser ocultado de uma loja específica
- NÃO pode ser override por loja
- Para ocultar/override → não é GLOBAL, deve ser HYBRID

### Lista

| Tabela | Motivo |
|---|---|
| `partners` | Entidade raiz do tenant |
| `partner_users` | Vínculo usuário-partner (cross-store) |
| `partner_invitations` | Convites para o partner |
| **`customers`** | **Cliente pertence à marca.** Histórico cross-store. |
| `product_categories` | Categorias de produto da marca |
| `service_categories` | Categorias de serviço da marca |
| `brands` | Marcas/produtos |
| `product_fiscal_profiles` | Dados tributários (NCM, CFOP, CST) |
| `product_logistics` | Dados logísticos (peso, dimensões) |
| `campaigns` | Campanhas de marketing da marca (store_id=NULL = global) |
| `partner_return_policies` | Política de devolução da marca |
| `partner_payment_methods` | Legado (substituído por payment_methods) |
| `recurring_plans` | Planos de assinatura que o partner vende (ex: "5kg ração/mês") |
| `partner_risk_events` | Eventos de risco do partner |
| `partner_moderation_actions` | Ações de moderação do partner |
| `community_videos` | Vídeos da comunidade (limitados pelo plano) |
| `service_order_sequences` | Sequência numérica de OS (por partner) |
| `product_suppliers` | Vínculo produto-fornecedor (global) |
| `unavailable_types` | Tipos de indisponibilidade na agenda |

---

## 3. HYBRID Definitivo

**Dois padrões**:

### 3A. HYBRID Bridge

Base global + bridge table com override fields.

```
┌────────────┐     ┌──────────────────────┐
│ Entidade   │──1:N│ store_<entidade>     │
│ Base       │     │                      │
│ (GLOBAL)   │     │ store_id (FK stores) │
│            │     │ override_field1      │ ← NULL = herda
│            │     │ override_field2      │ ← NULL = herda
│            │     │ visibility_scope     │ ← all | selected | exclusive
└────────────┘     └──────────────────────┘
```

**visibility_scope** (controla quais lojas enxergam):

| scope | Comportamento |
|---|---|
| `all` (default) | Visível em TODAS as lojas. store_products é opcional (só para override/ocultar). |
| `selected` | Visível APENAS nas lojas com store_products.is_active=true. |
| `exclusive` | Exclusivo de UMA loja. Apenas 1 store_products permitido. |

#### Lista

| Base | Bridge | Override Fields |
|---|---|---|
| `products` | `store_products` | `override_price`, `override_stock_quantity`, `override_sku`, `is_active`, `visibility_scope`, `marketplace_visible` |
| `services` | `store_services` | `override_price`, `override_sku`, `is_active`, `visibility_scope`, `marketplace_visible` |
| `product_variants` | `store_product_variants` | `override_stock_quantity`, `is_active` |
| `product_kits` | `store_kits` (criar) | `override_price`, `is_active`, `visibility_scope` |
| `suppliers` | `store_suppliers` (criar) | `is_active` (ativar/desativar na loja) |
| `promotions` | `promotion_stores` | N/A (N:N puro) |
| `coupons` | `coupon_stores` | N/A (N:N puro) |

### 3B. HYBRID Nullable store_id

store_id NULL = global. store_id UUID = exclusivo da loja.

Sem bridge table (sem override fields — a "customização" é a própria existência do registro na loja).

| Tabela | store_id NULL | store_id UUID |
|---|---|---|
| `payment_methods` | Método global (ex: Mercado Pago) | Método exclusivo da loja (ex: conta Itaú Centro) |
| `financial_categories` | Categoria global (ex: Alimentação) | Categoria exclusiva da loja |
| `finance_accounts` | Conta global (ex: MP) | Conta exclusiva da loja (ex: Itaú Centro) |
| `transaction_contacts` | Contato global | Contato exclusivo da loja |
| **`campaigns`** | Campanha global | Campanha exclusiva da loja |

### Fluxo de Herança (HYBRID Nullable)

```
Função resolveCategoryForStore(categoryId, storeId):
  cat = financial_categories.findById(categoryId)
  
  // Se a categoria é exclusiva de outra loja → não visível
  if cat.store_id != NULL AND cat.store_id != storeId:
    return null
  
  // Se é global (store_id=NULL) ou da própria loja → visível
  return cat
```

---

## 4. STORE Definitivo

Dados operacionais pertencem a UMA loja. store_id obrigatório.

### Regras

- Criado no contexto de uma loja específica
- store_id: NOT NULL
- Isolado: loja A NÃO vê dados da loja B
- RLS: `public.user_has_store_access(store_id)`

### Lista

#### ✅ Já implementados

| Tabela | store_id |
|---|---|
| `stores` | id |
| `store_members` | ✅ |
| `orders` + `order_items` + `order_attachments` + `orders_history` | ✅/indireto |
| `cart_items` | ✅ |
| `pre_sales` + `sales` + `sale_items` | ✅ |
| `cash_sessions` + `cash_movements` | ✅ |
| `stock_movements` + `stock_movement_items` + attachements | ✅/indireto |
| `appointments` + `appointment_items` | ✅/indireto |
| `service_orders` + sub-tabelas | ✅/indireto |
| `quotes` + `quote_items` + sub-tabelas | ✅/indireto |
| `accounts_payable` + `accounts_receivable` | ✅ |
| `transactions` + `transactions_history` | ✅/indireto |
| `recurring_transactions` + `transaction_payments` | ✅/indireto |
| `partner_whatsapp_connections` | ✅ |
| `whatsapp_messages` | ✅ |
| `delivery_settings` | ✅ |

#### 🔧 Precisam de store_id

| Tabela | Prioridade |
|---|---|
| `deliveries` + `delivery_orders` + `delivery_fee_rules` | 🔴 Crítico |
| `return_requests` + `return_items` + `return_refunds` + `return_evidence` + `return_events` + `return_messages` + `return_notifications` + `store_credits` | 🔴 Crítico |
| `employee_commissions` | 🔴 Crítico |
| `sales_goals` + `sales_goal_progress` | 🔴 Crítico |
| `recurring_subscriptions` + `recurring_subscription_items` + `recurring_executions` + `subscription_item_credits` + `subscription_item_credit_ledger` | 🔴 Crítico |
| `storage_locations` | 🔴 Crítico |
| `erp_imports` + `xml_imports` | 🟡 Médio |
| `reports` | 🟡 Médio |
| `purchase_cost_history` | 🟡 Médio |

#### GLOBAL (não STORE — corrigido)

| Tabela | Correção |
|---|---|
| `whatsapp_templates` | GLOBAL (templates são da marca, não da loja) |
| `reviews` | Ver abaixo |

---

## 5. Reviews — Caso Especial

`reviews` tem store_id (adicionado na F2). Classificação: **STORE-aware**.

- Review sempre tem um partner_id (quem recebeu a review)
- Review pode ter store_id (opcional — qual loja gerou a experiência)
- Review é pública (marketplace)
- A reputação/ranking usa store_id para filtrar por loja

### Impacto no Marketplace

```
Ranking global do produto = AVG(rating) de TODAS as reviews do produto
Ranking da loja para o produto = AVG(rating) das reviews com store_id = X
Exibição no marketplace da loja X = ranking filtrado por store_id = X
```

---

## 6. USER/SYSTEM

### USER (escopo individual)

| Tabela | store_id | partner_id |
|---|---|---|
| `profiles` | ❌ | ❌ |
| `user_profiles` | ❌ | ❌ |
| `user_addresses` | ❌ | ❌ |
| `addresses` | ❌ | ❌ |

### SYSTEM (infraestrutura)

| Tabela | Notas |
|---|---|
| `plans` | Planos da plataforma Dudit |
| `subscriptions` | Assinatura do partner na Dudit |
| `billing_*` | Faturamento |
| `usage_counters` | Contadores de uso (plan limits) |
| `audit_logs` | Auditoria |
| `admin_*` | Admin |
| `user_2fa_*` | 2FA |
| `email_send_log`, `email_change_otps` | Email |
| `account_deletions` | Exclusão de conta |
| `notifications` + push | Notificações do usuário |
| `collections`, `favorites` | Coleções do usuário |
| `marketplace_synonym_*`, `marketplace_metrics_events` | Busca/analytics |
| `marketplace_partner_categories` | Categorias do marketplace |
| `unidades_medida` | Tabela fixa |
| `processed_webhook_events` | Webhooks |
| `address_coordinates_cache` | Cache de geocoding |
| `fraud_checks` | Antifraude |
| `advertisements` | Anúncios (admin) |
| `rate_limit_logs`, `suspicious_activities` | Segurança |

---

## 7. Fluxo de Criação de Nova Loja

```
1. Owner cria stores row
   ├── nome, slug, endereço, whatsapp, horários
   └── is_headquarters = true (se for a primeira)

2. Owner concede acesso a membros
   ├── partner_users (vínculo partner-pessoa)
   └── store_members (vínculo pessoa-loja com role/permissions)

3. Herança automática (sem criar dados):
   ├── Produtos GLOBAIS → visíveis via products + store_products (se existir)
   ├── Serviços GLOBAIS → visíveis via services + store_services
   ├── Clientes → visíveis (GLOBAL, sem store_id)
   ├── Fornecedores → visíveis se não tiver store_suppliers com is_active=false
   ├── Categorias financeiras → visíveis se store_id=NULL
   ├── Contas financeiras → visíveis se store_id=NULL
   ├── Campanhas → visíveis se store_id=NULL
   └── Métodos de pagamento → visíveis se store_id=NULL

4. Configurações específicas da nova loja:
   ├── delivery_settings (criar, pois é STORE)
   ├── payment_methods (criar store-specific se necessário)
   ├── finance_accounts (criar store-specific se necessário)
   ├── storage_locations (criar, pois agora é STORE)
   └── partner_whatsapp_connections (conectar número)

5. NENHUM dado é duplicado automaticamente.
```

---

## 8. Fluxo de Criação de Produto Exclusivo

```
Loja Centro quer criar "Combo Executivo Centro" — apenas ela vende.

1. Criar products (GLOBAL):
   INSERT INTO products (partner_id, name, price, ...)
   VALUES ('partner-uuid', 'Combo Executivo Centro', 49.90, ...)

2. Vincular à loja via store_products:
   INSERT INTO store_products (product_id, store_id, is_active, visibility_scope)
   VALUES ('product-uuid', 'centro-uuid', true, 'exclusive')

3. Resultado:
   ├── Loja Centro → VÊ o produto (única store_products é dela)
   ├── Loja Shopping → NÃO vê (visibility_scope = 'exclusive', só a loja Centro)
   ├── Loja Curitiba → NÃO vê
   └── Marketplace → mostra apenas no catálogo da Loja Centro

4. Futuramente liberar para outras lojas:

   Opção A: Liberar para todas
   → UPDATE store_products SET visibility_scope = 'all' WHERE product_id = 'X'
   → Agora todas lojas veem. Loja Centro mantém override de preço.

   Opção B: Liberar para selecionadas
   → UPDATE store_products SET visibility_scope = 'selected' WHERE product_id = 'X'
   → INSERT store_products (product_id, store_id, is_active)
     VALUES ('X', 'shopping-uuid', true)
   → Apenas Centro e Shopping veem.

   Opção C: Manter exclusive, mas outras lojas podem criar produtos similares
   → Cada loja cria seu próprio produto + store_products com exclusive
```

---

## 9. Fluxo de Herança

```
PRODUTO: "Coca Cola 2L"

products:
├── price: 10.00
├── stock_quantity: 100
├── is_active: true
└── (sem store_id)

store_products:
├── Loja Centro: override_price=12.00, is_active=true, visibility='all'
├── Loja Shopping: (sem registro)
└── Loja Curitiba: is_active=false (oculto nesta loja)

RESOLUÇÃO:
Loja Centro → price=12.00, stock=100 (herdado), visível
Loja Shopping → price=10.00 (herdado), stock=100 (herdado), visível
Loja Curitiba → oculto (store_products.is_active=false)

FORNECEDOR: "Distribuidora ABC"

suppliers:
├── name: Distribuidora ABC
└── (sem store_id)

store_suppliers:
├── Loja Centro: (sem registro) → visível (global)
├── Loja Shopping: (sem registro) → visível (global)
└── Loja Curitiba: is_active=false → oculto

CONTA FINANCEIRA: "Mercado Pago"

finance_accounts:
├── name: Mercado Pago
├── store_id: NULL (global)
└── visível em TODAS as lojas

CONTA FINANCEIRA: "Banco Itaú Centro"

finance_accounts:
├── name: Banco Itaú Centro
├── store_id: centro-uuid
└── visível APENAS na loja Centro
```

---

## 10. Impacto no Marketplace

### Regra de Ouro

> **Marketplace NUNCA consulta products diretamente.**
> **Sempre usa resolveProduct(storeId) ou resolveService(storeId).**

### O que muda por loja

| Aspecto | Fonte | Resolução |
|---|---|---|
| Catálogo | `products` + `store_products` | `listStoreProducts(partnerId, storeId)` |
| Preço | `products.price` + `store_products.override_price` | `resolvePrice()` com COALESCE |
| Estoque | `products.stock_quantity` + `store_products.override_stock_quantity` | `resolveStock()` com COALESCE |
| SKU | `products.sku` + `store_products.override_sku` | COALESCE |
| Disponibilidade | `products.is_active` + `store_products.is_active` | Se algum for false → oculto |
| Visibilidade | `store_products.visibility_scope` | Ver tabela abaixo |
| Visibilidade Marketplace | `store_products.marketplace_visible` | Se false → não aparece no MP |
| Ranking | `reviews` filtrado por store_id | Média por loja |
| Reviews | `reviews` com store_id opcional | Exibe reviews da loja |
| Promoções | `promotions` + `promotion_stores` | Filtra por store_id |
| Cupons | `coupons` + `coupon_stores` | Filtra por store_id |
| Entrega | `delivery_settings` + `delivery_fee_rules` | Configuração da loja |
| Planos recorrentes | `recurring_plans` + `recurring_subscriptions` | Planos GLOBAL, assinaturas STORE |

### Visibilidade no Marketplace por visibility_scope

```
Produto visibility_scope = 'all':
├── Loja sem store_products → visível com dados base
├── Loja com store_products e is_active=true → visível com overrides
├── Loja com store_products e is_active=false → oculto
└── Loja com store_products e marketplace_visible=false → oculto APENAS no MP

Produto visibility_scope = 'selected':
├── Loja com store_products e is_active=true → visível
├── Loja sem store_products → oculto
└── Loja com store_products e is_active=false → oculto

Produto visibility_scope = 'exclusive':
├── Apenas a loja com store_products vê
└── Todas as outras → oculto
```

### Marketplace Ranking

```
Ranking da Loja X para produto P:
  AVG(r.rating) FROM reviews r
  WHERE r.product_id = P
    AND (r.store_id = X OR r.store_id IS NULL)
    -- store_id NULL para reviews legadas (pré-multi-store)

Ranking GLOBAL do produto P (marketplace principal):
  AVG(r.rating) FROM reviews r
  WHERE r.product_id = P
  -- independente de loja
```

---

## 11. Tabela Resumo por Tier

### GLOBAL (22 tabelas)

```
customers, product_categories, service_categories, brands,
product_fiscal_profiles, product_logistics, product_suppliers,
partner_users, partner_invitations, partners,
campaigns, partner_return_policies, partner_payment_methods,
recurring_plans, partner_risk_events, partner_moderation_actions,
community_videos, service_order_sequences, unavailable_types,
whatsapp_templates, promotion_usages, coupon_customers, campaign_customers
```

### HYBRID Bridge (7 bases + 7 bridges = 14 tabelas)

```
products + store_products
services + store_services
product_variants + store_product_variants
product_kits + store_kits (nova)
suppliers + store_suppliers (nova)
promotions + promotion_stores (já existe)
coupons + coupon_stores (já existe)
```

### HYBRID Nullable (6 tabelas)

```
payment_methods, financial_categories, finance_accounts,
transaction_contacts, campaigns (store_id nullable),
installment_groups
```

### STORE (~44 + 32 com GAP = ~76 tabelas)

```
JÁ OK (44):
stores, store_members,
orders, order_items, order_attachments, orders_history,
cart_items, pre_sales, sales, sale_items,
cash_sessions, cash_movements,
stock_movements, stock_movement_items, stock_movement_attachments,
appointments, appointment_items,
service_orders + 5 sub-tabelas,
quotes + 4 sub-tabelas,
accounts_payable, accounts_receivable,
transactions, transactions_history, transaction_payments, transaction_attachments,
recurring_transactions,
partner_whatsapp_connections, whatsapp_messages, whatsapp_automation_logs, whatsapp_scheduled_jobs,
delivery_settings, delivery_fee_rules,
promotion_usages, promotion_audit_logs, coupon_usages

COM GAP (32 — precisam store_id):
deliveries, delivery_orders, delivery_fee_rules,
return_requests, return_items, return_evidence, return_events,
return_refunds, return_messages, return_notifications,
store_credits,
employee_commissions,
sales_goals, sales_goal_progress,
recurring_subscriptions, recurring_subscription_items, recurring_executions,
subscription_item_credits, subscription_item_credit_ledger,
storage_locations,
erp_imports, xml_imports, reports,
purchase_cost_history,
kit_items, promotion_products, promotion_categories, promotion_services, promotion_subscriptions,
coupon_products, coupon_categories, coupon_services
```

### USER (4 tabelas)

```
profiles, user_profiles, user_addresses, addresses
```

### SYSTEM (~35 tabelas)

```
plans, subscriptions, usage_counters,
billing_events, billing_purchases, billing_payments, billing_invoices,
processed_webhook_events, unidades_medida,
marketplace_partner_categories, marketplace_synonym_groups,
marketplace_synonym_terms, marketplace_metrics_events,
audit_logs, admin_roles, admin_audit_logs, admin_step_up_tokens, admin_actions,
user_2fa_secrets, user_2fa_backup_codes, user_2fa_settings, user_2fa_attempts,
email_send_log, email_change_otps, account_deletions, compliance_logs,
rate_limit_logs, suspicious_activities,
notifications, push_subscriptions, notification_delivery_log,
notification_preferences, notification_scheduled_jobs,
collections, collection_items, favorites, advertisements,
fraud_checks, address_coordinates_cache
```

---

## 12. Checklist de Decisões Finais

### Produtos/Serviços ✅
- [x] Cadastro mestre global + store_products bridge
- [x] Loja pode criar exclusivo (visibility_scope='exclusive')
- [x] Exclusivo pode ser liberado para outras lojas depois
- [x] Marketplace usa resolved entity (NUNCA base direta)
- [x] Preço, estoque, disponibilidade, ranking independentes por loja

### Clientes ✅
- [x] GLOBAL (partner-scoped)
- [x] Pedido/agendamento/relacionamento continuam STORE
- [x] Histórico do cliente visível em todas as lojas

### Fornecedores ✅
- [x] GLOBAL + store_suppliers bridge
- [x] Loja pode ativar/desativar localmente (is_active)

### Financeiro ✅
- [x] Operações financeiras = STORE (já implementado)
- [x] Contas/categorias/contatos = HYBRID nullable store_id
- [x] Conta global (MP) e conta específica (Itaú Centro) convivem

### Assinaturas ✅
- [x] recurring_plans = GLOBAL (plano do parceiro)
- [x] recurring_subscriptions = STORE (precisa store_id)
- [x] recurring_executions = STORE (precisa store_id)

### Marketing ✅
- [x] campaigns = HYBRID (store_id nullable) — adicionar
- [x] promotions = HYBRID bridge (promotion_stores) — já ok
- [x] coupons = HYBRID bridge (coupon_stores) — já ok

### Marketplace ✅
- [x] Catálogo herdado
- [x] Produtos exclusivos por loja
- [x] Ranking independente por loja (reviews.store_id)
- [x] Preço/estoque independente (store_products overrides)
- [x] Promoções por loja (promotion_stores)
- [x] Entrega por loja (delivery_settings)
- [x] NUNCA usar base diretamente

---

## 13. Anti-Patterns Reforçados

| ❌ Errado | ✅ Correto |
|---|---|
| `SELECT * FROM products WHERE store_id = 'X'` | `resolveProduct(id, storeId)` |
| `SELECT * FROM customers WHERE store_id = 'X'` | `customers` não tem store_id |
| `INSERT INTO products (store_id, ...) VALUES ('X', ...)` | Criar products global + store_products |
| `ALTER TABLE products ADD COLUMN store_id` | ❌ NUNCA — bridge já resolve |
| Criar produto duplicado para cada loja | Produto único + store_products com override |
| `store_id NOT NULL` em tabela HYBRID | store_id deve ser NULLABLE |
| `store_id NULLABLE` em tabela STORE | store_id deve ser NOT NULL |

---

## 14. Resumo de Migrações Pendentes (F17+)

```
FASE 1 — Limpeza (risco médio)
  ├── Dropar store_id de: customers, products, services, product_kits, suppliers
  └── Backfill: criar store_products/store_services para registros com store_id

FASE 2 — HYBRID Nullable (risco baixo)
  ├── Adicionar store_id nullable em: financial_categories, finance_accounts,
  │   transaction_contacts, campaigns
  └── Atualizar RLS destas tabelas

FASE 3 — STOREs órfãs (risco alto)
  ├── Adicionar store_id em: deliveries, delivery_orders, delivery_fee_rules,
  │   return_requests (+sub), store_credits, employee_commissions,
  │   sales_goals (+progress), recurring_subscriptions (+sub),
  │   recurring_executions, subscription_item_credits, storage_locations,
  │   erp_imports, xml_imports, reports
  └── Atualizar RLS de cada tabela

FASE 4 — Novas Bridges (risco médio)
  ├── Criar store_kits (product_kits + bridge)
  ├── Criar store_suppliers (suppliers + bridge)
  └── Backfill from existing store_id data

FASE 5 — Store_products melhorias (risco baixo)
  ├── Adicionar visibility_scope + marketplace_visible em store_products
  ├── Adicionar visibility_scope + marketplace_visible em store_services
  └── Atualizar resolveProduct/resolveService para respeitar visibility_scope
```
