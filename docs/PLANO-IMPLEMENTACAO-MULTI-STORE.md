# Plano de Implementação — Multi-Store / Filiais

**Baseado na RFC v2.1**  
**Data:** 16/07/2026  

---

## Sumário

- [Princípios Vinculantes](#princípios-vinculantes)
- [Helpers Compartilhados](#helpers-compartilhados)
- [Checklist Pré-Fase](#checklist-pré-fase)
- [Fase 1 — Fundação](#fase-1--fundação)
- [Fase 2 — Store Context Server-Side](#fase-2--store-context-server-side)
- [Fase 3 — RLS e Permissões](#fase-3--rls-e-permissões)
- [Fase 4 — Store Members](#fase-4--store-members)
- [Fase 5 — Store Products](#fase-5--store-products)
- [Fase 6 — Store Services](#fase-6--store-services)
- [Fase 7 — Estoque](#fase-7--estoque)
- [Fase 8 — Agenda](#fase-8--agenda)
- [Fase 9 — Financeiro](#fase-9--financeiro)
- [Fase 10 — PDV e Caixa](#fase-10--pdv-e-caixa)
- [Fase 11 — Marketplace](#fase-11--marketplace)
- [Fase 12 — WhatsApp](#fase-12--whatsapp)
- [Fase 13 — Promoções e Cupons](#fase-13--promoções-e-cupons)
- [Fase 14 — Service Orders](#fase-14--service-orders)
- [Fase 15 — Configurações por Loja](#fase-15--configurações-por-loja)

---

## Observabilidade

Toda operação crítica deve gerar log estruturado. Padrão único:

```typescript
// lib/observability/audit-log.ts
export function logAudit(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...data,
  }))
}
```

### Eventos obrigatórios por fase

| Fase | Eventos |
|------|---------|
| F2 | `store.switched`, `store.created`, `store.updated`, `store.deleted` |
| F4 | `store_member.added`, `store_member.removed`, `store_member.role_updated` |
| F7 | `stock.movement`, `stock.transfer`, `stock.divergence_detected` |
| F12 | `whatsapp.connection_resolved` |

### O que não logar

Tokens, secrets, CPF, senhas, chaves de API.

---

## Definition of Done (aplicável a cada fase)

Toda fase só é considerada concluída quando atende **todos**:

- [ ] `npm run typecheck` 100% limpo
- [ ] `npm run lint` sem novos erros
- [ ] RLS validada (teste manual ou automatizado por policy)
- [ ] Testes da fase passando (unit + integration)
- [ ] Sem regressão para Partners com 1 loja (caso base)
- [ ] Documentação atualizada (helpers, migrations)
- [ ] Performance review: EXPLAIN ANALYZE nas queries críticas
- [ ] Logs estruturados adicionados para eventos da fase
- [ ] Rollback script testado
- [ ] Migrações idempotentes e reversíveis

---

## Pós-Implementação (após todas as fases)

### Remoção de código legado

| Item | Fase de remoção |
|------|----------------|
| `products.stock_quantity` | 1 ciclo após F7 |
| `partners.store_name` / `store_image_url` | Após F15 |
| `products.store_id` | Após validação |
| Código de compatibilidade | Após cada fase |

### Limpeza

- Remover fallbacks temporários
- Remover jobs de verificação de divergência
- Remover índices não utilizados

---

## Princípios Vinculantes

Estes princípios devem ser seguidos em TODAS as fases:

### 1. Override > Duplicação

Sempre override fields com fallback. Nunca copiar dados.

✅ `store_products.override_price`  
❌ Copiar `products` para outra tabela

### 2. Store_id só quando necessário

Antes de adicionar `store_id` em qualquer tabela, perguntar:

- Esta entidade tem operações independentes por loja?
- O Partner precisa de visão consolidada?
- A Store precisa de autonomia real?

Se for apenas referência ocasional, manter só `partner_id`.

### 3. Autorização sempre server-side

Cookie `active_store_id` é apenas contexto de UI.
Toda autorização usa `auth.uid()` + `partner_users` + `store_members` + RLS.

### 4. Helpers compartilhados

Nunca duplicar lógica de resolução entre Server Actions.
Usar sempre os helpers centralizados (ver seção abaixo).

### 5. Performance medida

Antes de cada fase: EXPLAIN ANALYZE, índices, evitar N+1, cursor pagination.

### 6. Migrações seguras

Idempotentes, reversíveis, zero-downtime, sem alterações destrutivas.

Ciclo: `ADD COLUMN` → popular → utilizar → deprecar → `DROP COLUMN`

### 7. Marketplace ≠ segundo sistema

Marketplace reusa os mesmos serviços, queries e resolvers do ERP.

### 8. Resolução centralizada de integrações

WhatsApp, MP e futuras integrações têm service único de resolução.
Nenhuma feature decide manualmente qual conexão usar.

---

## Helpers Compartilhados

Estes helpers devem ser criados na Fase 3 e reutilizados em todas as fases seguintes.

Nunca duplicar a lógica deles em Server Actions.

| Helper | Local | Descrição |
|--------|-------|-----------|
| `requireStoreAccess(partnerId, storeId)` | `lib/auth/authorization.ts` | Lança erro se usuário não tem acesso à store |
| `requireStorePermission(partnerId, storeId, module, action)` | `lib/auth/authorization.ts` | Verifica permissão + store access |
| `resolveEffectivePermissions(userId, partnerId, storeId)` | `lib/store-members.ts` | Retorna role+permissions efetivas para o par (user, store) |
| `resolveProduct(productRow, storeProductRow)` | `lib/store-products.ts` | Aplica overrides e retorna produto resolvido |
| `resolveService(serviceRow, storeServiceRow)` | `lib/store-services.ts` | Aplica overrides e retorna serviço resolvido |
| `resolveWhatsappConnection(partnerId, storeId)` | `lib/whatsapp/connection-resolver.ts` | Retorna conexão WhatsApp (store-level → partner-level) |

### Obrigação: toda Server Action usa helpers compartilhados

Nenhuma Server Action pode implementar lógica manual de:

- Validação de acesso a Store (usar `requireStoreAccess()`)
- Resolução de preço/estoque (usar `resolveProduct()` / `resolveService()`)
- Resolução de permissão (usar `resolveEffectivePermissions()`)
- Resolução de conexão WhatsApp (usar `resolveWhatsappConnection()`)

```typescript
// ✅ Correto
export async function createProductAction(params: {
  partnerId: string, storeId: string, data: ProductInput
}) {
  await requireStorePermission(params.partnerId, params.storeId, "products", "create")
  const resolved = resolveProduct(productData, storeProductData)
  // ...
}

// ❌ Proibido: lógica de resolução duplicada
export async function createProductAction(partnerId, storeId, data) {
  // NÃO fazer: SELECT * FROM stores WHERE id = storeId (manual)
  // NÃO fazer: COALESCE(price, products.price) (manual)
  // NÃO fazer: verificação manual de partner_users (manual)
}
```

| Helper | Obrigatório em | Fases |
|--------|---------------|-------|
| `requireStoreAccess()` | Toda action que recebe storeId | F3+ |
| `requireStorePermission()` | Toda action com module + action + storeId | F3+ |
| `resolveEffectivePermissions()` | Server actions que resolvem permissão | F4+ |
| `resolveProduct()` | Products, PDV, Orders, Marketplace | F5+ |
| `resolveService()` | Services, Appointments, OS | F6+ |
| `resolveWhatsappConnection()` | Notificações, disparo manual | F12+ |

### Contrato dos Helpers

```typescript
// lib/auth/authorization.ts
async function requireStoreAccess(partnerId: string, storeId: string): Promise<void>
async function requireStorePermission(
  partnerId: string, storeId: string,
  module: string, action: string
): Promise<void>

// lib/store-members.ts
async function resolveEffectivePermissions(
  userId: string,
  partnerId: string,
  storeId: string | null
): Promise<{ role: PartnerRole; permissions: PartnerPermissions }>

// lib/store-products.ts
function resolveProduct(
  product: ProductRow,
  storeProduct: StoreProductRow | null
): ResolvedProduct

// lib/store-services.ts
function resolveService(
  service: ServiceRow,
  storeService: StoreServiceRow | null
): ResolvedService

// lib/whatsapp/connection-resolver.ts
async function resolveWhatsappConnection(
  partnerId: string,
  storeId?: string | null
): Promise<WhatsAppConnection | null>
```

---

## Checklist Pré-Fase

Antes de iniciar CADA fase, executar:

- [ ] Revisar migrations existentes (evitar conflito com fases anteriores)
- [ ] Revisar RLS das tabelas afetadas
- [ ] Revisar permissões no `types.ts` e `partner-roles.ts`
- [ ] Validar impacto em produção (não quebrar clientes existentes)
- [ ] `npm run typecheck` limpo (sem erros)
- [ ] Nenhuma Server Action perdeu proteção de autorização
- [ ] Migrações são idempotentes e reversíveis
- [ ] Queries críticas têm EXPLAIN ANALYZE rodado
- [ ] Índices cobrindo `partner_id` + `store_id` quando aplicável
- [ ] Rollback planejado

---

## Instruções para o desenvolvedor

Cada fase contém:

- **Arquivos a criar**
- **Arquivos a modificar**
- **Migrations**
- **Server Actions afetadas**
- **Componentes afetados**
- **Páginas afetadas**
- **Observabilidade** (logs estruturados a adicionar)
- **Performance review** (EXPLAIN ANALYZE obrigatório)
- **Testes necessários**
- **Riscos específicos**
- **Checklist de deploy**

**Definition of Done** (aplicar ao final de cada fase):

- [ ] `npm run typecheck` limpo
- [ ] `npm run lint` sem novos erros
- [ ] RLS validada (todas as policies novas/alteradas)
- [ ] Testes da fase passando
- [ ] Sem regressão para Partners com 1 loja
- [ ] Logs estruturados implementados
- [ ] EXPLAIN ANALYZE rodado nas queries críticas
- [ ] Rollback script testado
- [ ] Migrações idempotentes

**Ordem obrigatória:** As fases devem ser executadas em ordem sequencial. Nenhuma fase pode pular a anterior.

**Regra de ouro:** Em cada fase, o sistema deve continuar funcionando normalmente para todos os usuários existentes (que têm apenas 1 loja).

---

# Fase 1 — Fundação

**Duração estimada:** 2-3 dias  
**Risco:** Mínimo  
**Dependências:** Nenhuma  

## Objetivo

Expandir a tabela `stores` com as colunas necessárias e criar a Loja Principal para todos os Partners existentes. Corrigir RLS da `stores` para funcionar com team members.

## Migrations

### 1.1 Expandir tabela `stores`

```sql
-- migrations/f1_expand_stores.sql

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS gallery JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_headquarters BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES addresses(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
```

### 1.2 Migrar dados de Partners para Stores

```sql
-- migrations/f1_migrate_partner_data_to_stores.sql

-- Para cada Partner que ainda não tem uma Loja Principal,
-- criar ou atualizar a store existente com os dados do Partner
DO $$
DECLARE
  r RECORD;
  existing_store_id UUID;
  generated_slug TEXT;
BEGIN
  FOR r IN
    SELECT p.id AS partner_id,
           COALESCE(p.store_name, 'Loja Principal') AS store_name,
           p.store_image_url,
           p.city,
           p.state,
           p.opening_hours,
           p.phone
    FROM partners p
    WHERE NOT EXISTS (
      SELECT 1 FROM stores s
      WHERE s.partner_id = p.id AND s.is_headquarters = true
    )
  LOOP
    -- Verificar se já existe alguma store para este partner
    SELECT id INTO existing_store_id
    FROM stores
    WHERE partner_id = r.partner_id
    ORDER BY created_at ASC
    LIMIT 1;

    generated_slug := lower(regexp_replace(
      regexp_replace(
        unaccent(COALESCE(r.store_name, 'loja')),
        '[^a-zA-Z0-9]+', '-', 'g'
      ),
      '^-|-$', '', 'g'
    ));

    -- Garantir unicidade do slug
    IF EXISTS (SELECT 1 FROM stores WHERE slug = generated_slug) THEN
      generated_slug := generated_slug || '-' || substr(r.partner_id::text, 1, 8);
    END IF;

    IF existing_store_id IS NOT NULL THEN
      -- Atualizar store existente
      UPDATE stores SET
        name = COALESCE(NULLIF(r.store_name, ''), stores.name),
        slug = COALESCE(stores.slug, generated_slug),
        description = COALESCE(stores.description, ''),
        phone = COALESCE(stores.phone, r.phone),
        city = COALESCE(stores.city, r.city),
        state = COALESCE(stores.state, r.state),
        opening_hours = CASE WHEN stores.opening_hours IS NULL OR stores.opening_hours = '{}'::jsonb
                          THEN COALESCE(r.opening_hours, '{}'::jsonb)
                          ELSE stores.opening_hours END,
        logo_url = COALESCE(stores.logo_url, r.store_image_url),
        is_headquarters = true,
        updated_at = NOW()
      WHERE id = existing_store_id;
    ELSE
      -- Criar nova store como Loja Principal
      INSERT INTO stores (
        partner_id, name, slug, description, phone,
        city, state, opening_hours, logo_url,
        is_headquarters, is_active
      ) VALUES (
        r.partner_id,
        COALESCE(NULLIF(r.store_name, ''), 'Loja Principal'),
        generated_slug,
        '',
        r.phone,
        r.city,
        r.state,
        COALESCE(r.opening_hours, '{}'::jsonb),
        r.store_image_url,
        true,
        true
      );
    END IF;
  END LOOP;
END $$;
```

### 1.3 Corrigir RLS da tabela `stores`

```sql
-- migrations/f1_fix_stores_rls.sql

-- Drop policies antigas (que só funcionam para owner)
DROP POLICY IF EXISTS "Partners can view their stores" ON stores;
DROP POLICY IF EXISTS "Partners can create stores" ON stores;
DROP POLICY IF EXISTS "Partners can update their stores" ON stores;
DROP POLICY IF EXISTS "Partners can delete their stores" ON stores;

-- Criar novas políticas usando get_user_partner_ids()
CREATE POLICY "stores_select" ON stores
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

CREATE POLICY "stores_insert" ON stores
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

CREATE POLICY "stores_update" ON stores
  FOR UPDATE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

CREATE POLICY "stores_delete" ON stores
  FOR DELETE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );
```

## Arquivos a criar

| Arquivo | Descrição |
|---------|-----------|
| `migrations/f1_expand_stores.sql` | Expandir tabela stores |
| `migrations/f1_migrate_partner_data_to_stores.sql` | Migrar dados |
| `migrations/f1_fix_stores_rls.sql` | Corrigir RLS |

## Arquivos a modificar

| Arquivo | O que fazer |
|---------|-------------|
| `lib/store-context.tsx` | Adicionar campos novos ao type `Store` (slug, description, phone, city, state, opening_hours, logo_url, banner_url, gallery, whatsapp_phone, is_headquarters, is_active) |
| `lib/store-queries.ts` | Atualizar queries para incluir novos campos |

## Nenhuma Server Action precisa ser alterada nesta fase

O comportamento do sistema permanece idêntico. Apenas a estrutura de dados é expandida.

## Testes necessários

1. **Migração:** Verificar se todos os Partners existentes ganharam uma Loja Principal
2. **RLS:** Verificar se team members (não-owners) conseguem acessar stores
3. **RLS:** Verificar se usuários sem acesso não conseguem ver stores
4. **Integridade:** Verificar se stores existentes não foram duplicadas

## Checklist de deploy

- [ ] Rodar migrations em ordem (f1_expand_stores → f1_migrate_partner_data → f1_fix_rls)
- [ ] Verificar no Supabase Studio se todas as stores foram criadas corretamente
- [ ] Testar login de owner → deve ver stores normalmente
- [ ] Testar login de team member (invited) → deve ver stores
- [ ] Testar criação de novo Partner → trigger deve criar Loja Principal com os novos campos

## Rollback

```sql
-- Reverter RLS para o estado anterior (owner-only)
DROP POLICY IF EXISTS "stores_select" ON stores;
DROP POLICY IF EXISTS "stores_insert" ON stores;
DROP POLICY IF EXISTS "stores_update" ON stores;
DROP POLICY IF EXISTS "stores_delete" ON stores;

CREATE POLICY "Partners can view their stores" ON stores
  FOR SELECT USING (partner_id = (SELECT id FROM partners WHERE user_id = auth.uid()));
-- ... (restaurar demais policies)

-- Remover colunas novas (cuidado: pode perder dados)
ALTER TABLE stores DROP COLUMN IF EXISTS slug;
ALTER TABLE stores DROP COLUMN IF EXISTS description;
-- ... (etc)
```

---

# Fase 2 — Store Context Server-Side

**Duração estimada:** 3-5 dias  
**Risco:** Baixo  
**Dependências:** Fase 1 concluída  

## Objetivo

Criar o cookie `active_store_id` no servidor, sincronizar com o `StoreProvider` no cliente, e criar a página de gerenciamento de stores (`/erp/stores`).

## Arquivos a criar

| Arquivo | Descrição |
|---------|-----------|
| `app/erp/stores/page.tsx` | Página de listagem/gerenciamento de stores |
| `app/erp/stores/[id]/page.tsx` | Página de edição de store |
| `app/actions/erp/stores.ts` | Server actions para CRUD de stores |
| `components/erp/stores/StoreForm.tsx` | Formulário de criação/edição de store |
| `components/erp/stores/StoreList.tsx` | Lista de stores |
| `components/erp/stores/StoreCard.tsx` | Card de store na listagem |

## Arquivos a modificar

### `lib/auth/partner-context.ts`

Adicionar funções de cookie para store:

```typescript
const ACTIVE_STORE_COOKIE = "active_store_id"

export async function getActiveStoreId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null
}

export async function setActiveStore(storeId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export async function clearActiveStore(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_STORE_COOKIE)
}
```

### `lib/store-context.tsx`

- Adicionar sincronização com o cookie `active_store_id`
- Ao selecionar store, atualizar cookie via server action
- Adicionar loading state inicial enquanto resolve o cookie

### `app/erp/layout.tsx`

- Resolver store ativa via `getActiveStoreId()` no servidor
- Passar `activeStoreId` para o `StoreProvider`

### `components/store-switcher.tsx`

- Ao trocar de store, chamar `setActiveStore()` via server action
- Exibir badge visual com nome/logo da store ativa

### `components/erp/ERPHeader.tsx`

- Exibir nome da store ativa ao lado do título da página
- Adicionar indicador visual de qual loja está ativa

## Server Actions

### `app/actions/erp/stores.ts`

```typescript
"use server"

export async function createStoreAction(data: CreateStoreInput)
export async function updateStoreAction(id: string, data: UpdateStoreInput)
export async function deleteStoreAction(id: string)
export async function listStoresAction(partnerId: string)
export async function getStoreAction(id: string)
export async function setActiveStoreAction(storeId: string) // atualiza cookie
```

Todas devem verificar:
1. `requireUser()`
2. `checkPermission(partnerId, "stores", "create"|"edit"|"delete"|"view")`
3. `checkStoreAccess(partnerId, storeId)` (quando aplicável)

## Impacto em outras Server Actions

Nenhuma server action operacional (products, orders, etc.) precisa ser alterada ainda. Esta fase é apenas de infraestrutura.

## Testes necessários

1. Cookie `active_store_id` é criado ao trocar de store
2. Cookie é lido corretamente em server components
3. StoreProvider sincroniza com o cookie
4. Página `/erp/stores` lista stores corretamente
5. Criar nova store → aparece na lista
6. Editar store → dados atualizados
7. StoreSwitcher mostra stores corretas e persiste seleção

## Checklist de deploy

- [ ] Cookie funcional em ambiente de produção (httpOnly, secure)
- [ ] StoreSwitcher funcional em mobile e desktop
- [ ] Página `/erp/stores` acessível apenas com permissão `stores.view`
- [ ] Criação de store respeita limite do plano (se implementado)

---

# Fase 3 — RLS e Permissões

**Duração estimada:** 3-5 dias  
**Risco:** Médio  
**Dependências:** Fase 2 concluída  

## Objetivo

Criar função `user_has_store_access()` para RLS, adicionar permissões de store no sistema de roles, e atualizar `checkPermission` para aceitar `storeId`.

## Migrations

### 3.1 Função auxiliar para RLS

```sql
-- migrations/f3_user_has_store_access.sql

CREATE OR REPLACE FUNCTION public.user_has_store_access(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM stores s
    WHERE s.id = p_store_id
    AND s.partner_id IN (SELECT public.get_user_partner_ids())
  );
$$;
```

### 3.2 Atualizar RLS de tabelas com store_id

Para cada tabela que já tem store_id (products, services, orders, customers, etc.), atualizar as policies para incluir verificação de store:

```sql
-- migrations/f3_rls_store_aware.sql
-- Exemplo para products:

DROP POLICY IF EXISTS "products_select_own" ON products;
CREATE POLICY "products_select_own" ON products
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- Repetir para cada policy de cada tabela com store_id.
-- Estratégia: adicionar AND (store_id IS NULL OR user_has_store_access(store_id))
-- a todas as policies existentes que já verificam partner_id.
```

## Arquivos a modificar

### `lib/permissions/types.ts`

Adicionar:

```typescript
export interface StorePermissions {
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
  manage_members: boolean
}

// Dentro de PartnerPermissions:
interface PartnerPermissions {
  // ... existentes ...
  stores: StorePermissions
}
```

### `lib/permissions/partner-roles.ts`

Adicionar presets para `stores`:

```typescript
const storesFull = { view: true, create: true, edit: true, delete: true, manage_members: true }
const storesOperational = { view: true, create: true, edit: true, delete: false, manage_members: true }
const storesViewOnly = { view: true, create: false, edit: false, delete: false, manage_members: false }
const storesNone = { view: false, create: false, edit: false, delete: false, manage_members: false }
```

Atualizar `PERMISSION_PRESETS`:

```typescript
[ROLE_OWNER]: { ..., stores: storesFull },
[ROLE_ADMIN]: { ..., stores: storesOperational },
[ROLE_MANAGER]: { ..., stores: storesViewOnly },
[ROLE_OPERATOR]: { ..., stores: storesNone },
[ROLE_DELIVERY]: { ..., stores: storesNone },
```

### `lib/permissions/route-permissions.ts`

Adicionar ao `ROUTE_MAP`:

```typescript
stores: {
  key: "stores",
  path: "/erp/stores",
  label: "Lojas e Filiais",
  category: "Configurações",
  legacyCategory: undefined,
  specificPermissions: ["manage_members"]
},
stores_members: {
  key: "stores_members",
  path: "/erp/stores/members",
  label: "Membros por Loja",
  category: "Configurações",
},
stores_settings: {
  key: "stores_settings",
  path: "/erp/stores/settings",
  label: "Configurações da Loja",
  category: "Configurações",
}
```

Adicionar ao type `RouteKey`:

```typescript
| "stores" | "stores_members" | "stores_settings"
```

### `lib/permissions/access.ts`

Atualizar `checkPermission` para aceitar `storeId`:

```typescript
export async function checkPermission(
  partnerId: string,
  module: string,
  action: string,
  storeId?: string  // NOVO
): Promise<{ allowed: boolean; error?: string }> {
  // 1. Verificar permissão do módulo (existente)
  // 2. Se storeId fornecido:
  //    a. Verificar se usuário tem acesso à store
  //    b. Verificar se existe StoreMember (Fase 4)
  // 3. Retornar resultado
}
```

### `lib/auth/authorization.ts`

Adicionar:

```typescript
export async function requireStoreAccess(storeId: string, partnerId: string): Promise<void> {
  const { data: store } = await createAdminClient()
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("partner_id", partnerId)
    .single()
  if (!store) throw new Error("Acesso negado a esta loja")
}

export async function requireStorePermission(
  storeId: string,
  partnerId: string,
  module: string,
  action: string
): Promise<void> {
  await requireStoreAccess(storeId, partnerId)
  const { allowed } = await checkPermission(partnerId, module, action, storeId)
  if (!allowed) throw new Error("Permissão negada para esta loja")
}
```

## Testes necessários

1. RLS: Owner vê todas as stores do seu partner
2. RLS: Team member vê apenas stores que tem acesso (após Fase 4)
3. RLS: Usuário sem acesso não vê nenhuma store
4. Permissions: `stores.view` = false → não vê página /erp/stores
5. Permissions: `stores.create` = false → não consegue criar store
6. Função `user_has_store_access()` funciona corretamente
7. `checkPermission` com `storeId` funciona

---

# Fase 4 — Store Members

**Duração estimada:** 5-7 dias  
**Risco:** Médio  
**Dependências:** Fase 3 concluída  

## Objetivo

Criar tabela `store_members`, migrar dados existentes, implementar resolução de permissão com fallback, e atualizar UI de equipe.

## Migrations

```sql
-- migrations/f4_create_store_members.sql

CREATE TABLE store_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id UUID NOT NULL REFERENCES partner_users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role PartnerRole,
  permissions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(partner_user_id, store_id)
);

CREATE INDEX idx_store_members_store_id ON store_members(store_id);
CREATE INDEX idx_store_members_partner_user_id ON store_members(partner_user_id);

ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_members_select" ON store_members
  FOR SELECT USING (
    partner_user_id IN (
      SELECT id FROM partner_users WHERE user_id = auth.uid()
    )
    OR store_id IN (
      SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

CREATE POLICY "store_members_insert" ON store_members
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

CREATE POLICY "store_members_update" ON store_members
  FOR UPDATE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

CREATE POLICY "store_members_delete" ON store_members
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );
```

### Migração de dados

```sql
-- migrations/f4_migrate_partner_users_to_store_members.sql

-- Para cada partner_user que NÃO é OWNER, criar store_member
-- vinculado à Loja Principal
INSERT INTO store_members (partner_user_id, store_id, role, permissions)
SELECT
  pu.id,
  s.id,
  pu.role,
  pu.permissions
FROM partner_users pu
JOIN stores s ON s.partner_id = pu.partner_id AND s.is_headquarters = true
WHERE pu.role != 'OWNER'
  AND NOT EXISTS (
    SELECT 1 FROM store_members sm
    WHERE sm.partner_user_id = pu.id AND sm.store_id = s.id
  );
```

## Arquivos a criar

| Arquivo | Descrição |
|---------|-----------|
| `lib/store-members.ts` | Funções de resolução de permissão por store |
| `app/actions/erp/store-members.ts` | Server actions para CRUD de store_members |

## Arquivos a modificar

### `lib/store-members.ts`

```typescript
// Resolve permissão efetiva para um (partner_user, store)
export async function resolveEffectivePermissions(
  partnerUserId: string,
  storeId: string | null
): Promise<{ role: PartnerRole; permissions: PartnerPermissions }> {
  // 1. Buscar partner_user
  // 2. Se role = OWNER → acesso total, sem verificar store_members
  // 3. Se storeId = null → usar partner_user (contexto global)
  // 4. Se storeId != null:
  //    a. Buscar store_member
  //    b. Se não existir → acesso negado
  //    c. Se existir → usar role/permissions com fallback para partner_user
}

// Verifica se usuário tem acesso a uma store específica
export async function userHasStoreAccess(
  userId: string,
  storeId: string
): Promise<boolean> {
  // 1. Verificar se é OWNER do partner da store
  // 2. Verificar se tem store_member para a store
}
```

### `lib/permissions/access.ts`

Atualizar `checkPermission` para usar `resolveEffectivePermissions`:

```typescript
export async function checkPermission(
  partnerId: string,
  module: string,
  action: string,
  storeId?: string
): Promise<{ allowed: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { allowed: false }

  // Buscar partner_user do usuário para este partner
  const { data: pu } = await createAdminClient()
    .from("partner_users")
    .select("id, role, permissions")
    .eq("partner_id", partnerId)
    .eq("user_id", user.id)
    .single()

  if (!pu) return { allowed: false }

  // Se for OWNER, acesso total
  if (pu.role === "OWNER") return { allowed: true }

  // Se tiver storeId, verificar store_member
  if (storeId) {
    const effective = await resolveEffectivePermissions(pu.id, storeId)
    // ... verificar permissão no effective.permissions
  }

  // Fallback: usar permissions do partner_user
  // ... verificar permissão no pu.permissions
}
```

### `app/erp/settings/team/page.tsx`

Atualizar para permitir:
- Associar membro a lojas específicas
- Definir role/permissions diferentes por loja
- Visualizar membros filtrados por loja

### `components/erp/team/*.tsx`

- Adicionar seletor de lojas no formulário de convite/edição
- Mostrar badge com lojas associadas na listagem

## Testes necessários

1. OWNER tem acesso total a todas as stores (ignora store_members)
2. ADMIN com store_member → permissões do store_member
3. ADMIN sem store_member → acesso negado à store
4. Fallback: store_member com role NULL → usa role do partner_user
5. Fallback: store_member com permissions NULL → usa permissions do partner_user
6. Convidar usuário → criar store_member para loja(s) selecionada(s)
7. Remover store_member → usuário perde acesso à loja

---

# Fase 5 — Store Products

**Duração estimada:** 5-7 dias  
**Risco:** Médio  
**Dependências:** Fase 3 concluída (RLS)  

## Objetivo

Criar tabela `store_products` com override fields, migrar dados existentes, implementar lógica de resolução, e atualizar UI de produtos.

## Migrations

```sql
-- migrations/f5_create_store_products.sql

CREATE TABLE store_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Override fields (NULL = herda de products)
  override_price DECIMAL(12,2),
  override_promotional_price DECIMAL(12,2),
  override_cost_price DECIMAL(12,2),
  override_stock INTEGER,
  override_min_stock INTEGER,
  override_sku TEXT,
  override_location TEXT,
  override_allow_sell_without_stock BOOLEAN,

  -- Controle
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(product_id, store_id)
);

CREATE INDEX idx_store_products_store_id ON store_products(store_id);
CREATE INDEX idx_store_products_product_id ON store_products(product_id);

ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_products_select" ON store_products
  FOR SELECT USING (
    store_id IN (SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids()))
  );

CREATE POLICY "store_products_insert" ON store_products
  FOR INSERT WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids()))
  );

CREATE POLICY "store_products_update" ON store_products
  FOR UPDATE USING (
    store_id IN (SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids()))
  );

CREATE POLICY "store_products_delete" ON store_products
  FOR DELETE USING (
    store_id IN (SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids()))
  );
```

### Migração de dados

```sql
-- migrations/f5_migrate_products_to_store_products.sql

-- Para cada produto ativo, criar store_product vinculado à Loja Principal
INSERT INTO store_products (
  product_id, store_id, is_active,
  override_price, override_promotional_price, override_cost_price,
  override_stock, override_min_stock, override_sku,
  override_location, override_allow_sell_without_stock
)
SELECT
  p.id,
  s.id,
  p.is_active,
  p.price,
  p.promotional_price,
  p.cost_price,
  p.stock_quantity,
  p.min_stock,
  p.sku,
  p.location,
  p.allow_sell_without_stock
FROM products p
JOIN stores s ON s.partner_id = p.partner_id AND s.is_headquarters = true
WHERE p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM store_products sp
    WHERE sp.product_id = p.id AND sp.store_id = s.id
  );
```

## Função de resolução

```typescript
// lib/store-products.ts
export function resolveProduct(sp: StoreProductRow | null, p: ProductRow) {
  return {
    ...p,
    price: sp?.override_price ?? p.price,
    promotional_price: sp?.override_promotional_price ?? p.promotional_price,
    cost_price: sp?.override_cost_price ?? p.cost_price,
    stock_quantity: sp?.override_stock ?? p.stock_quantity,
    min_stock: sp?.override_min_stock ?? p.min_stock,
    sku: sp?.override_sku ?? p.sku,
    location: sp?.override_location ?? p.location,
    allow_sell_without_stock: sp?.override_allow_sell_without_stock ?? p.allow_sell_without_stock,
    store_product_id: sp?.id ?? null,
    store_active: sp?.is_active ?? true,
  }
}
```

## View (opcional, para simplificar queries)

```sql
CREATE OR REPLACE VIEW v_store_products AS
SELECT
  p.id AS product_id,
  p.partner_id,
  sp.store_id,
  p.name, p.description, p.images, p.category, p.subcategory,
  p.gtin, p.ncm, p.cest, p.brand, p.unit,
  p.has_variants, p.product_type, p.condition,
  p.is_active AS product_active,
  COALESCE(sp.override_price, p.price) AS effective_price,
  COALESCE(sp.override_promotional_price, p.promotional_price) AS effective_promotional_price,
  COALESCE(sp.override_cost_price, p.cost_price) AS effective_cost_price,
  COALESCE(sp.override_stock, p.stock_quantity) AS effective_stock,
  COALESCE(sp.override_sku, p.sku) AS effective_sku,
  COALESCE(sp.override_location, p.location) AS effective_location,
  sp.is_active AS store_active,
  sp.override_allow_sell_without_stock,
  sp.sort_order,
  sp.id AS store_product_id
FROM products p
LEFT JOIN store_products sp ON sp.product_id = p.id;
```

## Arquivos a modificar

### Queries de listagem de produtos

Toda query que lista produtos no contexto de uma loja deve usar:

```sql
SELECT * FROM products p
LEFT JOIN store_products sp ON sp.product_id = p.id AND sp.store_id = :storeId
WHERE p.partner_id = :partnerId
  AND p.is_active = true
  AND (sp.is_active IS NULL OR sp.is_active = true)
```

Arquivos que precisam ser alterados:
- `components/erp/product/ProductsPage.tsx` — listagem
- `components/erp/product/AddProductPage.tsx` — criação
- `app/actions/erp/products.ts` — server actions
- `lib/store-queries.ts` — `fetchStoreProducts()`
- `app/erp/products/page.tsx` — página SSR

### Tela de cadastro de produto

Adicionar aba "Disponibilidade por Loja" com:
- Toggle ativo/inativo por loja
- Override de preço
- Override de estoque
- Override de SKU
- Override de localização

### Importação XML

Ao importar produto via XML, criar também `store_products` para a loja ativa.

### Lógica de estoque (escrita única desde o início)

A lógica de baixa de estoque deve usar **apenas** `store_products.override_stock` desde o início.

`products.stock_quantity` é mantido apenas como fallback de leitura (herdado quando override_stock é NULL) e como referência durante a migração.

**Não manter escrita dupla.** A trigger de baixa deve atualizar exclusivamente `store_products`.

```typescript
// lib/stock/reservations.ts
async function decrementStock(productId: string, storeId: string, quantity: number) {
  const sp = await getStoreProduct(productId, storeId)

  if (sp) {
    // Escrever APENAS em store_products
    await supabase.rpc("decrement_store_product_stock", {
      p_store_product_id: sp.id,
      p_quantity: quantity
    })
    return
  }

  // Fallback para produto sem store_product (transição)
  await supabase.rpc("decrement_product_stock", {
      p_product_id: productId,
      p_quantity: quantity
  })
}
```

### Plano de remoção de `products.stock_quantity`

```sql
-- Fase 5 (criação): CREATE TABLE store_products com override_stock
-- Fase 5 (migração): Copiar products.stock_quantity → store_products.override_stock

-- Fase 7 (ativação): Toda escrita de estoque vai para store_products
-- Fase 7 (migração): Popular store_products.override_stock para produtos
--                    que ainda não têm (recém-criados entre fases)

-- Fase 7+ (monitoramento): Job diário verifica divergência:
--   SELECT p.id FROM products p
--   JOIN store_products sp ON sp.product_id = p.id
--   WHERE COALESCE(sp.override_stock, 0) != COALESCE(p.stock_quantity, 0)

-- Fase 7 final: products.stock_quantity marcada como DEPRECATED
--   (manter por 1 ciclo de deploy para rollback)

-- Após estabilização: DROP COLUMN products.stock_quantity
```

## Testes necessários

1. Produto sem store_product → usa dados de products (fallback)
2. Produto com store_product → usa override fields
3. Override_price NULL → usa products.price
4. Override_stock NULL → usa products.stock_quantity
5. Produto criado → store_product criado para Loja Principal
6. Produto importado via XML → store_product criado
7. Listagem de produtos filtra por store corretamente
8. Ao desativar store_product, produto não aparece na loja

---

# Fase 6 — Store Services

**Duração estimada:** 3-5 dias  
**Risco:** Baixo  
**Dependências:** Fase 5 concluída (mesmo padrão dos produtos)  

## Objetivo

Criar tabela `store_services` com override fields e seguir o mesmo padrão dos produtos.

## Migrations

```sql
-- migrations/f6_create_store_services.sql

CREATE TABLE store_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  override_price DECIMAL(12,2),
  override_duration_minutes INTEGER,
  override_buffer_minutes INTEGER,

  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(service_id, store_id)
);

-- RLS (mesmo padrão), índices, migração de dados
-- Segue exatamente o mesmo padrão da Fase 5
```

## Arquivos a modificar

Mesmos padrão da Fase 5, aplicado a services.

---

# Fase 7 — Estoque

**Duração estimada:** 5-7 dias  
**Risco:** Médio-Alto  
**Dependências:** Fase 5 concluída (store_products existe)  

## Objetivo

Migrar toda a lógica de estoque para usar `store_products.override_stock`, atualizar triggers de baixa, e criar suporte a transferência entre lojas.

## Migrations

```sql
-- migrations/f7_stock_migrations.sql

-- 1. Criar função RPC para baixar estoque de store_product
CREATE OR REPLACE FUNCTION decrement_store_product_stock(
  p_store_product_id UUID,
  p_quantity INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE store_products
  SET override_stock = override_stock - p_quantity,
      updated_at = NOW()
  WHERE id = p_store_product_id
    AND (override_stock IS NULL OR override_stock >= p_quantity);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque insuficiente ou produto não encontrado';
  END IF;
END;
$$;

-- 2. Criar função para transferência entre lojas
CREATE OR REPLACE FUNCTION transfer_store_stock(
  p_from_store_product_id UUID,
  p_to_store_product_id UUID,
  p_quantity INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Baixar da origem
  UPDATE store_products
  SET override_stock = override_stock - p_quantity,
      updated_at = NOW()
  WHERE id = p_from_store_product_id
    AND (override_stock >= p_quantity);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque insuficiente na origem';
  END IF;

  -- Adicionar ao destino (criar se não existir)
  INSERT INTO store_products (product_id, store_id, override_stock)
  SELECT sp.product_id, sp2.store_id, p_quantity
  FROM store_products sp
  JOIN store_products sp2 ON sp2.id = p_to_store_product_id
  WHERE sp.id = p_from_store_product_id
  ON CONFLICT (product_id, store_id)
  DO UPDATE SET override_stock = store_products.override_stock + p_quantity;
END;
$$;
```

## Arquivos a modificar

### `lib/stock/reservations.ts`

- Atualizar funções de reserva de estoque para usar `store_products.override_stock`
- Adicionar suporte a transferência entre lojas

### Triggers (migrations)

- Atualizar trigger de baixa automática de estoque no pagamento para usar `store_products`
- Trigger deve ler `store_id` do pedido

### Movimentações de estoque

- `stock_movements` já tem `store_id`
- Adicionar campo `store_product_id` para referência direta
- Tipo `'transfer'` para movimentações entre lojas

### Migração de remoção definitiva

Após 1 ciclo de deploy sem divergências detectadas:

```sql
-- migrations/f7_drop_products_stock_quantity.sql
-- ATENÇÃO: Esta migration SÓ pode ser executada após confirmar
-- que nenhum código em produção lê products.stock_quantity

-- 1. Verificar divergência
DO $$
DECLARE
  divergencias INTEGER;
BEGIN
  SELECT COUNT(*) INTO divergencias FROM products p
  JOIN store_products sp ON sp.product_id = p.id
  WHERE COALESCE(sp.override_stock, 0) != COALESCE(p.stock_quantity, 0);

  IF divergencias > 0 THEN
    RAISE EXCEPTION '% produtos com divergência de estoque. Corrigir antes de remover coluna.', divergencias;
  END IF;
END $$;

-- 2. Remover coluna
ALTER TABLE products DROP COLUMN IF EXISTS stock_quantity;

-- 3. Remover trigger antiga se existir
DROP TRIGGER IF EXISTS trigger_decrement_stock_on_payment ON orders;
```

## Testes necessários

1. Venda de produto → baixa em `store_products.override_stock`
2. Estoque insuficiente → erro (protegido pelo RPC)
3. Transferência entre lojas → origem baixa, destino sobe
4. Estoque mínimo → alerta (já existente, adaptar para store)
5. PDV → usa estoque da loja ativa
6. Job de divergência não reporta falsos positivos
7. `DROP COLUMN` só executa se divergência = 0

---

# Fase 8 — Agenda

**Duração estimada:** 3-5 dias  
**Risco:** Baixo  
**Dependências:** Fase 3 concluída (RLS)  

## Objetivo

Adicionar `store_id` aos agendamentos e filtrar por loja ativa.

## Migrations

```sql
-- migrations/f8_add_store_id_to_appointments.sql

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_store_id ON appointments(store_id);

-- Popular Loja Principal para registros existentes
UPDATE appointments a
SET store_id = (
  SELECT s.id FROM stores s
  WHERE s.partner_id = a.partner_id AND s.is_headquarters = true
  LIMIT 1
)
WHERE a.store_id IS NULL;
```

## Arquivos a modificar

### `app/actions/erp/appointments.ts`

- Adicionar `storeId` aos parâmetros
- Verificar `checkStoreAccess(partnerId, storeId)`
- Incluir `store_id` no INSERT

### `app/erp/agendamentos/page.tsx`

- Passar `storeId` nas queries
- Filtrar agendamentos da loja ativa

### `components/erp/agendamentos/*.tsx`

- Usar `useStore()` para filtro
- Passar `storeId` nas server actions

---

# Fase 9 — Financeiro

**Duração estimada:** 7-10 dias  
**Risco:** Alto  
**Dependências:** Fase 3 concluída (RLS)  

## Validação de store_id - Princípio P2

Antes de adicionar `store_id` a cada tabela, validar individualmente:

| Tabela | Store necessária? | Justificativa |
|--------|:-----------------:|---------------|
| `transactions` | **SIM** | Movimentação financeira operacional pertence a uma loja (ex: venda no PDV da Filial Centro) |
| `recurring_transactions` | **SIM** | Despesa/receita recorrente pode ser de uma loja específica |
| `accounts_payable` | **SIM** | Conta a pagar (aluguel, fornecedor) pode ser por loja |
| `accounts_receivable` | **SIM** | Recebível de venda é da loja que originou |
| `finance_accounts` | **NÃO** | Plano de contas é configurado pelo Partner (consolidado). Store não tem autonomia para criar contas contábeis |
| `quotes` | **SIM** | Orçamento é emitido por uma loja específica |
| `quote_items` | **SIM** | Vinculado a quote |

`finance_accounts` **não recebe `store_id`**. Plano de contas é global do Partner.

## Objetivo

Adicionar `store_id` apenas nas tabelas que realmente precisam.

## Migrations

```sql
-- migrations/f9_add_store_id_to_financial_tables.sql

-- transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_store_id ON transactions(store_id);

-- recurring_transactions
ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_store_id ON recurring_transactions(store_id);

-- accounts_payable
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_payable_store_id ON accounts_payable(store_id);

-- accounts_receivable
ALTER TABLE accounts_receivable ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_store_id ON accounts_receivable(store_id);

-- ❌ finance_accounts NÃO recebe store_id (plano de contas é global do Partner)

-- quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_store_id ON quotes(store_id);

-- quote_items
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quote_items_store_id ON quote_items(store_id);
```

### Migração de dados

```sql
-- migrations/f9_migrate_financial_data.sql
-- Para cada tabela, popular store_id com a Loja Principal
-- (mesmo padrão da Fase 8)
```

## Arquivos a modificar

Server actions e páginas financeiras:
- `app/actions/erp/transactions.ts`
- `app/actions/erp/contas-pagar.ts`
- `app/actions/erp/contas-receber.ts`
- `app/actions/erp/quotes.ts`
- `app/erp/transactions/page.tsx`
- `app/erp/contas-a-pagar/page.tsx`
- `app/erp/contas-a-receber/page.tsx`
- `app/erp/quotes/page.tsx`
- `app/erp/reports/page.tsx`

## Atenção especial

Tabelas financeiras são críticas. Qualquer erro pode causar inconsistência contábil.

**Recomendação:**
- Fazer backup do banco antes de rodar migrations
- Testar em staging primeiro
- Validar exports/relatórios antes e depois
- Ter script de rollback ready

---

# Fase 10 — PDV e Caixa

**Duração estimada:** 5-7 dias  
**Risco:** Médio  
**Dependências:** Fase 9 concluída (store_id em transactions)  

## Objetivo

Adicionar `store_id` a sales e sale_items, escopar caixa por loja.

## Migrations

```sql
-- migrations/f10_add_store_id_to_sales.sql

ALTER TABLE sales ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sale_items_store_id ON sale_items(store_id);
```

## Arquivos a modificar

- `app/actions/erp/pdv.ts`
- `app/erp/pdv/page.tsx`
- `components/erp/pdv/*.tsx`
- `app/erp/cash-register/page.tsx`
- `components/erp/cash-register/*.tsx`

---

# Fase 11 — Marketplace

**Duração estimada:** 5-7 dias  
**Risco:** Médio  
**Dependências:** Fase 5 (store_products), Fase 6 (store_services)  

## Princípio fundamental — P7

Marketplace **não é um segundo sistema**. Deve reutilizar os mesmos serviços, queries e resolvers do ERP.

Nada de criar queries paralelas ou lógica duplicada.

As páginas públicas do Marketplace devem chamar os mesmos helpers que o ERP usa:

| O quê | Helper ERP | Uso no Marketplace |
|-------|-----------|-------------------|
| Listar produtos da loja | `resolveProduct()` + `store_products` query | Mesma query, sem modificação |
| Listar serviços da loja | `resolveService()` + `store_services` query | Mesma query, sem modificação |
| Dados da store | `getStoreAction()` | Mesma action, sem modificação |
| Avaliações | `reviews` query (já tem `store_id`) | Mesma query, sem modificação |

## Objetivo

Cada Store com página pública própria, slug único, aparecendo individualmente no Marketplace. Reutilizando toda a lógica do ERP.

## Arquivos a criar

| Arquivo | Descrição |
|---------|-----------|
| `app/[cidadeUf]/[store-slug]/page.tsx` | Página pública da Store (usa helpers do ERP) |
| `app/[cidadeUf]/[store-slug]/produto/[id]/page.tsx` | Detalhe do produto na Store |
| `app/[cidadeUf]/[store-slug]/cardapio/page.tsx` | Cardápio/menu |

**Não criar** API paralela de busca de stores. Reutilizar `app/api/explorar/` existente, adicionando filtro por `store_id`.

## Arquivos a modificar

### `app/explorar/page.tsx`

- Incluir stores nos resultados de busca
- Filtrar por store quando especificado
- Reutilizar mesma query de produtos (com `store_id` filter)

### `lib/redis-sync.ts`

- Sincronizar stores como entidades independentes
- Sincronizar store_products e store_services
- Usar mesmos resolvers do ERP para popular Redis

### `lib/search/*.ts`

- Indexar stores para busca textual (slug, nome, descrição, cidade)

### Página de vitrine atual

`app/vitrine/[slug]/page.tsx` — redirecionar para `/[cidadeUf]/[store-slug]`

## URLs

```
/[cidadeUf]/loja-dudit-centro        → Página da Store
/[cidadeUf]/loja-dudit-shopping      → Página da Store
/explorar?cidade=cambe-pr            → Busca com stores
```

---

# Fase 12 — WhatsApp

**Duração estimada:** 5-7 dias  
**Risco:** Médio  
**Dependências:** Fase 3 concluída (RLS)  

## Objetivo

Mover conexão WhatsApp para Store, com fallback para Partner.

## Migrations

```sql
-- migrations/f12_add_store_id_to_whatsapp.sql

ALTER TABLE partner_whatsapp_connections
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_store_id
  ON partner_whatsapp_connections(store_id);

-- Adicionar constraint: store_id deve pertencer ao mesmo partner
-- (validado na aplicação, não no banco, para evitar foreign key circular)
```

## Princípio fundamental — P8

Resolução de WhatsApp deve ser **centralizada em um único service**.

Nenhuma feature decide manualmente qual conexão usar.

Toda feature que precisa enviar WhatsApp chama o service de resolução.

## Service Centralizado

### `lib/whatsapp/connection-resolver.ts` (NOVO)

```typescript
// ÚNICO ponto de resolução de conexão WhatsApp
// Nenhuma outra parte do sistema deve resolver conexão manualmente.

export async function resolveWhatsappConnection(
  partnerId: string,
  storeId?: string | null
): Promise<{ connection: WhatsAppConnectionRow | null; provider: WhatsappProvider | null }>
{
  // 1. Se storeId fornecido, buscar conexão da store
  if (storeId) {
    const { data } = await supabase
      .from("partner_whatsapp_connections")
      .select("*")
      .eq("store_id", storeId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (data) return { connection: data, provider: await createProvider(data) }
  }

  // 2. Fallback: conexão global do Partner (store_id IS NULL)
  const { data } = await supabase
    .from("partner_whatsapp_connections")
    .select("*")
    .eq("partner_id", partnerId)
    .is("store_id", null)
    .maybeSingle()
  if (data) return { connection: data, provider: await createProvider(data) }

  return { connection: null, provider: null }
}
```

## Arquivos a modificar

### `lib/whatsapp/providers/index.ts`

- Remover lógica de resolução (agora em `connection-resolver.ts`)
- `createWhatsappProviderFromConnection()` passa a receber `connection` já resolvida

### `lib/services/whatsapp-dispatch.service.ts`

- Usar `resolveWhatsappConnection(partnerId, event.storeId)` para obter provider
- Remover lógica manual de escolha de conexão

### Qualquer outro arquivo que resolva conexão WhatsApp

- Substituir lógica manual por chamada a `resolveWhatsappConnection()`

### Configuração de WhatsApp

UI deve permitir:
- Associar conexão a uma Store específica
- Ver conexão global (sem store)
- Desconectar por store

---

# Fase 13 — Promoções e Cupons

**Duração estimada:** 3-5 dias  
**Risco:** Baixo  
**Dependências:** Fase 3 concluída (RLS)  

## Objetivo

Criar tabelas `promotion_stores` e `coupon_stores`.

## Migrations

```sql
-- migrations/f13_create_promotion_stores.sql

CREATE TABLE promotion_stores (
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (promotion_id, store_id)
);

ALTER TABLE promotion_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promotion_stores_select" ON promotion_stores
  FOR SELECT USING (
    store_id IN (SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids()))
  );

-- (INSERT, UPDATE, DELETE policies - mesmo padrão)

-- coupon_stores (mesma estrutura)
CREATE TABLE coupon_stores (
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (coupon_id, store_id)
);
```

## Arquivos a modificar

- `app/actions/marketing/promotions.ts` — incluir store_ids
- `app/actions/marketing/coupons.ts` — incluir store_ids
- `app/erp/marketing/promotions/page.tsx` — seletor de lojas
- `app/erp/marketing/coupons/page.tsx` — seletor de lojas

Regra: se `promotion_stores` vazia, promoção vale para todas as lojas.

---

# Fase 14 — Service Orders

**Duração estimada:** 2-3 dias  
**Risco:** Baixo  
**Dependências:** Fase 3 concluída (RLS)  

## Objetivo

Adicionar `store_id` às ordens de serviço.

## Migrations

```sql
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
```

---

# Fase 15 — Configurações por Loja

**Duração estimada:** 5-7 dias  
**Risco:** Alto  
**Dependências:** Todas as fases anteriores  

## Objetivo

Permitir que cada Store tenha suas próprias configurações, com herança do Partner.

## Abordagem

1. Settings page exibe abas: "Geral (Partner)" e "Por Loja: [nome]"
2. Campos que podem ser configurados por loja:
   - opening_hours
   - phone
   - address
   - WhatsApp instance
   - payment_methods (já tem store_id)
3. Herança: se Store não tem valor, usa o do Partner
4. Integrações: WhatsApp e MP configuráveis por loja (MP permanece global)

---

## Resumo do Cronograma

```
Fase 1  (2-3d)  ████░░░░░░░░░░░░░░░░   Fundação
Fase 2  (3-5d)  ██████░░░░░░░░░░░░░░   Store Context
Fase 3  (3-5d)  ██████░░░░░░░░░░░░░░   RLS e Permissões
Fase 4  (5-7d)  ██████████░░░░░░░░░░   Store Members
Fase 5  (5-7d)  ██████████░░░░░░░░░░   Store Products
Fase 6  (3-5d)  ██████░░░░░░░░░░░░░░   Store Services
Fase 7  (5-7d)  ██████████░░░░░░░░░░   Estoque
Fase 8  (3-5d)  ██████░░░░░░░░░░░░░░   Agenda
Fase 9  (7-10d) ██████████████░░░░░░   Financeiro
Fase 10 (5-7d)  ██████████░░░░░░░░░░   PDV/Caixa
Fase 11 (5-7d)  ██████████░░░░░░░░░░   Marketplace
Fase 12 (5-7d)  ██████████░░░░░░░░░░   WhatsApp
Fase 13 (3-5d)  ██████░░░░░░░░░░░░░░   Promoções/Cupons
Fase 14 (2-3d)  ████░░░░░░░░░░░░░░░░   Service Orders
Fase 15 (5-7d)  ██████████░░░░░░░░░░   Config por Loja
                ────────────────────
Total: ~58-95 dias úteis (~3-5 meses)
```

## Próximo passo

Após revisão e aprovação deste plano, iniciar **Fase 1 — Fundação**.
