# Auditoria Arquitetural Multi-Store

## Modelo Híbrido

| Tipo | Descrição | store_id? | Exemplos |
|---|---|---|---|
| **GLOBAL** | Master data, compartilhado entre todas as lojas | ❌ Não | clientes, planos, categorias de produto |
| **STORE** | Dados operacionais pertencem a uma loja específica | ✅ Obrigatório | pedidos, estoque, PDV, agenda, OS |
| **HYBRID** | Cadastro global com override/store opcional | ✅ store_id NULL = global, preenchido = override | produtos, serviços, métodos de pagamento |
| **USER** | Escopo do usuário individual | ❌ Não | profiles, user_addresses |
| **SYSTEM** | Infraestrutura da plataforma | ❌ Não | audit_logs, 2FA, admin |

---

## 1. Core / Foundation

### ✅ Corretamente Classificadas

| Tabela | Classificação | store_id | partner_id | Notas |
|---|---|---|---|---|
| `profiles` | **USER** | ❌ | ❌ | Perfil auth.users |
| `user_profiles` | **USER** | ❌ | ❌ | Perfil estendido |
| `user_addresses` | **USER** | ❌ | ❌ | Endereços do usuário |
| `addresses` | **USER** | ❌ | ❌ | Consolidada |
| `partners` | **GLOBAL** | ❌ | id | Entidade raiz do tenant |
| `stores` | **STORE** | id | ✅ partner_id | Loja individual |
| `partner_users` | **GLOBAL** | ❌ | ✅ partner_id | Vinculo user-partner (cross-store) |
| `partner_invitations` | **GLOBAL** | ❌ | ✅ partner_id | Convites cross-store |
| `store_members` | **STORE** | ✅ store_id | ❌ (indireto) | Vinculo user-loja |

---

## 2. Produtos e Serviços (HYBRID)

### ✅ Corretamente HYBRID

| Tabela | store_id | Bridge | Notas |
|---|---|---|---|
| `products` | ✅ NULL = global | `store_products` | Base global + override price/stock/SKU |
| `services` | ✅ NULL = global | `store_services` | Base global + override price/SKU |
| `product_variants` | ❌ (via products) | `store_product_variants` | Variantes com override por loja |
| `product_kits` | ✅ store_id | ❌ (sem bridge) | Kit-level, mas sem override bridge |

### ⚠️ Atenção: `product_kits`

`product_kits` tem `store_id` adicionado em `02_add_store_id_to_tables.sql`, mas **não tem bridge table** (`store_kits`). O padrão híbrido correto exigiria uma tabela `store_kits` para permitir override por loja sem duplicar o kit base. Atualmente com store_id direto, um kit pertence a UMA loja OU é global — não permite override.

### ✅ GLOBAL (master data de produto)

| Tabela | store_id | Notas |
|---|---|---|
| `product_categories` | ❌ | Categorias → GLOBAL (compartilhado) |
| `brands` | ❌ | Marcas → GLOBAL (compartilhado) |
| `storage_locations` | ❌ | Locais de estoque → GLOBAL (mas operacionalmente por loja?) |
| `product_fiscal_profiles` | ❌ | Perfil fiscal/tributário → **GLOBAL** ✅ (usuário disse "dados tributários" = GLOBAL) |
| `product_logistics` | ❌ | Dados logísticos → GLOBAL |
| `unidades_medida` | ❌ | Tabela sistema → SYSTEM |

> **Observação**: `storage_locations` talvez devesse ser STORE (localização física de estoque pertence a uma loja). Atualmente é partner-scoped (GLOBAL).

---

## 3. Clientes (GLOBAL)

### ⚠️ Inconsistência

| Tabela | Classificação Atual | Classificação Correta | store_id atual |
|---|---|---|---|
| `customers` | HYBRID (nullable store_id) | **GLOBAL** (usuário explicitou) | ✅ (deveria ser ❌) |

**Problema**: `customers` tem `store_id` nullable com RLS `store_id IS NULL OR user_has_store_access(store_id)`. O usuário determinou que clientes são GLOBAL — shared across all stores. Manter store_id em customers permite fragmentação acidental.

**Solução proposta**: Remover store_id de customers (migration), manter apenas partner_id. Clientes do partner são visíveis em todas as lojas.

---

## 4. Fornecedores (HYBRID?)

### ⚠️ Inconsistência

| Tabela | store_id | Notas |
|---|---|---|
| `suppliers` | ✅ nullable (adicionado em 02) | Sem bridge table |

