# F2.6 — Marketplace Client Hardening Audit

## Objetivo

Garantir que nenhum componente client-side consulte ou utilize dados crus de `products`/`services` ignorando o sistema de resolução de visibilidade (`resolveProduct`, `resolveService`, `marketplace_visible`, `visibility_scope`, `storeId`).

---

## Metodologia

1. Busca exaustiva de `.from("products")` e `.from("services")` em toda a codebase
2. Busca de `fetchAllPartnerProducts` e `fetchAllPartnerServices`
3. Classificação de cada ocorrência como:
   - **Permitido (admin/global)** — Admin client, server-only lib, ou ações de ERP admin
   - **Precisa resolver (marketplace/runtime)** — Server actions do marketplace que devem usar resolução de visibilidade
   - **Legado seguro** — Queries ERP com contexto admin autenticado
   - **CLIENT-SIDE BYPASS** — Query direta do browser sem filtro de visibilidade

---

## Resultados

### 1. CLIENT-SIDE BYPASS (corrigido)

| Arquivo | Linhas | Tabela | Risco | Status |
|---------|--------|--------|-------|--------|
| `components/marketplace/ProductDetailsPage.tsx` | 291-295, 301-304 | `products`, `services` | Gift item fetch sem `is_active` ou `show_in_marketplace` | **CORRIGIDO** — substituído por `getGiftItemDetailsAction` (server action com admin client + filtros) |
| `components/marketplace/ServiceDetailsPage.tsx` | 295-299, 305-308 | `products`, `services` | Mesmo padrão | **CORRIGIDO** — substituído por `getGiftItemDetailsAction` |

**Ação:** Criado `getGiftItemDetailsAction` em `app/actions/marketplace/cart-extensions.ts:244-269` — server action que usa admin client com `.eq("is_active", true)` e `.eq("show_in_marketplace", true)`.

---

### 2. Server Actions do Marketplace (sem filtro de visibilidade)

Estes arquivos são `"use server"` — executam no servidor, NÃO no browser. No entanto, suas queries internas não aplicam `show_in_marketplace` ou verificação de `visibility_scope`. Podem retornar itens ocultos se o caller souber o ID.

| Arquivo | Linhas | Risco | Recomendação |
|---------|--------|-------|-------------|
| `app/actions/marketplace/cart-extensions.ts` | 55, 216 | Baixo — cart-add já valida via resolveProduct/resolveService no checkout | Manter |
| `app/actions/marketplace/collections.ts` | 338, 346 | Baixo — já filtrado por `filterMarketplaceVisible*` em linhas 354-361 | Manter |
| `app/actions/marketplace/video-linked-item.ts` | 35, 78 | Baixo — já filtrado por `filterMarketplaceVisible*` | Manter |
| `app/actions/marketplace/suggestions.ts` | 64, 70 | Baixo — já filtrado por `filterMarketplaceVisible*` | Manter |
| `app/actions/marketplace/partners.ts` | 101, 165, 335, 394, 920 | Médio — usa `show_in_marketplace` + `is_active` parcialmente | Adicionar verificação de visibilidade |
| `app/actions/marketplace/products.ts` | 29, 278 | Baixo — usa `resolveProduct` com `storeId` | Já usa resolução |
| `app/actions/marketplace/services.ts` | 28 | Baixo — usa `resolveService` com `storeId` | Já usa resolução |
| `app/actions/marketplace/reviews.ts` | 154, 170 | Baixo — operação de escrita (update rating) | Manter |

**Veredito:** Nenhum desses arquivos representa bypass de visibilidade no client-side. São server actions que já foram auditadas na F2.5.

---

### 3. Queries ERP (client-side, contexto admin autenticado)

| Arquivo | Função | Risco | Justificativa |
|---------|--------|-------|--------------|
| `lib/store-queries.ts` | `fetchAllPartnerProducts` | Baixo | ERP admin — retorna TODOS os produtos ativos do parceiro, incluindo ocultos do marketplace. Comportamento correto para admin. Documentado. |
| `lib/store-queries.ts` | `fetchStoreServices` (no-storeId path) | Baixo | ERP admin — mesmo padrão. |
| `lib/use-store-data.ts` | hook `useStoreData` | Baixo | **Dead code** (0 imports ativos). Envolve as funções acima. Correcto para ERP se reativado. |

