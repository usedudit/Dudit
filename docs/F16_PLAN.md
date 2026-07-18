# F16 — Runtime Store Awareness Cleanup

## Escopo

Fechar **11 gaps críticos de runtime** identificados na auditoria F15, priorizando compatibilidade e sem alterar comportamento existente.

### Dois eixos:

| Eixo | Gaps | Prioridade |
|------|------|-----------|
| **A — `delivery_payer` snapshots** | 5 locais que criam pedido congelando `delivery_payer` sem store awareness | Alta |
| **B — `payment_methods` runtime** | 4 locais que consultam métodos sem filtro de loja | Alta |

### Não faz parte:
- Promoções/Cupons (F17)
- Finance Accounts (F18)
- Devoluções (F19)
- Commissions/Delivery Rules (F20)
- `lib/data/partner.ts:78` — `getPartnerPaymentMethodsCached` (adiar, não é crítico runtime)
- Marketplace público (`payment-preview.ts`, `cart.ts` checkout-context) — partner-level, sem store context

---

## Arquiteturas

### Eixo A — Regra de snapshot

```
store delivery_settings override  → usa store.delivery_payer
        ↓ (se não existir)
partner delivery_settings fallback → usa partner.delivery_payer
```

Helper: `resolveDeliverySettingsRow` já existe em `app/actions/shared/delivery.ts`.

Se `storeId` não existir, manter comportamento atual.

### Eixo B — Regra de filtro

```
payment_methods ativos:
  store_id = activeStoreId
        +
  store_id IS NULL (global)
```

Loja A nunca vê método exclusivo da loja B. Métodos globais funcionam em todas.

Helper centralizado: **criar** `resolvePaymentMethodsForStore()` em `lib/data/payment-methods.ts`.

---

## Eixo A: `delivery_payer` Snapshots

### A1. `app/actions/erp/pdv.ts:406` — `finalizePreSaleAction`

**storeId disponível:** ✅ `params.storeId`

**Mudança:** Substituir query direta por `resolveDeliverySettingsRow`.

---

### A2. `app/actions/erp/orders.ts:1483` — `createERPOrderAction`

**storeId disponível:** ✅ `data.storeId`

**Mudança:** Substituir query direta por `resolveDeliverySettingsRow`.

---

### A3. `app/actions/marketplace/cart.ts:1031` — `checkoutCartAction`

**storeId disponível:** ❌ — adicionar `storeId?: string` opcional ao payload.

**Decisão:** Marketplace checkout não tem store context. `storeId` opcional mantém compatibilidade. Se omitido, usa global.

---

### A4. `app/api/mercadopago/process-payment/route.ts:802` — `handler`

**storeId disponível:** ❌ — extrair do body (opcional).

**Mudança:** Extrair `storeId` opcional do body + `resolveDeliverySettingsRow`.

---

### A5. `lib/services/recurring-execution.service.ts:250` — `createRecurringOrder`

**storeId disponível:** ❌ — adicionar ao tipo `ClaimedRecurringExecution`.

**Mudança:** Adicionar `storeId?: string | null` ao tipo. Populada pela subscription original.

---

## Eixo B: `payment_methods` Runtime

### Helper centralizado

**Arquivo:** `lib/data/payment-methods.ts`

```ts
export async function resolvePaymentMethodsForStore(
  supabase: SupabaseClient,
  params: { partnerId: string; storeId?: string | null },
  options?: { select?: string; activeOnly?: boolean }
): Promise<PaymentMethod[]>
```

- Se `storeId` presente: `.or(`store_id.is.null,store_id.eq.${storeId}`)`
- Se `storeId` ausente: `.is("store_id", null)` (só globais)
- Sempre filtra por `partner_id`
- Aceita `select` customizável
- `activeOnly: true` por padrão

**Risco:** Baixo. Função nova, sem impacto em código existente.

---

### B1. `app/actions/erp/pdv.ts:117` — `resolvePosFinalTotalWithPaymentMethod`

**Assinatura atual:**
```ts
async function resolvePosFinalTotalWithPaymentMethod(params: {
    supabase: SupabaseClient
    partnerId: string
    preSaleId: string
    paymentBreakdown: PaymentBreakdownEntry[]
})
```

**Mudança:** Adicionar `storeId?: string | null`.

**Query:** Usar `resolvePaymentMethodsForStore(supabase, { partnerId, storeId }, { select: "..." })`.

**Caller:** `finalizePreSaleAction` tem `storeId` ✅. `previewDraftTotalAction` — verificar.

---

### B2. `app/actions/erp/orders.ts:241` — `applyPaymentMethodPricingToTotal`

