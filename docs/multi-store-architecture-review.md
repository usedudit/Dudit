# Revisão Arquitetural Final — Multi Store

> **5 agentes de auditoria executados em paralelo:** RPCs/Triggers, TS Libs, Server Actions, RLS/Segurança, Performance/TODOs.  
> Nenhuma alteração automática foi feita. Apenas análise.

---

## 1. Arquitetura Aprovada ✅

O design geral do Multi Store está **correto e bem estruturado**:

| Pilar | Veredito |
|-------|----------|
| Override > Duplicação (COALESCE em helpers) | ✅ Correto |
| Árvore de estoque 4 níveis | ✅ Correto |
| 4 branches em RPCs de estoque | ✅ Correto |
| Helpers Source of Truth centralizados | ✅ Correto |
| `resolveEffectivePermissions` como fonte de permissões | ✅ Correto |
| Server-side authorization (cookie = UI context only) | ✅ Correto |
| `SET search_path = public` em `finalize_pos_sale` e `user_has_store_access` | ✅ Correto |
| LEFT JOIN com `.filter("store_id", "eq", storeId)` no PostgREST | ✅ Correto |
| Rollbacks para todas as fases | ✅ Correto |
| `handle_order_payment_stock` com `oi.variant_id` real | ✅ Correto |
| `listStoreProducts` com `includeVariants: true` no PDV | ✅ Correto |

---

## 2. Problemas Encontrados

### 🔴 CRÍTICOS (7) — Impedem Fase 11 se não corrigidos

#### C1 — `resolveEffectivePermissions` retorna `null` para OWNERs
**Arquivo:** `lib/store-members.ts:42-49`  
**Problema:** A função busca em `partner_users` pelo `user_id`. Owners (que estão em `partners.user_id`, não em `partner_users`) não são encontrados. `resolveEffectivePermissions` retorna `null`, e QUALQUER server action que chame `requireStoreAccess()` ou `checkStorePermission()` nega acesso ao próprio dono do partner.  
**Contraste:** A função SQL `user_has_store_access` (F4) lida corretamente com owners via `partners.user_id = auth.uid()`.  
**Impacto:** Owners não conseguem acessar stores via TypeScript. Fluxo quebrado.

#### C2 — `create_batch_stock_movement` sem `FOR UPDATE` na leitura inicial (Branch 1 e 3)
**Arquivo:** `20260716_fix_store_aware_rpcs.sql:70-73` e `:125-128`  
**Problema:** O SELECT inicial em `store_product_variants`/`store_products` não usa `FOR UPDATE`. Entre a leitura e o UPDATE, outra transação pode modificar o `override_stock_quantity`, causando **lost update**.  
**Impacto:** Race condition → estoque incorreto em cenários de alta concorrência.

#### C3 — `finalize_order_inventory` decrementa `stock_reserved` duas vezes
**Arquivo:** `f101_update_rpcs_store_product_variants.sql:546-550` e `:679-687`  
**Problema:** O loop principal (Branch 1) já decrementa `store_product_variants.stock_reserved`. O loop extra nas linhas 669-689 decrementa NOVAMENTE para TODOS os itens quando `p_store_id IS NOT NULL`.  
**Impacto:** `stock_reserved` fica negativo ou incorreto. **Data corruption certo em produção com multi-store.**

#### C4 — `restoreCancelledOrderInventory` escreve `stock_quantity` diretamente
**Arquivo:** `app/actions/erp/orders.ts:970-1018`  
**Problema:** Usa `.from("products").update({ stock_quantity })` e `.from("product_variants").update({ stock_quantity })` diretamente — **bypassa completamente a camada de RPCs store-aware**. Ignora `store_product_variants` e `store_products`.  
**Impacto:** Ao restaurar estoque de um pedido cancelado, o estoque da loja não é restaurado. Divergência permanente.

#### C5 — `createERPOrderAction` não define `store_id` no pedido
**Arquivo:** `app/actions/erp/orders.ts:1540`  
**Problema:** O payload de INSERT do pedido não inclui `store_id`. Pedidos ERP são criados sem contexto de loja.  
**Impacto:** Pedidos ERP não são atribuídos a nenhuma loja. Relatórios por loja ficam incompletos.

#### C6 — `createOrderStockMovement` e `createBatchStockMovementAction` não passam `p_store_id`
**Arquivo:** `app/actions/erp/orders.ts:1265-1271`, `stock-movements.ts:178-185`  
**Problema:** Chamam `create_batch_stock_movement` SEM `p_store_id`. O RPC cai no Branch 4 (products base), ignorando overrides de loja.  
**Impacto:** Movimentos de estoque não são registrados na loja correta.

#### C7 — `create_batch_stock_movement` `SECURITY DEFINER` sem `SET search_path = public`
**Arquivo:** `20260716_fix_store_aware_rpcs.sql:203`  
**Problema:** A função é `SECURITY DEFINER` mas não define `search_path`. O default (`"$user", public`) permite hijacking via schema malicioso.  
**Impacto:** **Vulnerabilidade de segurança.** Um invasor com capacidade de criar objetos no schema `$user` pode sequestrar a execução.  
**Nota:** `finalize_pos_sale` na mesma migração (linha 222) TEM `SET search_path = public` — inconsistência na mesma migration.

