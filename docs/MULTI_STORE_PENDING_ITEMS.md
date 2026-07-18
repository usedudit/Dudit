# Multi-Store Roadmap — Pendências

## F15 Leftovers

### 1. `delivery_payer` Snapshots (5 locais)

**Arquivos:**
- `app/actions/marketplace/cart.ts:1033`
- `app/actions/erp/pdv.ts:408`
- `app/actions/erp/orders.ts:1485`
- `app/api/mercadopago/process-payment/route.ts:804`
- `lib/services/recurring-execution.service.ts:252`

**Problema:** Todos congelam `delivery_payer` no momento da criação do pedido consultando `delivery_settings` apenas por `partner_id`, ignorando `store_id`.

**Status atual:** Funcional — o fallback global retorna o valor correto para partners sem override. Se um partner configurar override de `delivery_payer` por loja, o snapshot congelará o valor global (não o da loja).

**Recomendação:** Não alterar agora. Revisar futuramente se pedidos precisarem recalcular ou consultar configuração histórica por loja.

---

### 2. `usePaymentMethods` Hook

**Arquivo:** `hooks/use-payment-methods.ts`

**Problema:** Hook compartilhado usado por 3 componentes não aceita `storeId`. Consumidores:
- `components/erp/transactions/TransactionsPage.tsx` (via hook)
- `components/erp/orders/PaymentModal.tsx` (via hook)
- `components/erp/payments/BalancePaymentCollector.tsx` (via hook)

**Recomendação:** Auditar consumidores futuros. Garantir que qualquer hook de frontend receba `activeStoreId`. Evitar bypass do store filtering.

---

### 3. Queries Diretas em `payment_methods` (~15 locais)

**Arquivos (ERP actions):**
- `app/actions/erp/cash-register.ts:1022,1135` — lookup de tipo por ID
- `app/actions/erp/pdv.ts:120` — fee split (crítico — store override não pego)
- `app/actions/erp/orders.ts:244` — fee pricing (crítico)
- `app/actions/erp/transactions.ts:197,400,1474,1656,1847,2628` — label/account lookups
- `app/actions/erp/recurring-transactions.ts:523` — label lookup
- `app/actions/erp/quick-mode.ts:166` — verifica se partner tem Pix

**Arquivos (Marketplace actions):**
- `app/actions/marketplace/storefront-payment-methods.ts:29`
- `app/actions/marketplace/payment-preview.ts:125`
- `app/actions/marketplace/cart.ts:142,765`
- `app/actions/marketplace/checkout-context.ts:126,134`

**Arquivos (API/Lib):**
- `app/api/mercadopago/process-payment/route.ts:221,478`
- `lib/dashboard-engine/engine.ts:58`
- `lib/services/payment-method.service.ts:27` — `pickBestPaymentMethod`
- `lib/data/partner.ts:78` — `getPartnerPaymentMethodsCached`

**Análise de risco:**

| Tipo | Qtde | Risco | Ação |
|------|------|-------|------|
| Runtime crítico (fee/checkout) | ~5 | Alto | **Prioridade** — store override não aplicado |
| Admin/client (bypass RLS) | ~6 | Baixo | Já coberto por admin client |
| Legado (marketplace partner-level) | ~5 | Baixo | Marketplace não usa stores |
| Coberto por RLS | ~2 | Nenhum | RLS já filtra corretamente |

**Recomendação:** Focar nos ~5 locais críticos de runtime (fee/checkout) em fase futura. O restante é baixo risco.

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
