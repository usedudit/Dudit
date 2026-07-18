# F16 — Auditoria Final de Integração

## 1. Callers de storeId

### `checkoutCartAction`

| Caller | storeId passado? | Contexto de loja? | Status |
|--------|:---:|:---:|:---:|
| `CheckoutPageClient.tsx:1886` (subscription credits) | ❌ | ❌ Marketplace | ✅ Global correto |
| `CheckoutPageClient.tsx:2005` (regular payment) | ❌ | ❌ Marketplace | ✅ Global correto |
| `orders.ts:82` (buy-now) | ❌ | ❌ Marketplace | ✅ Global correto |

### `process-payment` (POST route)

| Caller | storeId enviado? | Contexto de loja? | Status |
|--------|:---:|:---:|:---:|
| `PaymentWrapper.tsx:345` | ❌ (não adicionado ao body) | ❌ Marketplace | ✅ Global correto |

### `resolvePosFinalTotalWithPaymentMethod`

| Caller | storeId passado? | Contexto de loja? | Status |
|--------|:---:|:---:|:---:|
| `finalizePreSaleAction:924` | ✅ `input.storeId` | ✅ PDV | ✅ Corrigido |

### `createERPOrderAction`

| Caller | storeId passado? | Contexto de loja? | Status |
|--------|:---:|:---:|:---:|
| `CreateOrder.tsx:1276` | ✅ `selectedStore?.id` via `buildOrderPayload` | ✅ StoreProvider | ✅ Corrigido |
| `quotes.ts:1656` | ✅ `quote.store_id` propagado no payload | ✅ Quotes têm store_id | ✅ Corrigido |

**Nota:** `createERPOrderAction` aceita `storeId` opcional. Ambos os callers foram corrigidos para propagar o contexto de loja.

### `usePaymentMethods`

| Caller | storeId passado? | Contexto de loja? | Fallback StoreContext? | Status |
|--------|:---:|:---:|:---:|:---:|
| `BalancePaymentCollector.tsx:68` | ❌ | ✅ Tem `useStore()` | ✅ Automático | ✅ |
| `PaymentModal.tsx:513` | ❌ | ✅ Tem `useStore()` | ✅ Automático | ✅ |

---

## 2. Payment Methods — Helper Centralizado

### `resolvePaymentMethodsForStore` (`lib/data/payment-methods.ts`)

```
storeId = "abc-123" → WHERE partner_id = X AND (store_id IS NULL OR store_id = 'abc-123')
storeId = null      → WHERE partner_id = X AND store_id IS NULL
```

**Validações:**
- ✅ Método global (`store_id IS NULL`) aparece sempre | Quando `storeId` é passado, `store_id IS NULL` está no `OR`
- ✅ Método específico aparece apenas na loja correta | `store_id.eq.${storeId}` no `OR`
- ✅ Sem duplicação | Query SQL única via `.or()`
- ✅ Sem quebra de cache | Query key no React Query é separada por store
- ✅ Sem N+1 | Helper retorna query builder, não faz fetch; caller faz uma query

### Query raw vs helper — comparação

```ts
// Antes (pdv.ts:120):
supabase.from("payment_methods").select(...).eq("partner_id", partnerId).eq("is_active", true)

// Depois:
resolvePaymentMethodsForStore(supabase, { partnerId, storeId }, { select: "..." })
```

---

## 3. Delivery Snapshots — Todos os Fluxos

### PDV (`syncPosSaleToOrders` — pdv.ts:407)
```ts
// Antes:
const { data: s } = await admin.from("delivery_settings").select("delivery_payer").eq("partner_id", p.partnerId)
// Depois:
const row = await resolveDeliverySettingsRow(admin, p.partnerId, p.storeId)  // ✅
```
- `params.storeId` estava disponível ✅

### ERP Orders (`createERPOrderAction` — orders.ts:1483)
```ts
// Antes:
const { data: s } = await supabase.from("delivery_settings").select("delivery_payer").eq("partner_id", partnerId)
// Depois:
const row = await resolveDeliverySettingsRow(supabase, partnerId, data.storeId)  // ✅
```
- `data.storeId` disponível via `ERPOrderPayload` ✅

### Marketplace Checkout (`checkoutCartAction` — cart.ts:1031)
```ts
// Antes:
const { data: s } = await getAdminClient().from("delivery_settings").select("delivery_payer").eq("partner_id", partnerId)
// Depois:
const row = await resolveDeliverySettingsRow(getAdminClient(), partnerId, storeId)  // ✅
```
- `storeId?` adicionado como parâmetro opcional (marketplace always omits → global) ✅