---

### 🟡 ALTOS (8) — Corrigir antes da Fase 11 ou documentar como dívida

#### H1 — `reserve_order_inventory` Branch 1: variável `INTO` duplicada
**Arquivo:** `f101_update_rpcs_store_product_variants.sql:249`  
**Problema:** `INTO v_store_product_id, v_available, v_allow_without_stock, v_allow_without_stock` — a 3ª coluna (`spv.stock_reserved`) sobrescreve `v_allow_without_stock`, e a 4ª coluna (`allow_sell`) sobrescreve de novo. `stock_reserved` é perdido. A subquery na linha 264 relê sem `FOR UPDATE`.  
**Impacto:** Validação de reserva usa dados potencialmente obsoletos.

#### H2 — Partner context default-allow em erro de RPC
**Arquivo:** `lib/auth/partner-context.ts:313`  
**Problema:** `catch (err) { return { stillHasAccess: true, hasError: true } }` — quando o RPC de verificação de acesso falha, retorna `stillHasAccess: true`. O caller verifica `if (!hasError && stillHasAccess === false)` — como `hasError` é `true`, o bloqueio NUNCA ocorre.  
**Impacto:** **Bypass de segurança.** Se a verificação de acesso falhar (ex: timeout), um usuário revogado continua tendo acesso por até 15 min (TTL do cache). Deveria ser `stillHasAccess: false` quando `hasError` é `true`.

#### H3 — `reservations.ts` sem `import "server-only"`
**Arquivo:** `lib/stock/reservations.ts:1`  
**Problema:** Chama `client.rpc()` que cria chamadas RPC no Supabase. Se importado de um componente cliente, usaria a anon key.  
**Impacto:** Risco de exposição de RPCs internos ao client-side.

#### H4 — F10 POS RLS usa `OR` em vez de `AND` (inconsistente com F3)
**Arquivo:** `migrations/f10_add_store_id_to_pos_tables.sql`  
**Problema:** F3 usa `AND (store_id IS NULL OR user_has_store_access(store_id))`. F10 usa `OR` com `partners.user_id`. Um `partner_user` (não owner) NÃO consegue ver registros POS sem `store_id`.  
**Impacto:** Usuários convidados (gerentes) podem não conseguir ver vendas legadas sem store_id.

#### H5 — Products CRUD: variantes escrevem `stock_quantity` diretamente
**Arquivo:** `app/actions/erp/products.ts:877, 973, 1108, 1196`  
**Problema:** `createProductVariantAction`, `createProductVariantsBatchAction`, `updateProductVariantAction`, `batchUpdateVariantsAction` — todos escrevem `stock_quantity` diretamente em `product_variants` via `.insert()/.update()`.  
**Impacto:** Nenhum RPC store-aware é chamado. `store_product_variants` nunca é populado por essas ações.

#### H6 — `createPOSQuickProductAction` escreve `stock_quantity` diretamente
**Arquivo:** `app/actions/erp/pdv.ts:1194`  
**Problema:** `.from("products").insert({ stock_quantity: ... })` bypassa RPCs.  
**Impacto:** Produto criado no PDV com estoque que não respeita overrides de loja.

#### H7 — N+1 queries em `restoreCancelledOrderInventory`
**Arquivo:** `app/actions/erp/orders.ts:971-1015`  
**Problema:** Loop com 2 queries por item (uma em `product_variants`, uma em `products`).  
**Impacto:** Performance. Pedido com 50 itens = 100 queries.

#### H8 — `checkPermission` duplica lógica de `checkStorePermission`
**Arquivo:** `lib/permissions/access.ts:46-55` vs `lib/store-members.ts`  
**Problema:** Ambas chamam `resolveEffectivePermissions`, constroem `RbacUserLike` e chamam `can()`.  
**Impacto:** Manutenção duplicada. Correções precisam ser aplicadas em dois lugares.

---

### 🔵 MÉDIOS (8) — Documentar e corrigir quando conveniente

| # | Problema | Local |
|---|----------|-------|
| M1 | `decrement_store_product_stock` TOCTOU quando override é NULL | `f7_store_aware_stock.sql:112-116` |
| M2 | `transfer_store_stock` deadlock potencial (lock ordering) | `f7_store_aware_stock.sql:180` |
| M3 | localStorage de stores nunca é invalidado | `lib/store-context.tsx:61` |
| M4 | 15 queries no dashboard com `.limit()` sem `.order()` | `lib/data/dashboard.ts` |
| M5 | 100+ `SELECT *` em produção | Espalhado |
| M6 | 5 TODOs adiados para "Fase 10.1" (já concluída) | `pdv.ts:371,401`, `f10_add_store_id_to_pos_tables.sql:52,410` |
| M7 | `store_services` sem índice `partner_id` | `f6_create_store_services.sql` |
| M8 | `fetchStores` silencioso — usuário vê UI vazia sem feedback | `lib/store-context.tsx:112` |