Fornecedores têm store_id nullable mas **não têm bridge table** (`store_suppliers`). Diferente de products/services que têm bridge para override, fornecedores só têm alocação direta. Isso resolve o caso de "fornecedor pertence a uma store", mas não permite o padrão "fornecedor global visível em múltiplas stores com override".

**Necessidade de decisão**: Fornecedor deve ser HYBRID (global + override) ou apenas GLOBAL? Se for HYBRID, precisa de bridge table.

---

## 5. Financeiro

### ✅ STORE (Operacional)

| Tabela | store_id | Notas |
|---|---|---|
| `accounts_payable` | ✅ (via f9) | Contas a pagar |
| `accounts_receivable` | ✅ (via f9) | Contas a receber |
| `transactions` | ✅ (via f9) | Transações financeiras |
| `transactions_history` | ❌ (indireto) | Histórico (herda contexto) |
| `recurring_transactions` | ✅ (via f9) | Transações recorrentes |

### ⚠️ GAP: Master Data Financeiro (HYBRID)

| Tabela | store_id atual | Classificação correta | Gap |
|---|---|---|---|
| `financial_categories` | ❌ | **HYBRID** (global + override) | Sem store_id, sem bridge |
| `finance_accounts` | ❌ | **HYBRID** (global + override) | Sem store_id, sem bridge |

**Problema**: Categorias financeiras e contas financeiras são master data que o usuário quer compartilhado (global) com override por loja. Atualmente são apenas partner-scoped, sem suporte a override.

**Solução proposta**: Criar `store_financial_categories` e `store_finance_accounts` seguindo o padrão `store_products` (bridge com override fields), ou adicionar `store_id` nullable com fallback global.

---

## 6. Pedidos e Carrinho (STORE)

### ✅ Corretamente STORE

| Tabela | store_id | Notas |
|---|---|---|
| `orders` | ✅ (desde 02) | Pedidos |
| `order_items` | ❌ (indireto via orders) | Itens (herda store_id da order) |
| `cart_items` | ✅ (desde 02) | Carrinho |
| `pre_sales` | ✅ (via f10) | Pré-vendas PDV |
| `sales` | ✅ (via f10) | Vendas PDV |
| `sale_items` | ✅ (via f10) | Itens PDV |

---

## 7. Estoque (STORE)

### ✅ Corretamente STORE

| Tabela | store_id | Notas |
|---|---|---|
| `stock_movements` | ✅ (desde 02) | Movimentações |
| `stock_movement_items` | ❌ (indireto) | Itens |
| `purchase_cost_history` | ❌ (partner-scoped) | Histórico de custo |

---

## 8. PDV / Caixa (STORE)

### ✅ Corretamente STORE

| Tabela | store_id | Notas |
|---|---|---|
| `cash_sessions` | ✅ (via f10) | Sessão de caixa |
| `cash_movements` | ✅ (via f10) | Movimentação de caixa |

---

## 9. Agenda (STORE)

### ✅ Corretamente STORE

| Tabela | store_id | Notas |
|---|---|---|
| `appointments` | ✅ (via f8) | Agendamentos |
| `appointment_items` | ❌ (indireto) | Itens |

---

## 10. OS - Ordem de Serviço (STORE)

### ✅ Corretamente STORE

| Tabela | store_id | Notas |
|---|---|---|
| `service_orders` | ✅ (via f14) | OS |
| `service_order_services` | ❌ (indireto) | Serviços da OS |
| `service_order_products` | ❌ (indireto) | Produtos da OS |
| `service_order_history` | ❌ (indireto) | Histórico |

---

## 11. Entregas (STORE) — GAP

### ❌ GAP Crítico

| Tabela | store_id atual | Classificação correta |
|---|---|---|
| `deliveries` | **❌ NÃO TEM** | **STORE** |
| `delivery_orders` | **❌ NÃO TEM** | **STORE** |
| `delivery_fee_rules` | **❌ NÃO TEM** | **STORE** |
| `delivery_settings` | ✅ (via f15) | STORE ✅ |

**Problema**: `deliveries`, `delivery_orders` e `delivery_fee_rules` não têm store_id. Entregas são operacionais de loja (usuário disse "logística → STORE").

---

## 12. Devoluções / Trocas (STORE) — GAP

### ❌ GAP Crítico

