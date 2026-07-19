# F4.5 — Bridge Performance Optimization (N+1)

> Data: 2026-07-18
> Status: ✅ Concluído

---

## Problema

Em `listStoreProducts` (`lib/store-products.ts:186-192`), quando `includeVariants=true`, o código fazia:

```ts
// ANTES — N+1 queries
const allVariants = await Promise.all(
    productIds.map((pid) => listStoreProductVariants(pid, storeId, { isActive: true }))
)
```

Para N produtos, isso executava N queries individuais em `product_variants` com LEFT JOIN em `store_product_variants` — uma por produto.

## Solução

Criada função `listStoreProductVariantsBatch` em `lib/store-variants.ts`:

```ts
// DEPOIS — 1 única query
const variantsByProduct = await listStoreProductVariantsBatch(productIds, storeId, { isActive: true })
```

### O que a função faz:

1. Única query: `product_variants WHERE product_id IN (...)` com LEFT JOIN `store_product_variants`
2. Agrupa resultados em memória por `product_id` usando `Map<string, ResolvedVariant[]>`
3. Retorna o Map para usar direto no código que consome

### Redução de Queries

| Cenário | Antes (N+1) | Depois (batch) | Redução |
|---------|-------------|-----------------|---------|
| 10 produtos com variantes | 11 queries | 2 queries | 82% |
| 50 produtos com variantes | 51 queries | 2 queries | 96% |
| 100 produtos (limit padrão) | 101 queries | 2 queries | 98% |

## Arquivos Alterados

| Arquivo | Mudança |
|---------|---------|
| `lib/store-variants.ts` | Nova função `listStoreProductVariantsBatch()` |
| `lib/store-products.ts` | Substituído `Promise.all(listStoreProductVariants(...))` por `listStoreProductVariantsBatch(...)` |

## Validações

- ✅ `npx tsc --noEmit` — sem erros
- ✅ `npm test` — todos os testes passam (1 falha pré-existente no dashboard-engine, não relacionada)
- ✅ Comportamento preservado: mesmo filtro `isActive`, mesmo LEFT JOIN, mesma lógica de buildResolvedVariant
- ✅ RLS mantido (filtro `store_overrides.store_id` aplicado na query batch)
- ✅ Overrides preservados (store_product_variants com LEFT JOIN)
- ✅ Agrupamento idêntico: `variantsByProduct.get(p.id)` retorna o mesmo que `allVariants[i]`

## Função Adicionada

```ts
export async function listStoreProductVariantsBatch(
    productIds: string[],
    storeId: string | null,
    options?: { isActive?: boolean }
): Promise<Map<string, ResolvedVariant[]>>
```
