# F5 — Multi-Store Runtime & Product Audit

> Auditoria completa dos módulos runtime multi-store.
> Data: 2026-07-18
> Status: 📋 Auditoria concluída, implementação em fases

---

## Sumário

1. [Store Context & Switch](#1-store-context--switch)
2. [Produtos e Serviços (ERP)](#2-produtos-e-serviços-erp)
3. [Equipe e Usuários](#3-equipe-e-usuários)
4. [Dados do Negócio / Vitrine](#4-dados-do-negócio--vitrine)
5. [Criação de Lojas](#5-criação-de-lojas)
6. [Regras por Loja (Logística)](#6-regras-por-loja-logística)
7. [Plano de Implementação](#7-plano-de-implementação)

---

## 1. Store Context & Switch

### Estado Atual

| Item | Status | Arquivos |
|------|--------|-----------|
| StoreProvider (React Context) | ✅ Funciona | `lib/store-context.tsx` |
| active_store_id cookie (HttpOnly) | ✅ Funciona | `lib/auth/partner-context.ts` |
| localStorage sync (selectedStoreId) | ✅ Funciona | `lib/store-context.tsx` |
| StoreSwitcher component | ✅ Funciona | `components/store-switcher.tsx` |
| `selectStore()` atualiza cookie + localStorage | ✅ Funciona | `lib/store-context.tsx:133` |
| **router.refresh() / revalidatePath() ao trocar loja** | **❌ NÃO** | `lib/store-context.tsx` |

### Problema

Ao trocar a loja no StoreSwitcher, `selectStore()`:
1. Atualiza estado React ✅
2. Salva no localStorage ✅
3. Chama `setActiveStoreAction(storeId)` (seta cookie) ✅
4. **NÃO chama `router.refresh()` ou `revalidatePath()`** ❌

Isso significa que:
- Server components e dados cacheados continuam servindo dados da loja antiga
- O usuário troca de loja visualmente, mas os dados demoram a refletir
- Queries com `unstable_cache` não são invalidadas

### Correção

Adicionar `router.refresh()` ao final de `selectStore()` para forçar recarregamento de server components com a nova storeId.

### Arquivos Envolvidos

- `lib/store-context.tsx` — adicionar `useRouter` + `router.refresh()`
- `app/actions/erp/stores.ts` — `setActiveStoreAction` (adicionar `revalidatePath`? Opcional, router.refresh() já cobre)

---

## 2. Produtos e Serviços (ERP)

### Estado Atual

| Item | Status | Arquivos |
|------|--------|-----------|
| Bridge store_products/store_services | ✅ Arquitetura pronta | `lib/store-products.ts`, `lib/store-services.ts` |
| resolveProduct, listStoreProducts | ✅ Funciona | `lib/store-products.ts` |
| linkProductToStore (criação) | ✅ Funciona | `lib/store-products.ts:212` |
| visibility_scope default (all) | ✅ Inferred in code | `lib/store-products.ts:383` |
| **UI de visibility_scope no formulário** | **❌ NÃO EXISTE** | `components/erp/product/AddProductPage.tsx` |
| **UI de overrides (preço/SKU/estoque por loja)** | **❌ NÃO EXISTE** | — |
| **UI de associar/remover loja** | **❌ NÃO EXISTE** | — |
| **Listagem de produtos filtra por loja** | **❌ NÃO — retorna todos** | `app/actions/erp/products.ts:1923` (`getERPProductsPageAction`) |
| **Produto criado como 'all' (deveria ser 'exclusive')** | **❌ NÃO — bridge sem scope definido** | `app/actions/erp/products.ts:550` |
| **Serviço criado como 'all' (deveria ser 'exclusive')** | **❌ NÃO** | `app/actions/erp/servicos.ts:245` |
| Server actions store-products/services | ✅ Existem | `app/actions/erp/store-products.ts`, `app/actions/erp/store-services.ts` |

### Problemas

#### 2.1 Produto criado como 'all' em vez de 'exclusive'

**Problema:** `linkProductToStore()` não recebe `visibility_scope`. O padrão atual é `NULL` no banco, que o código interpreta como `'all'`.

**Regra desejada:** Ao criar um produto na Loja A, ele deve nascer com `visibility_scope = 'exclusive'` — pertence somente à loja atual.

#### 2.2 Nenhuma UI de visibility_scope

**Problema:** O formulário de produto/serviço não tem campos para:
- Escolher visibilidade (all/selected/exclusive)
- Selecionar lojas específicas (para 'selected')
- Ver/editar overrides por loja (preço, SKU, estoque)

#### 2.3 Listagem não filtra por loja

**Problema:** `getERPProductsPageAction` retorna todos os produtos do parceiro sem filtrar pela loja ativa. O catálogo ERP mostra produtos que não pertencem à loja atual.

#### 2.4 Serviço criado com store_id inconsistente

**Problema:** O componente `service-form.tsx` (rota `/erp/servicos/new`) não passa `storeId`, caindo para a primeira loja do parceiro.

### Correções Necessárias

1. **`linkProductToStore`/`linkServiceToStore`** — receber `visibility_scope` opcional, default `'exclusive'`
2. **`AddProductPage.tsx`** — adicionar seção "Visibilidade" com radio all/selected/exclusive
3. **`AddProductPage.tsx`** — adicionar seletor de lojas para modo 'selected'
4. **`AddProductPage.tsx`** — adicionar campos override por loja
5. **`getERPProductsPageAction`** — filtrar por storeId (via bridge ou visibility_scope)
6. **Listagem de produtos** — mostrar apenas produtos da loja ativa
7. **`service-form.tsx`** — passar storeId corretamente

### Arquivos Envolvidos

- `app/actions/erp/products.ts` — filtrar listagem, passar scope na criação
- `app/actions/erp/servicos.ts` — passar scope na criação
- `app/actions/erp/store-products.ts` — suporte a visibility_scope
- `app/actions/erp/store-services.ts` — suporte a visibility_scope
- `components/erp/product/AddProductPage.tsx` — UI de visibilidade + overrides
- `components/erp/product/ProductGeneralTab.tsx` — novos campos
- `components/erp/servicos/AddServicePage.tsx` — UI de visibilidade
- `components/erp/service-form.tsx` — passar storeId
- `lib/store-products.ts` — `linkProductToStore` aceitar visibility_scope
- `lib/store-services.ts` — `linkServiceToStore` aceitar visibility_scope

---

## 3. Equipe e Usuários

### Estado Atual

| Item | Status | Arquivos |
|------|--------|-----------|
| `partner_invitations` table | ✅ Funciona | `migrations/600_*.sql` |
| `partner_users` table | ✅ Funciona | — |
| `store_members` table | ✅ Existe | `migrations/f4_create_store_members.sql` |
| `resolveEffectivePermissions` | ✅ Funciona | `lib/store-members.ts` |
| `requireStoreAccess` | ✅ Funciona | `lib/auth/authorization.ts` |
| CRUD actions store-members | ✅ Existem | `app/actions/erp/store-members.ts` |
| **UI de seleção de lojas no convite** | **❌ NÃO EXISTE** | `components/erp/settings/TeamSubPage.tsx` |
| **Invite cria store_members** | **❌ NÃO — só partner_users** | `app/actions/invitations.ts` |
| **UI de gerenciar acessos por loja** | **❌ NÃO EXISTE** | — |
| **Migração automática de convidados para store_members** | **❌ NÃO** | — |

### Problemas

#### 3.1 Convite não cria store_members

O fluxo de convite (`createInvitation` → `acceptInvitation`) cria apenas `partner_users`. O novo usuário não ganha `store_members` automaticamente.

Isso significa que:
- Sem `store_members`, `resolveEffectivePermissions` retorna `null`
- `userHasStoreAccess` retorna `false`
- O usuário não consegue acessar nenhuma loja especificamente

**Solução:** Após `accept_partner_invitation` criar o `partner_users`, criar `store_members` para a loja atual do convidador (ou loja headquarters).

#### 3.2 Sem UI de seleção de lojas no convite

O modal de convite só tem email + role. Não permite selecionar a quais lojas o usuário terá acesso.

**Solução:** Adicionar seletor de lojas no modal de convite, com checkboxes.

#### 3.3 Sem UI de gerenciar membros por loja

Não existe uma tela para ver "Usuários da Loja A" e adicionar/remover acessos.

**Solução:** Adicionar aba "Acessos por loja" na tela de equipe.

### Arquivos Envolvidos

- `app/actions/invitations.ts` — adicionar `storeIds` no convite, criar `store_members` após aceitar
- `components/erp/settings/TeamSubPage.tsx` — seletor de lojas + aba de acessos
- `lib/store-members.ts` — validações
- `components/erp/settings/SettingsPage.tsx` — nova aba se necessário

---

## 4. Dados do Negócio / Vitrine

### Estado Atual

| Item | Status | Arquivos |
|------|--------|-----------|
| `stores` table com campos per-store | ✅ phone, opening_hours, image, banner, gallery, whatsapp | `migrations/f1_expand_stores.sql` |
| Storefront público pega dados da store | ✅ `getCachedStoreBySlug` | `app/actions/marketplace/stores.ts` |
| **ERP "Minha Vitrine" salva em `partners`** | **❌ NÃO é per-store** | `components/erp/settings/ShowcaseSubPage.tsx` |
| **ERP "Dados do Negócio" salva em `partners`** | **❌ NÃO é per-store** | `components/erp/settings/BusinessDataSubPage.tsx` |
| **ERP "Horários" salva em `partners`** | **❌ NÃO é per-store** | `components/erp/settings/BusinessDataSubPage.tsx` |
| **Telefone/endereço por loja** | **❌ NÃO — partner-level** | `components/erp/settings/BusinessDataSubPage.tsx` |

### Problemas

#### 4.1 "Minha Vitrine" salva em partner-level

`ShowcaseSubPage.tsx` chama `updatePartnerAction()` que atualiza a tabela `partners`. Os campos como `store_image_url`, `banner_url`, `gallery`, `order_flow` estão na tabela `partners`.

A `stores` table já tem: `logo_url`, `banner_url`, `gallery`, `whatsapp_phone`.

**Correção:** Migrar vitrine para per-store, salvando em `stores` ao invés de `partners`.

#### 4.2 "Dados do Negócio" salva em partner-level

`BusinessDataSubPage.tsx` atualiza `partners` com phone, address, opening_hours.

A `stores` table já tem: `phone`, `opening_hours`, `city`, `state`, `address_id`.

**Correção:** Migrar dados do negócio para per-store (campos que existem em `stores`).

#### 4.3 Separação Partner vs Store

**Partner-level (GLOBAL):**
- Razão social
- CNPJ/CPF
- Dados fiscais principais
- Owner

**Store-level:**
- Nome fantasia
- Telefone
- Endereço
- Horários
- Logo/Banner/Galeria
- WhatsApp
- Configurações de vitrine

### Arquivos Envolvidos

- `components/erp/settings/ShowcaseSubPage.tsx` — migrar para `store-actions.ts` (updateStoreAction)
- `components/erp/settings/BusinessDataSubPage.tsx` — salvar phone/hours em stores
- `app/actions/erp/stores.ts` — `updateStoreAction` (já existe, mas pode precisar de mais campos)
- `app/actions/erp/partner.ts` — `updatePartnerAction` (manter apenas dados GLOBAL)

---

## 5. Criação de Lojas

### Estado Atual

| Item | Status | Arquivos |
|------|--------|-----------|
| Quick creation (modal) | ✅ Funciona (mas bypass server action) | `components/store-switcher-modal.tsx` |
| Full creation (stores page) | ✅ Funciona | `components/erp/stores/StoresPageContent.tsx` |
| Slug auto-generation | ✅ Existe | `app/actions/erp/stores.ts:201` |
| **UI de slug manual** | **❌ EXISTE (deveria ser só automático)** | `components/erp/stores/StoresPageContent.tsx` |
| **Herança de dados na criação** | **❌ NÃO EXISTE** | — |
| **Trigger de loja inicial** | ✅ Existe | `migrations/03_*.sql` |

### Problemas

#### 5.1 Slug manual na UI

O usuário explicitamente disse: "Slug deve ser derivado automaticamente do nome."

**Correção:** Remover campo de slug manual do formulário de criação. Slug deve ser gerado automaticamente no server action.

#### 5.2 Quick creation bypassa server action

O modal de criação rápida (`store-switcher-modal.tsx`) usa `supabase.from("stores").insert(...)` diretamente. Deveria usar `createStoreAction`.

#### 5.3 Sem herança

Ao criar uma nova loja, não há opção de herdar configurações da loja atual:
- Horários
- Configurações de entrega
- Formas de pagamento
- Produtos/serviços globais
- Categorias financeiras

**Correção:** Adicionar opções de herança no formulário de criação.

### Arquivos Envolvidos

- `components/store-switcher-modal.tsx` — usar server action, remover slug
- `components/erp/stores/StoresPageContent.tsx` — remover slug manual, adicionar herança
- `app/actions/erp/stores.ts` — `createStoreAction` adicionar lógica de herança
- `app/actions/erp/store-products.ts` — batch link após herança
- `app/actions/erp/store-services.ts` — batch link após herança

---

## 6. Regras por Loja (Logística)

### Estado Atual

| Item | Status | Arquivos |
|------|--------|-----------|
| delivery_settings per-store | ✅ store_id nullable | `migrations/f15_add_store_id_to_delivery_settings.sql` |
| delivery_fee_rules | ❌ partner-level (sem store_id) | `migrations/20260427_delivery_fee_system.sql` |
| Business hours per-store | ✅ stores.opening_hours | `migrations/f1_expand_stores.sql` |
| **ERP settings salva hours em partners** | **❌ NÃO per-store** | `BusinessDataSubPage.tsx` |
| **ERP delivery settings** | ✅ Usa storeId do contexto | `DeliverySettingsSubPage.tsx` |
| **Regras de entrega** | ❌ partner-level | — |

### Problemas

#### 6.1 delivery_fee_rules sem store_id

As regras de taxa de entrega (horário noturno, etc.) são partner-level. Deveriam ser per-store para consistência.

**Baixa prioridade** — pode ficar para depois.

#### 6.2 Business hours atualiza partner, não store

Já capturado no item 4.2 — `BusinessDataSubPage.tsx` salva horários em `partners.opening_hours` em vez de `stores.opening_hours`.

### Arquivos Envolvidos

- `components/erp/settings/DeliverySettingsSubPage.tsx` — já usa storeId (✅)
- `components/erp/settings/BusinessDataSubPage.tsx` — migrar hours para stores
- `migrations/` — adicionar `store_id` em `delivery_fee_rules` (baixa prioridade)

---

## 7. Plano de Implementação

### Prioridades

| Prioridade | Fase | Descrição | Esforço |
|-----------|------|-----------|---------|
| 🔴 P1 | 5.1 | Store context + reload ao trocar loja | Pequeno |
| 🔴 P1 | 5.2a | Produto/serviço nasce como exclusive + linkProductToStore aceita scope | Médio |
| 🔴 P1 | 5.2b | Listagem ERP filtra por loja ativa | Médio |
| 🔴 P1 | 5.3a | Convite de usuário com seleção de lojas + cria store_members | Grande |
| 🟡 P2 | 5.3b | UI de gerenciar acessos por loja | Médio |
| 🟡 P2 | 5.4a | Migrar "Minha Vitrine" para per-store | Grande |
| 🟡 P2 | 5.4b | Migrar "Dados do Negócio" para per-store | Grande |
| 🟡 P2 | 5.5a | Slug automático + remover campo manual | Pequeno |
| 🟡 P2 | 5.5b | Herança na criação de loja | Grande |
| 🟢 P3 | 5.6 | delivery_fee_rules per-store | Pequeno |

### Estágios de Implementação

#### F5.1 — Store Context + Reload ✅ (início imediato)

**Arquivos:**
- `lib/store-context.tsx` — adicionar `router.refresh()` no `selectStore()`

#### F5.2a — Produto/Serviço exclusive-by-default

**Arquivos:**
- `lib/store-products.ts` — `linkProductToStore` receber `visibility_scope?: 'all' | 'selected' | 'exclusive'`, default `'exclusive'`
- `lib/store-services.ts` — `linkServiceToStore` receber `visibility_scope`, default `'exclusive'`
- `app/actions/erp/products.ts` — passar `visibility_scope: 'exclusive'` ao criar
- `app/actions/erp/servicos.ts` — passar `visibility_scope: 'exclusive'` ao criar
- `app/actions/erp/store-products.ts` — actions de link aceitar scope
- `app/actions/erp/store-services.ts` — actions de link aceitar scope

#### F5.2b — Listagem ERP filtra por loja

**Arquivos:**
- `app/actions/erp/products.ts` — `getERPProductsPageAction` aceitar `storeId` e filtrar por bridge
- `components/erp/product/ProductsPage.tsx` — passar storeId na query
- `components/erp/servicos/ServicesPage.tsx` — passar storeId na query de serviços

#### F5.2c — UI de visibilidade/overrides (seguir após 5.2a/b)

**Arquivos:**
- `components/erp/product/AddProductPage.tsx` — radio all/selected/exclusive + seletor de lojas + overrides
- `components/erp/product/ProductGeneralTab.tsx` — novos campos
- `components/erp/servicos/AddServicePage.tsx` — radio all/selected/exclusive

#### F5.3a — Convite com lojas

**Arquivos:**
- `components/erp/settings/TeamSubPage.tsx` — adicionar seletor de lojas no modal
- `app/actions/invitations.ts` — aceitar `storeIds`, criar `store_members` após aceitar
- `migrations/` — garantir que `accept_partner_invitation` RPC suporte store_members (ou fazer pós-RPC)

#### F5.3b — UI de gerenciar acessos

**Arquivos:**
- `components/erp/settings/TeamSubPage.tsx` — nova aba "Acessos por loja" com listagem store_members
- `app/actions/erp/store-members.ts` — já existe CRUD

#### F5.4a — Vitrine per-store

**Arquivos:**
- `components/erp/settings/ShowcaseSubPage.tsx` — salvar em `stores` via `updateStoreAction`
- `app/actions/erp/stores.ts` — `updateStoreAction` garantir campos de vitrine

#### F5.4b — Dados do Negócio per-store

**Arquivos:**
- `components/erp/settings/BusinessDataSubPage.tsx` — separar partner-level vs store-level
- Salvar phone, hours, address em `stores`

#### F5.5a — Slug automático

**Arquivos:**
- `components/erp/stores/StoresPageContent.tsx` — remover campo slug do formulário
- `components/store-switcher-modal.tsx` — remover slug, usar server action

#### F5.5b — Herança na criação

**Arquivos:**
- `components/erp/stores/StoresPageContent.tsx` — checkboxes de herança
- `app/actions/erp/stores.ts` — lógica de herança (copiar configs, criar bridges)

#### F5.6 — delivery_fee_rules per-store

**Arquivo:**
- `migrations/` — adicionar `store_id` a `delivery_fee_rules`
- `app/actions/shared/delivery.ts` — suporte a store_id

---

## Resumo de Arquivos por Tipo

### Server Actions (modificar/criar)

| Arquivo | Fases |
|---------|-------|
| `app/actions/erp/products.ts` | 5.2a, 5.2b |
| `app/actions/erp/servicos.ts` | 5.2a |
| `app/actions/erp/store-products.ts` | 5.2a, 5.2c |
| `app/actions/erp/store-services.ts` | 5.2a |
| `app/actions/erp/stores.ts` | 5.4a, 5.5a, 5.5b |
| `app/actions/invitations.ts` | 5.3a |
| `app/actions/erp/store-members.ts` | 5.3b |
| `app/actions/erp/partner.ts` | 5.4b |
| `app/actions/shared/delivery.ts` | 5.6 |

### Library (modificar)

| Arquivo | Fases |
|---------|-------|
| `lib/store-context.tsx` | 5.1 |
| `lib/store-products.ts` | 5.2a |
| `lib/store-services.ts` | 5.2a |
| `lib/store-members.ts` | 5.3a |

### Components (modificar)

| Arquivo | Fases |
|---------|-------|
| `components/store-switcher-modal.tsx` | 5.5a |
| `components/erp/product/AddProductPage.tsx` | 5.2c |
| `components/erp/product/ProductsPage.tsx` | 5.2b |
| `components/erp/product/ProductGeneralTab.tsx` | 5.2c |
| `components/erp/servicos/AddServicePage.tsx` | 5.2c |
| `components/erp/servicos/ServicesPage.tsx` | 5.2b |
| `components/erp/settings/TeamSubPage.tsx` | 5.3a, 5.3b |
| `components/erp/settings/ShowcaseSubPage.tsx` | 5.4a |
| `components/erp/settings/BusinessDataSubPage.tsx` | 5.4b |
| `components/erp/stores/StoresPageContent.tsx` | 5.5a, 5.5b |
| `components/erp/service-form.tsx` | 5.2a |

### Migrations

| Arquivo | Fases |
|---------|-------|
| `migrations/` (adicionar store_id em delivery_fee_rules) | 5.6 |