| Tabela | store_id atual | Classificação correta |
|---|---|---|
| `return_requests` | **❌ NÃO TEM** | **STORE** |
| `return_items` | **❌ NÃO TEM** | **STORE** |
| `return_evidence` | ❌ (indireto) | STORE |
| `return_events` | ❌ (partner-scoped) | STORE |
| `return_refunds` | ❌ (partner-scoped) | STORE |
| `return_messages` | ❌ (partner-scoped) | STORE |
| `store_credits` | **❌ NÃO TEM** | **STORE** |

**Problema**: Todo o módulo de returns/exchanges não tem store_id. O nome da tabela `store_credits` é enganoso — não tem relação com `stores` (não tem store_id, referência apenas partner_id).

---

## 13. Equipe / Metas (STORE) — GAP

### ❌ GAP Crítico

| Tabela | store_id atual | Classificação correta |
|---|---|---|
| `employee_commissions` | **❌ NÃO TEM** | **STORE** |
| `sales_goals` | **❌ NÃO TEM** | **STORE** |
| `sales_goal_progress` | **❌ NÃO TEM** | **STORE** |

**Problema**: "Equipe" foi classificado como STORE pelo usuário. Comissões e metas são operacionais de loja.

---

## 14. Recorrência / Assinaturas do Partner (STORE) — GAP

### ❌ GAP

| Tabela | store_id atual | Classificação correta |
|---|---|---|
| `recurring_subscriptions` | **❌ NÃO TEM** | **STORE** |
| `recurring_subscription_items` | ❌ (indireto) | STORE |
| `recurring_executions` | **❌ NÃO TEM** | **STORE** |
| `subscription_item_credits` | ❌ (partner-scoped) | STORE |

> **Nota**: Estas são assinaturas de cliente (recorrência), diferentes de `subscriptions` (assinatura do partner). As de cliente são operacionais de loja.

---

## 15. Promoções e Cupons (HYBRID)

### ✅ Corretamente HYBRID

| Tabela | store_id | Bridge | Notas |
|---|---|---|---|
| `promotions` | ❌ | `promotion_stores` ✅ | Global com N:N stores |
| `coupons` | ❌ | `coupon_stores` ✅ | Global com N:N stores |

Estas seguem o padrão correto: base global, bridge pura N:N para stores.

---

## 16. Métodos de Pagamento (HYBRID)

### ✅ Corretamente HYBRID (após F15)

| Tabela | store_id | Notas |
|---|---|---|
| `payment_methods` | ✅ NULL = global | Ativado e integrado no F15 |

RLS correto: `store_id IS NULL OR user_has_store_access(store_id)`.

---

## 17. WhatsApp (STORE)

### ✅ Corretamente STORE

| Tabela | store_id | Notas |
|---|---|---|
| `partner_whatsapp_connections` | ✅ (via f12) | Conexão WhatsApp |
| `whatsapp_messages` | ✅ (via f12) | Mensagens |

---

## 18. Orçamentos (STORE)

### ✅ STORE (após f9)

| Tabela | store_id | Notas |
|---|---|---|
| `quotes` | ✅ (via f9) | Orçamentos |
| `quote_items` | ✅ (via f9) | Itens |

---

## 19. Sistema / Plataforma (SYSTEM / GLOBAL)

### ✅ Corretamente SYSTEM

| Tabela | store_id | Notas |
|---|---|---|
| `plans` | ❌ | Planos de assinatura |
| `subscriptions` | ❌ | Assinatura do partner (GLOBAL) |
| `usage_counters` | ❌ | Contadores de uso |
| `billing_events` | ❌ | Eventos de cobrança |
| `billing_purchases` | ❌ | Compras |
| `billing_payments` | ❌ | Pagamentos |
| `billing_invoices` | ❌ | Faturas |
| `marketplace_partner_categories` | ❌ | Categorias marketplace |
| All admin/audit/2FA tables | ❌ | Sistema |

---

## 20. Avaliações (Reviews)

### ⚠️ Híbrido? 

`reviews` tem store_id (adicionado em 02). Reviews no marketplace são públicas (visíveis para todos). O store_id serve para filtrar avaliações por loja. Atualmente sem RLS store-aware específico (conforme f3: "publicly readable, store_id filter at app level").

**Classificação sugerida**: HYBRID — review pode ser de produto global ou de loja específica.

---

## Resumo de Gaps

### Gaps Críticos (STOREs sem store_id)