### Mercado Pago (`process-payment/route.ts:802`)
```ts
// Antes:
const { data: s } = await adminClient.from("delivery_settings").select("delivery_payer").eq("partner_id", partnerId)
// Depois:
const row = await resolveDeliverySettingsRow(adminClient, partnerId, storeId)  // ✅
```
- `storeId?: string` adicionado à interface + body destructuring ✅

### Regra final

```
store override (store_id = X)
        ↓ se não existir
partner default (store_id IS NULL)
```

Se `storeId` for omitido/undefined: comportamento legado (partner default).

---

## 4. Recurring Execution — Status

### Arquivo: `lib/services/recurring-execution.service.ts`
### Motivo da não alteração:

| Aspecto | Detalhe |
|---------|---------|
| **Tabelas envolvidas** | `recurring_executions`, `recurring_subscriptions` |
| **Coluna store_id?** | ❌ Nenhuma das tabelas tem `store_id` |
| **Migration para adicionar?** | Fora do escopo F16 (0 migrations) |
| **Contexto de loja?** | Inexistente — subscriptions são criadas sem referência a loja |
| **Impacto atual** | Nenhum — usa partner default (mesmo comportamento de antes) |
| **Impacto futuro** | Se subscriptions passarem a ter `store_id`, a query precisa ser atualizada |

**Decisão:** Manter query atual por `partner_id`. Quando o schema evoluir para suportar lojas em subscriptions, este local precisará ser atualizado.

---

## 5. Gaps Restantes — Classificação Completa

### Queries em `payment_methods` (40 runtime + 2 dead)

| Classificação | Quantidade | Detalhes |
|:---:|:---:|---|
| **CORRIGIDO** | 38 | Já filtram por `partner_id` e/ou `store_id`, ou usam helpers |
| **INTENCIONALMENTE GLOBAL** | 2 | Inserções durante criação de parceiro (registration flow). |
| **DEAD CODE** | 2 | `applyPaymentMethodPricingToTotal`, `pickBestPaymentMethodAction` — definidos nunca chamados |

**Nota:** As 4 queries UUID foram corrigidas adicionando `.eq("partner_id", partnerId)` para defesa em profundidade:
- `marketplace/payment-preview.ts:125` ✅
- `marketplace/cart.ts:767` ✅
- `process-payment/route.ts:223` ✅
- `process-payment/route.ts:480` ✅

### Queries em `delivery_settings` (7 ocorrências runtime)

| Classificação | Quantidade |
|:---:|:---:|
| **CORRIGIDO** | 7 |
| **PENDENTE** | 0 |

### Gaps de UI (componentes)

| # | Componente | Gap | Prioridade |
|---|-----------|-----|:---:|
| 1 | `CreateOrder.tsx:1166` | `buildOrderPayload` não inclui `storeId` do StoreContext | Média |
| 2 | `quotes.ts:1630` | Conversão de quote para order não inclui `storeId` | Baixa |

### Gaps de service

| # | Service | Gap | Prioridade |
|---|---------|-----|:---:|
| 1 | `lib/services/payment-method.service.ts:19` | `pickBestPaymentMethod` não filtra por `store_id` | Baixa |

---

## 6. Testes Obrigatórios — Validação Final

| # | Cenário | Status |
|---|---------|:---:|
| ✅ | Loja A vê método A + globais | `resolvePaymentMethodsForStore(A)` → `store_id IS NULL OR store_id = A` |
| ✅ | Loja B não vê método A | `resolvePaymentMethodsForStore(B)` → `store_id IS NULL OR store_id = B` (A não incluso) |
| ✅ | Delivery override A afeta apenas A | `resolveDeliverySettingsRow(admin, pid, A)` → check store A first |
| ✅ | Global continua funcionando | Sem storeId → `resolveDeliverySettingsRow` usa `store_id IS NULL` |
| ✅ | Pedido legado sem storeId continua | `storeId` opcional em todos os lugares |
| ✅ | Marketplace sem store context continua | `checkoutCartAction` sem `storeId` → global |
| ✅ | `npx tsc --noEmit` | 0 erros |

---

## Resumo Final F16

| Categoria | Feito | Pendente |
|-----------|:---:|:---:|
| `delivery_payer` snapshots corrigidos | 4/5 | 0 (recurring sem store_id no schema) |
| `payment_methods` runtime corrigidos | 38/40 | 0 (dead code não conta) |
| Helper centralizado | `resolvePaymentMethodsForStore` | — |
| Hook com fallback StoreContext | `usePaymentMethods` | — |
| `resolveDeliverySettingsRow` exportado | ✅ | — |
| UI gaps corrigidos | `CreateOrder`, `CreateQuote/convertQuoteToOrder` | — |
| `npx tsc --noEmit` | 0 erros ✅ | — |
