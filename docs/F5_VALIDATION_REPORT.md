# F5 — Multi-Store Runtime Validation Report

> Data: 2026-07-18
> Status: ✅ Aprovado com correções menores aplicadas

---

## Sumário

1. [F5.1 — Store Context + Reload](#f51--store-context--reload)
2. [F5.2a — Exclusive Default](#f52a--exclusive-default)
3. [F5.2b — Listing Filter by Store](#f52b--listing-filter-by-store)
4. [F5.2c — UI Visibility Scope](#f52c--ui-visibility-scope)
5. [F5.3a — Invite with Store Selection](#f53a--invite-with-store-selection)
6. [RLS & Permissions](#rls--permissions)
7. [Gaps Encontrados](#gaps-encontrados)
8. [Correções Aplicadas](#correções-aplicadas)
9. [Testes](#testes)
10. [Veredito](#veredito)

---

## F5.1 — Store Context + Reload

### Cenário: Trocar Loja A → Loja B → Loja C

| Etapa | Resultado | Detalhes |
|-------|-----------|----------|
| `selectStore(storeId)` atualiza estado React | ✅ | `setSelectedStore(store)` síncrono |
| Salva no localStorage | ✅ | `localStorage.setItem("selectedStoreId", storeId)` |
| Chama `setActiveStoreAction` (cookie HttpOnly) | ✅ | Import dinâmico + chamada |
| `router.refresh()` após cookie | ✅ | `.then(() => router.refresh())` |

### Arquivo: `lib/store-context.tsx`

```ts
const selectStore = (storeId: string) => {
    const store = stores.find((s) => s.id === storeId)
    if (store) {
        setSelectedStore(store)
        localStorage.setItem("selectedStoreId", storeId)
        import("@/app/actions/erp/stores").then(({ setActiveStoreAction }) => {
            setActiveStoreAction(storeId).then(() => {
                router.refresh()  // ✅ Server components recarregam com nova storeId
            })
        })
    }
}
```

### Edge Case Identificado
- ⚠️ Import dinâmico e `setActiveStoreAction` sem `.catch()` — erro silencioso se falhar
- ✅ **Corrigido** — `.catch()` adicionado

---

## F5.2a — Exclusive Default

### Comportamento
- `linkProductToStore()` agora seta `visibility_scope = 'exclusive'` por padrão
- `linkServiceToStore()` idem

### Arquivos: `lib/store-products.ts:229`, `lib/store-services.ts:200`

```ts
payload.visibility_scope = overrides?.visibility_scope ?? 'exclusive'
```

### Validação
| Cenário | Resultado |
|---------|-----------|
| Criar produto na Loja A → product global criado | ✅ |
| → store_products Loja A criado | ✅ |
| → visibility_scope = exclusive | ✅ |
| Trocar para Loja B → produto NÃO aparece | ✅ (filtro F5.2b) |
| Alterar exclusive → all → aparece em todas lojas | ✅ |

### Edge Case Identificado
- ⚠️ `duplicateProductsAction` e `duplicateServiceAction` chamam `linkProductToStore` sem `visibility_scope`, perdendo o scope original
- ✅ **Corrigido** — duplicação agora preserva `visibility_scope` original

---

## F5.2b — Listing Filter by Store

### Funcionamento

```
getERPProductsPageAction(partnerId, { storeId })
├── Busca store_products WHERE store_id = storeId → mySet
├── Busca ALL store_products → allSet
├── excludeIds = allSet - mySet
└── Se excludeIds.length > 0: q = q.not("id", "in", "(...)")
```

### Validação
| Cenário | Resultado |
|---------|-----------|
| Loja A → mostra produtos com bridge Loja A | ✅ |
| Loja A → mostra produtos sem bridge (orphans) | ✅ |
| Loja A → NÃO mostra produtos exclusivos Loja B | ✅ |
| Listagem vazia quando excludeIds = 0 | ✅ |
| QueryKey inclui storeId → re-fetch ao trocar loja | ✅ |

### Arquivos
- `app/actions/erp/products.ts` — filtro por storeId
- `app/actions/erp/servicos.ts` — filtro por storeId
- `components/erp/product/ProductsPage.tsx` — queryKey + storeId
- `components/erp/servicos/ServicesPage.tsx` — queryKey + storeId

---

## F5.2c — UI Visibility Scope

### Novo SidebarCard "Visibilidade" em Produtos e Serviços

```
○ Somente esta loja (exclusive)  ← padrão
○ Todas as lojas (all)
○ Lojas selecionadas (selected)
  └── [x] Matriz
      [x] Loja Centro
      [ ] Loja Shopping
```

### Fluxo de Criação
```
createProductComprehensiveAction(data)
├── scope = data.visibility_scope || 'exclusive'
├── targetStores =
│   ├── 'all'      → todas stores do partner
│   ├── 'selected' → data.visibility_stores
│   └── 'exclusive'→ [finalStoreId]
└── for each sid in targetStores:
    └── linkProductToStore(id, sid, { visibility_scope: scope })
```

### Arquivos
- `components/erp/product/ProductGeneralTab.tsx:563-634`
- `components/erp/servicos/ServiceGeneralTab.tsx:412-467`
- `app/actions/erp/products.ts:550-564`
- `app/actions/erp/servicos.ts:261-275`

---

## F5.3a — Invite with Store Selection

### Fluxo Completo
```
createInvitation({ partnerId, email, role, storeIds: ["LojaA", "LojaC"] })
├── Valida settings.settings_team
├── Gera token, calcula hash
├── Insere partner_invitations com permissions._store_ids_
└── Retorna inviteUrl

acceptInvitation(token)
├── Valida token, email, RPC
├── Cria partner_users
├── Lê _store_ids_ de permissions
└── Cria store_members (upsert)
```

### Validação
| Cenário | Resultado |
|---------|-----------|
| Convite com [Loja A, Loja C] | ✅ |
| `partner_users` criado | ✅ |
| `store_members` criados para Loja A e Loja C | ✅ |
| Sem `store_members` para Loja B | ✅ |
| RLS bloqueia acesso Loja B | ✅ |
| Fallback para loja atual se nada selecionado | ✅ |

### Arquivos
- `app/actions/invitations.ts` — `createInvitation` + `acceptInvitation`
- `components/erp/settings/TeamSubPage.tsx` — seletor de lojas no modal

---

## RLS & Permissions

### Bridge Tables — Políticas Consolidadas

| Bridge | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `store_products` | `user_has_store_access` | owner/admin/manager | owner/admin/manager | owner/admin |
| `store_services` | `user_has_store_access` | owner/admin/manager | owner/admin/manager | owner/admin |
| `store_product_variants` | `user_has_store_access` | owner/admin/manager | owner/admin/manager | owner/admin |
| `store_suppliers` | `user_has_store_access` | owner/admin/manager | owner/admin/manager | owner/admin |
| `store_product_kits` | `user_has_store_access` | owner/admin/manager | owner/admin/manager | owner/admin |
| `store_members` | `get_user_partner_ids()` | partner-level | partner-level | partner-level |

### Resolução de Permissões (`resolveEffectivePermissions`)

```
partner_user.role + partner_user.permissions
    ↓ store_members override?
    ├── SIM → COALESCE(store_members.role, partner_user.role)
    │         deepMerge(partner_user.permissions, store_members.permissions)
    └── NÃO → null (store access denied)
```

### Server Actions — Permission Checks

| Action Group | Check | Status |
|-------------|-------|--------|
| `store-products.ts` (link, unlink, override) | `requireStorePermission(storeId, partnerId, "products", *)` | ✅ |
| `store-services.ts` (link, unlink, override) | `requireStorePermission(storeId, partnerId, "services", *)` | ✅ |
| `stores.ts` (CRUD) | `requireStorePermission` | ✅ |
| `store-members.ts` | `requireStorePermission(storeId, partnerId, "stores", "manage_members")` | ✅ |

---

## Gaps Encontrados

### G1 — 🔴 Store-level permission check ausente nas listagens
**Arquivos:** `app/actions/erp/products.ts:1923`, `app/actions/erp/servicos.ts:67`
**Problema:** `getERPProductsPageAction` e `getERPServicesPageAction` só verificam `requirePermission(partnerId, ...)`, sem `requireStorePermission(storeId, ...)` quando storeId é fornecido.
**Risco:** Usuário com acesso partner-level pode enumerar produtos de lojas que não tem acesso.
**Severidade:** Média
**Correção:** ✅ Adicionado `requireStorePermission(storeId, partnerId, ...)` quando storeId é fornecido.

### G2 — 🟡 visibility_scope server-side sem restrição de role
**Arquivos:** `app/actions/erp/products.ts:552`, `app/actions/erp/servicos.ts:263`
**Problema:** MANAGER pode criar produto com `visibility_scope = 'all'`, publicando para todas as lojas.
**Regra desejada:** Somente Owner/Admin pode alterar visibility_scope.
**Severidade:** Baixa
**Correção:** ✅ Adicionada verificação — se scope != 'exclusive', require que role seja owner ou admin.

### G3 — 🟡 UI visibility_scope sem restrição visual
**Arquivos:** `ProductGeneralTab.tsx:563`, `ServiceGeneralTab.tsx:412`
**Problema:** Todos os 3 radios (exclusive/all/selected) são mostrados para qualquer role.
**Regra desejada:** Owner/Admin vê todos; Manager/Operator vê apenas leitura ou exclusive.
**Severidade:** Baixa (G2 já cobre server-side)
**Status:** 🔄 Postergado (G2 já protege server-side)

### G4 — ⚪ Duplicação perde visibility_scope original
**Arquivos:** `app/actions/erp/products.ts:1701`, `app/actions/erp/servicos.ts:653`
**Problema:** Duplicação chama `linkProductToStore` sem `visibility_scope`, sempre caindo para 'exclusive'.
**Severidade:** Baixa
**Correção:** ✅ Duplicação agora busca o `visibility_scope` original da bridge e o preserva.

### G5 — ⚪ F5.1 sem .catch() no router.refresh()
**Arquivo:** `lib/store-context.tsx:142`
**Problema:** Import dinâmico e `setActiveStoreAction` sem `.catch()`.
**Severidade:** Muito Baixa (falha de cookie não afeta UX principal)
**Correção:** ✅ Adicionado `.catch(() => console.warn(...))`.

---

## Correções Aplicadas

| Gap | Arquivo | Mudança |
|-----|---------|---------|
| G1 🔴 | `app/actions/erp/products.ts` | Adicionado `requireStorePermission(storeId, partnerId, "products", "view")` |
| G1 🔴 | `app/actions/erp/servicos.ts` | Adicionado `requireStorePermission(storeId, partnerId, "services", "view")` |
| G2 🟡 | `app/actions/erp/products.ts` | Se scope != 'exclusive', require role owner/admin |
| G2 🟡 | `app/actions/erp/servicos.ts` | Se scope != 'exclusive', require role owner/admin |
| G4 ⚪ | `app/actions/erp/products.ts` | `duplicateProductsAction` busca visibility_scope original |
| G4 ⚪ | `app/actions/erp/servicos.ts` | `duplicateServiceAction` busca visibility_scope original |
| G5 ⚪ | `lib/store-context.tsx` | `.catch()` adicionado no import/action |

---

## Testes

### TypeScript
```bash
npx tsc --noEmit
# ✅ Sem erros
```

### Testes Automatizados
```bash
npm test
# ✅ 287/288 tests pass (1 falha pré-existente dashboard-engine)
```

---

## Veredito

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ✅ F5.1-F5.3a APROVADO — 7 correções aplicadas           ║
║                                                              ║
║   • F5.1: Store context com router.refresh() ✅             ║
║   • F5.2a: Exclusive-by-default validado ✅                 ║
║   • F5.2b: Listagem filtra por loja ✅                      ║
║   • F5.2c: UI visibility_scope + server action ✅           ║
║   • F5.3a: Convite com seleção de lojas + store_members ✅ ║
║                                                              ║
║   Gaps encontrados: 5                                      ║
║   ├─ G1 (🔴): Listing permission → corrigido               ║
║   ├─ G2 (🟡): visibility_scope role gate → corrigido        ║
║   ├─ G3 (🟡): UI restriction → postergado (G2 já cobre)    ║
║   ├─ G4 (⚪): Duplicate scope → corrigido                   ║
║   └─ G5 (⚪): .catch() → corrigido                          ║
║                                                              ║
║   tsc --noEmit ✅ | 287/288 tests ✅ | RLS ✅               ║
║                                                              ║
║   Próximo: F5.3b — UI de gerenciar acessos por loja        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```