| # | Tabelas | Módulo | Risco |
|---|---|---|---|
| 1 | `deliveries`, `delivery_orders`, `delivery_fee_rules` | Entregas | ALTO — dados de logística sem loja |
| 2 | `return_requests`, `return_items`, `return_refunds`, `store_credits` (+ toda sub-tabela) | Devoluções | ALTO — dados operacionais sem loja |
| 3 | `employee_commissions` | Comissões | ALTO — equipe é por loja |
| 4 | `sales_goals`, `sales_goal_progress` | Metas | ALTO — metas são por loja |
| 5 | `recurring_subscriptions`, `recurring_executions` | Recorrência | ALTO — assinaturas de cliente por loja |

### Gaps HYBRID (master data sem suporte a override)

| # | Tabelas | Módulo | Risco |
|---|---|---|---|
| 6 | `financial_categories` | Categorias financeiras | MÉDIO — master data financeiro sem override |
| 7 | `finance_accounts` | Contas financeiras | MÉDIO — master data financeiro sem override |

### Inconsistências de Classificação

| # | Tabela | Classificação atual | Deveria ser | Risco |
|---|---|---|---|---|
| 8 | `customers` | HYBRID (store_id nullable) | **GLOBAL** | MÉDIO — fragmentação de clientes |
| 9 | `storage_locations` | GLOBAL (partner-scoped) | **STORE**? | BAIXO — local físico pode ser por loja |

### Inconsistências de Padrão

| # | Tabela | Problema | Risco |
|---|---|---|---|
| 10 | `suppliers` | store_id nullable sem bridge table | MÉDIO — padrão inconsistente com products/services |
| 11 | `product_kits` | store_id direto sem bridge table | BAIXO — não segue padrão store_* |

---

## Checklist de Correções Recomendadas

### Fase A — Gaps Críticos (ALTA prioridade)

- [ ] Adicionar `store_id` + RLS em: `deliveries`, `delivery_orders`, `delivery_fee_rules`
- [ ] Adicionar `store_id` + RLS em: `return_requests`, `return_items`, `return_refunds`, `store_credits` (e sub-tabelas)
- [ ] Adicionar `store_id` + RLS em: `employee_commissions`
- [ ] Adicionar `store_id` + RLS em: `sales_goals`, `sales_goal_progress`
- [ ] Adicionar `store_id` + RLS em: `recurring_subscriptions`, `recurring_executions` (e sub-tabelas)

### Fase B — HYBRID Master Data (MÉDIA prioridade)

- [ ] Criar bridge table `store_financial_categories` (override de nome? ou apenas N:N?)
- [ ] Criar bridge table `store_finance_accounts` (override de nome/saldo inicial?)
- [ ] Alternativa: adicionar `store_id` nullable em `financial_categories` e `finance_accounts`

### Fase C — Correções de Classificação (MÉDIA prioridade)

- [ ] Remover `store_id` de `customers`, ajustar RLS para partner-scoped apenas
- [ ] Decidir sobre `storage_locations`: STORE ou GLOBAL?
- [ ] Decidir sobre `suppliers`: GLOBAL ou HYBRID com bridge?

### Fase D — Consistência de Padrão (BAIXA prioridade)

- [ ] Avaliar se `product_kits` precisa de bridge table `store_kits`
- [ ] Avaliar se `suppliers` precisa de bridge table `store_suppliers`

---

## Diagrama de Decisões Pendentes

```
suppliers → GLOBAL ou HYBRID?
              ├─ GLOBAL: remover store_id, deixar partner-scoped
              └─ HYBRID: criar store_suppliers bridge (padrão products)

storage_locations → GLOBAL ou STORE?
              ├─ GLOBAL: manter partner-scoped
              └─ STORE: adicionar store_id

financial_categories → HYBRID como?
              ├─ Bridge table (store_financial_categories)
              └─ store_id nullable com fallback global

customers → GLOBAL (já decidido)
              └─ Migration: remover store_id
```

---

## Status Final

| Métrica | Valor |
|---|---|
| Total de tabelas auditadas | ~167 |
| ✅ Corretamente classificadas | ~140 |
| ⚠️ Gaps críticos (STORE sem store_id) | 5 grupos (~15 tabelas) |
| ⚠️ Gaps HYBRID (sem override) | 2 tabelas |
| ⚠️ Inconsistências de classificação | 2 tabelas |
| ⚠️ Inconsistências de padrão | 2 tabelas |
| ❌ Erro grave | Nenhum (arquitetura sólida, gaps pontuais) |

**Conclusão**: A arquitetura segue o modelo híbrido corretamente na maioria dos casos. Os principais gaps são tabelas operacionais que não receberam store_id por terem sido implementadas antes das fases multi-store. Nenhum erro arquitetural fundamental — apenas extensão necessária.
