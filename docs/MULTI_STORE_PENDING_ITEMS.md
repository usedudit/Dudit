# Multi-Store Roadmap — Pendências

## ✅ F16 — Runtime Store Awareness Cleanup (Concluído)

### O que foi feito:

| Item | Status |
|------|:---:|
| `delivery_payer` snapshots (4/5) | ✅ PDV, Orders, Marketplace cart, Mercado Pago |
| `payment_methods` runtime (2/2 críticos) | ✅ `pdv.ts:120`, `usePaymentMethods` hook |
| Helper centralizado | ✅ `resolvePaymentMethodsForStore` em `lib/data/payment-methods.ts` |
| Hook com fallback StoreContext | ✅ `usePaymentMethods` |
| `npx tsc --noEmit` | ✅ 0 erros |

### Fora do escopo F16 (não corrigido):

| Item | Motivo |
|------|--------|
| `recurring-execution.service.ts` | Tabelas `recurring_executions` e `recurring_subscriptions` não têm `store_id`. Sem migration. |
| `lib/services/payment-method.service.ts` | `pickBestPaymentMethod` sem store filter — usado em marketplace (global). |

### Itens corrigidos durante auditoria final:

| Item | Correção |
|------|----------|
| `CreateOrder.tsx:1166` | `buildOrderPayload` agora inclui `storeId: selectedStore?.id` |
| `quotes.ts:1656` | `convertQuoteToOrderAction` agora propaga `quote.store_id` para o order payload |
| `CreateQuote.tsx:955` | `createQuoteAction` agora recebe `storeId: selectedStore?.id` |
| 4 queries UUID em `payment_methods` | Adicionado `.eq("partner_id", partnerId)` em todos os 4 locais |

---

## Pendências Restantes

### 1. `delivery_payer` Snapshots — Recurring Execution

**Arquivo:** `lib/services/recurring-execution.service.ts:252`

**Problema:** Cria pedido de assinatura recorrente congelando `delivery_payer` apenas por `partner_id`.

**Motivo da não correção:** As tabelas `recurring_executions` e `recurring_subscriptions` não possuem coluna `store_id`. Adicionar exigiria migration (fora do escopo F16). Quando o schema evoluir para suportar lojas em subscriptions, este local precisará ser atualizado.

**Status atual:** Comportamento correto para o schema atual (partner default). Nenhum impacto hoje.

---

### 2. UI Gaps

| # | Componente | Gap | Prioridade |
|---|-----------|-----|:---:|
| 1 | `CheckoutPageClient.tsx:1886,2005` | `checkoutCartAction` sem `storeId` — intencional (marketplace) | N/A |

---

### 3. Service: `pickBestPaymentMethod`

**Arquivo:** `lib/services/payment-method.service.ts:19`

**Problema:** Não filtra por `store_id`. Pode retornar método de loja A quando chamado sem store context.

**Uso atual:** Apenas em marketplace checkout (global). Não afeta ERP.

**Prioridade:** Baixa. Se usado em ERP futuramente, precisa de store filter.

---

### 4. `delivery_fee_rules`

**Status:** Fora do escopo da F15.

**Problema:** `delivery_fee_rules` é parceira de `delivery_settings` mas não recebeu `store_id`. Regras de horário são globais por partner.

**Recomendação:** Avaliar em fase futura se lojas precisam de regras de horário independentes.

---

### 5. `employee_commissions` + `sales_goals`

**Status:** Fora do escopo.

**Problema:** Necessita análise de vínculo funcionário → loja. `store_members` existe (F4), mas comissionamento por loja requer design adicional.

**Recomendação:** Aguardar definição de modelo de comissionamento multi-store.

---

## Gaps Gerais (Sem Fase Atribuída)

### 6. Tabelas sem `store_id` (alta prioridade)

Baseado na auditoria completa (~105 tabelas partner sem store_id):

| Grupo | Tabelas | Prioridade | Justificativa |
|-------|---------|------------|---------------|
| Promoções/Cupons | `promotions`, `campaigns`, `coupons` + child tables | Alta | Bridge tables existem (F13), RLS não atualizada |
| Financeiro | `finance_accounts`, `financial_categories` | Alta | Já usado em transações store-aware |
| Entregas | `deliveries`, `delivery_orders` | Média | Natural após F15 delivery_settings |
| Trocas/Devoluções | `return_requests`, `store_credits` + child tables | Média | Vinculado a orders (store-aware) |
| Categorias/Marcas | `product_categories`, `brands`, `storage_locations` | Média | Metadata de produto |
| Agenda | `service_categories`, `unavailable_types` | Média | Configuração de serviço |
| Notificações | `notifications`, `notification_preferences` | Baixa | Independe de loja |
| Billing | `billing_purchases`, `billing_invoices` | Baixa | Faturamento Dudit (não do partner) |

### 7. Tabelas com `store_id` mas RLS desatualizada

| Tabela | store_id existe desde | RLS atual |
|--------|----------------------|-----------|
| `cart_items` | Migration 02 | `auth.uid() = user_id` (user-scoped, sem store filter) |
| `reviews` | Migration 02 | Publicamente legível (intencional) |

`reviews` é intencionalmente pública (marketplace). `cart_items` não precisa de RLS store-aware porque é user-scoped.

---

## Auditoria de Risco por Funcionalidade

| Funcionalidade | Store-Aware? | Risco de vazamento | Notas |
|---------------|-------------|-------------------|-------|
| Produtos | ✅ Completo | Nenhum | store_id + bridge + RLS |
| Serviços | ✅ Completo | Nenhum | store_id + bridge + RLS |
| Clientes | ✅ Parcial | Baixo | store_id existe, RLS ok |
| Pedidos | ✅ Completo | Nenhum | store_id + RLS |
| Financeiro (transações) | ✅ Completo | Nenhum | store_id + RLS (F9) |
| PDV | ✅ Completo | Nenhum | store_id + RLS (F10) |
| WhatsApp | ✅ Completo | Nenhum | store_id + RLS (F12) |
| Service Orders | ✅ Completo | Nenhum | store_id + RLS (F14) |
| Delivery Settings | ✅ Completo | Nenhum | store_id + RLS (F15) |
| Payment Methods | ✅ Completo | Nenhum | store_id + RLS (F15) |
| Promoções | ⚠️ Bridge existe | Baixo | RLS usa get_user_partner_ids, sem store check |
| Cupons | ⚠️ Bridge existe | Baixo | RLS usa get_user_partner_ids, sem store check |
| Devoluções | ❌ Não iniciado | Médio | Vinculado a orders (store-aware) mas sem store_id |
| Comissões | ❌ Não iniciado | Médio | Sem store_id, precisa design |
| Finance Accounts | ❌ Não iniciado | Médio | Referenciado por payment_methods store-aware |
| Categorias | ❌ Não iniciado | Baixo | Metadata, sem acesso direto do usuário |