**Assinatura atual:**
```ts
async function applyPaymentMethodPricingToTotal(
    supabase: SupabaseClient,
    partnerId: string,
    baseTotal: number,
    paymentBreakdown: PaymentBreakdownEntry[],
    options?: { skipPricing?: boolean },
)
```

**Mudança:** Adicionar `storeId?: string | null` como 3º parâmetro.

**Query:** Usar `resolvePaymentMethodsForStore`.

**Caller:** `createERPOrderAction` tem `data.storeId` ✅.

---

### B3. Hook `usePaymentMethods` — auditoria

**Arquivo:** `hooks/use-payment-methods.ts`

**Assinatura atual:**
```ts
export function usePaymentMethods(partnerId: string)
```

**Mudança:**
```ts
export function usePaymentMethods(partnerId: string, storeId?: string | null)
```

**Fallback automático:** Se `storeId` não for passado, o hook tenta ler do `StoreContext`. Isto evita adicionar prop manualmente em cada componente. O hook verifica:
1. `storeId` passado como parâmetro
2. Fallback: `useStoreContext()` → `selectedStore?.id`
3. Se nenhum dos dois: undefined → action só retorna globais

**Query Key:** Mudar de `["erp-payment-methods", partnerId]` para `["erp-payment-methods", partnerId, storeId || "__global__"]` para cache correto.

**Impacto de cache reset:** Aceitável. Query key muda uma vez na atualização. Cache de 60s.

**Callers do hook (auditar):**

| Caller | storeId no contexto? | Precisa mudar? |
|--------|:---:|:---:|
| `TransactionsPage.tsx` | ✅ StoreContext | ❌ (hook auto-detecta) |
| `PaymentModal.tsx` | ❌ (global) | ❌ (hook auto-detecta) |
| `BalancePaymentCollector.tsx` | ❌ (global) | ❌ (hook auto-detecta) |

**Decisão:** Nenhum caller precisa ser alterado. O hook faz fallback automático via `StoreContext`.

---

## Performance

| Requisito | Como atender |
|-----------|-------------|
| Evitar queries extras | Helper centralizado evita queries duplicadas |
| Evitar N+1 | Helpers usam `.in()` para batch |
| Manter cache | `React Query` keys preservadas, apenas adicionado segmento `storeId` |
| React Query keys | `["erp-payment-methods", partnerId, storeOrGlobal]` |

---

## Segurança

| Validar | Status |
|---------|--------|
| Nenhum runtime usa payment_methods sem store quando contexto existe | Corrigido nos 4 locais |
| Nenhum bypass RLS via admin client sem motivo | Admin client é necessário (server actions). RLS já é store-aware via policies criadas na F15. |
| Marketplace público mantém comportamento | Pulado — marketplace não tem store context |

---

## Ordem de Execução

### Passo 1: Preparação
1. Atualizar `docs/F16_PLAN.md` ✅
2. Criar helper `resolvePaymentMethodsForStore`

### Passo 2: Eixo A — Snapshots (5 arquivos)
3. `pdv.ts` — `finalizePreSaleAction`
4. `orders.ts` — `createERPOrderAction`
5. `cart.ts` — `checkoutCartAction`
6. `process-payment/route.ts` — handler
7. `recurring-execution.service.ts` — `createRecurringOrder`

### Passo 3: Eixo B — Runtime (3 arquivos + 1 hook)
8. `pdv.ts` — `resolvePosFinalTotalWithPaymentMethod`
9. `orders.ts` — `applyPaymentMethodPricingToTotal`
10. `use-payment-methods.ts` — hook + fallback StoreContext

### Passo 4: Validação
11. `npx tsc --noEmit`
12. Smoke test (10 cenários)

---

## Cenários de Teste Obrigatórios

| # | Cenário | O que verificar |
|---|---------|-----------------|
| 1 | Loja A com payment method exclusivo → aparece só na A | Helper `resolvePaymentMethodsForStore` |
| 2 | Loja B não vê método da loja A | Helper |
| 3 | Método global aparece em todas | Helper |
| 4 | Delivery override A altera snapshot apenas A | pdv.ts + orders.ts |
| 5 | Loja sem override usa fallback global | pdv.ts + orders.ts |
| 6 | Pedido legado sem storeId continua funcionando | Todos os 5 snapshots |
| 7 | Recurring execution sem storeId continua | `recurring-execution.service.ts` |
| 8 | Marketplace checkout sem storeId funciona | `cart.ts` |
| 9 | Hook sem storeId → só globais | `usePaymentMethods` |
| 10 | Hook com storeId → globais + store-specific | `usePaymentMethods` |
| 11 | `npx tsc --noEmit` | 0 erros |