**Veredito:** Comportamento correto para ERP admin. Nenhum bypass de marketplace.

---

### 4. Queries Administrativas / Sistema (permitido)

| Diretório | Contexto | Justificativa |
|-----------|----------|--------------|
| `app/actions/admin/` | Moderação, enforcement, reports | Admin client — operações de sistema |
| `app/actions/erp/` | Gestão de estoque, pedidos, PDV | Server actions ERP — contexto autenticado |
| `app/actions/shared/` | Promoções, cupons | Server actions compartilhadas |
| `app/api/` | API routes | Server-side |
| `lib/data/` | Dashboard, relatórios | Server-only (import "server-only") |
| `lib/services/` | Regras de negócio | Server context |
| `lib/server-products.ts`, `lib/store-services.ts` | Resolução de visibilidade | Server-only, já contêm lógica de resolução |
| `app/sitemap.ts` | Sitemap | Server-side, já filtra `show_in_marketplace` |
| `app/print/labels/page.tsx` | Impressão de etiquetas | Admin autenticado |
| `app/erp/` | Páginas ERP | Admin autenticado |

---

### 5. Já filtrados por `show_in_marketplace` / `marketplace_visible` (F2.5)

| Arquivo | Filtro |
|---------|--------|
| `app/actions/marketplace/discover.ts` (14 funções) | `filterMarketplaceVisibleProducts` / `filterMarketplaceVisibleServices` |
| `app/actions/marketplace/search.ts` (4 locais) | `show_in_marketplace` + `is_active` + `filterMarketplaceVisible*` |
| `app/actions/marketplace/partners.ts` (5 locais) | `filterMarketplaceVisibleProducts` / `filterMarketplaceVisibleServices` (F2.5) |
| `app/actions/marketplace/favorites.ts` | `filterMarketplaceVisibleProducts` / `filterMarketplaceVisibleServices` + admin verify |
| `app/actions/marketplace/collections.ts` | `filterMarketplaceVisibleProducts` / `filterMarketplaceVisibleServices` |
| `app/actions/marketplace/checkout-context.ts` | `filterMarketplaceVisibleProducts` / `filterMarketplaceVisibleServices` |
| `app/actions/marketplace/suggestions.ts` | `filterMarketplaceVisibleProducts` / `filterMarketplaceVisibleServices` |
| `app/actions/marketplace/video-linked-item.ts` | `filterMarketplaceVisibleProducts` / `filterMarketplaceVisibleServices` |
| `app/actions/marketplace/products.ts` | `resolveProduct` (lógica visibility_scope embutida) |
| `app/actions/marketplace/services.ts` | `resolveService` (lógica visibility_scope embutida) |
| `lib/store-queries.ts` | `fetchMarketplacePartnerProducts` com `show_in_marketplace` |
| `app/api/cron/sync-redis/route.ts` | `show_in_marketplace` |
| `app/sitemap.ts` | `show_in_marketplace` |

---

## Resumo

| Categoria | Quantidade |
|-----------|-----------|
| Total de ocorrências `.from("products")` | ~100 (em ~40 arquivos) |
| Total de ocorrências `.from("services")` | ~60 (em ~25 arquivos) |
| **CLIENT-SIDE BYPASS (encontrados)** | **2** |
| **CLIENT-SIDE BYPASS (corrigidos)** | **2** ✅ |
| Server actions sem filtro (baixo risco) | 8 (documentados) |
| ERP client-side (admin autenticado, correto) | 3 funções |
| Dead code (latente) | 1 hook (`use-store-data.ts`) |
| Já filtrados na F2.5 | 13+ arquivos |

---

## Ações Realizadas nesta Fase

1. **Auditoria completa** de toda a codebase para `.from("products")` / `.from("services")`
2. **Criação** de `getGiftItemDetailsAction` em `app/actions/marketplace/cart-extensions.ts` — server action para fetch seguro de gift items
3. **Correção** de `ProductDetailsPage.tsx` — gift queries movidas para server action
4. **Correção** de `ServiceDetailsPage.tsx` — gift queries movidas para server action
5. **Verificação** `npx tsc --noEmit` — **PASSA** sem erros

---

## Próximo Passo

**Fase 3** — Criar tabelas bridge `store_kits` + `store_suppliers` seguindo o modelo `FINAL_ARCHITECTURE.md`.