---

### 🟢 BAIXOS (6) — Cosméticos ou documentais

| # | Problema | Local |
|---|----------|-------|
| B1 | `store_id` ainda na interface `Product`/`Service` | `lib/types/product.ts:65`, `lib/types/service.ts` |
| B2 | Adoção dos resolvers store-aware em ~5-10% | Cross-codebase |
| B3 | `any` types nos resolvers | `store-products.ts`, `store-variants.ts` |
| B4 | `businessInfo: any` sem tipagem | `partner-context.ts:34,46` |
| B5 | `ResolvedVariant` sem `resolved_sku` | `lib/store-variants.ts:92` |
| B6 | `can.ts` pode ser usado em cliente (sem `server-only`) | `lib/permissions/can.ts` |

---

## 3. Prioridade vs Esforço

```
Prioridade
    ↑
  CRÍTICO │ C1 C2 C3 C4 C5 C6 C7
          │
   ALTO   │    H1 H2 H3 H4 H5 H6 H7 H8
          │
  MÉDIO   │         M1-M8
          │
  BAIXO   │              B1-B6
          │
          └──────────────────────────────→ Esforço
              Baixo       Médio       Alto
```

**Recomendação de ordem:**
1. C1 (1 linha de fix — adicionar owner check) → minutos
2. C3 (1 condicional no loop extra) → minutos
3. C7 (adicionar `SET search_path` em 7 funções) → minutos
4. H2 (inverter default de `true` para `false`) → minutos
5. H3 (adicionar `import "server-only"`) → minutos
6. C2 (adicionar `FOR UPDATE` nas SELECTs) → minutos
7. C4, C5, C6, H5, H6 (refatorar server actions) → horas
8. C1 + H8 (unificar `checkPermission`/`checkStorePermission`) → horas
9. H1, M1, M2 (fix RPCs) → horas
10. M3-M8, B1-B6 → baixa prioridade

---

## 4. Recomendação

**Pode seguir para Fase 11? → SIM, com ressalvas.**

### Condições para seguir:

1. **Corrigir C1, C2, C3, C7 antes de qualquer código novo** — São bugs que quebram funcionalidade existente ou criam risco de segurança/data corruption. Estimativa: ~30 min de trabalho.

2. **Corrigir H2 e H3** — São seguranças críticas com fix de 1 linha cada. ~5 min.

3. **Documentar C4, C5, C6, H5, H6 como dívida técnica da Fase 11** — O refactor das server actions para usar store-aware RPCs é um trabalho maior (horas) que pode ser incorporado como parte da Fase 11, já que a Fase 11 mexe nas mesmas áreas (produtos/variantes).

4. **O resto** (H1, H4, H7, H8, M1-M8, B1-B6) pode ser tratado como dívida técnica para sprints futuras.

### Análise de Risco

| Decisão | Risco |
|---------|-------|
| Ignorar C1, C2, C3, C7 e ir para Fase 11 | 🔴 **ALTO** — Data corruption (C2, C3) + owners bloqueados (C1) + vulnerabilidade (C7) |
| Corrigir C1-C7 + H2-H3 e ir para Fase 11 | 🟢 **BAIXO** — Riscos maiores mitigados |
| Corrigir tudo antes de Fase 11 | 🟢 **MÍNIMO** — Mas atrasa o início da Fase 11 |

---

## 5. Veredito Final

| Item | Status |
|------|--------|
| Arquitetura geral | ✅ Aprovada |
| Padrão override + resolvers | ✅ Aprovado |
| 4 branches nos RPCs | ✅ Aprovado |
| RLS store-aware | ⚠️ Gap F3 vs F10 (H4) |
| Permissões por store | 🔴 CRÍTICO — Owners quebrados (C1) |
| Concorrência em RPCs | 🔴 CRÍTICO — TOCTOU e double-decrement (C2, C3) |
| Segurança SECURITY DEFINER | 🔴 CRÍTICO — search_path (C7) |
| Segurança default-allow | 🟡 ALTO — partner-context (H2) |
| Adoção store-aware | 🟡 5-10% — Maioria ainda usa base tables |
| Server actions | 🔴 CRÍTICO — 5 bypassam RPCs (C4-C6, H5, H6) |
| Performance | 🟡 N+1 e SELECT * disseminados |
| TODOs acumulados | 🟡 5 deferidos para Fase 10.1 (já concluída) |

**Veredito:** Sistema funcional e arquitetura correta, mas com **7 bugs críticos** e **8 altos** que precisam de atenção. A fundação é sólida — os problemas são de implementação, não de design.

---

> **Documento gerado em:** 16/07/2026  
> **Auditado por:** 5 agentes de análise autônomos  
> **Nenhuma alteração foi feita automaticamente.**
