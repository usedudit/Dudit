# RFC — Suporte a Multi-Lojas / Filiais

**Status:** Aprovado para planejamento  
**Autor:** Auditoria arquitetural automatizada  
**Data:** 16/07/2026  
**Versão:** 2.1  

---

## Princípios Arquiteturais (vinculantes)

### P1. Override > Duplicação

Sempre que possível, usar override fields com fallback automático.  
Nunca duplicar dados de uma entidade pai para a filha.  
`store_products.override_price` → sim. Copiar `products` para outra tabela → não.

### P2. Store_id só quando necessário

Antes de adicionar `store_id` a qualquer tabela, validar:

- Esta entidade possui operações independentes por loja?
- O Partner precisa de visão consolidada?
- A Store precisa de autonomia sobre esta entidade?

Se a entidade é do Partner e apenas referência uma Store ocasionalmente, manter apenas `partner_id`.

### P3. Autorização sempre server-side

- Cookie `active_store_id` é apenas contexto de UI
- Autorização sempre baseada em `auth.uid()` + `partner_users` + `store_members` + RLS
- Cookie nunca é confiável para decisões de segurança
- Toda server action valida acesso duplo: Partner + Store

### P4. Helpers compartilhados, não duplicados

Toda lógica de resolução de Store deve estar em helpers centralizados:

- `resolveEffectivePermissions()`
- `resolveProduct()` / `resolveService()`
- `requireStorePermission()` / `requireStoreAccess()`
- `resolveWhatsappConnection()`

Server Actions chamam helpers. Nunca implementam lógica de resolução própria.

### P5. Performance medida, não assumida

Antes de cada fase:

- Revisar planos de query (EXPLAIN ANALYZE)
- Garantir índices cobrindo partner_id + store_id
- Preferir cursor pagination a offset
- Evitar N+1 (usar batch queries)
- Filtrar no servidor, nunca no cliente

### P6. Migrações seguras

Toda migration deve ser:

- **Idempotente** (`IF NOT EXISTS`, `IF EXISTS`)
- **Reversível** (rollback script incluso)
- **Zero-downtime** (expand → migrar → utilizar → remover)
- **Sem alterações destrutivas** em produção

Ciclo: `ADD COLUMN` → popular dados → utilizar coluna nova → deprecar → `DROP COLUMN`

### P7. Marketplace não é um segundo sistema

Marketplace e ERP compartilham os mesmos:

- Serviços e resolvers
- Queries de banco
- Regras de negócio
- Helpers de resolução

Nada de criar queries paralelas ou lógica duplicada para o Marketplace.

### P8. Resolução centralizada de integrações

WhatsApp, Mercado Pago, e futuras integrações devem ter resolução centralizada.

Nenhuma feature decide manualmente qual conexão usar.
Sempre passar pelo service de resolução.

### P9. Observabilidade

Toda operação crítica deve gerar log estruturado:

- Troca de loja ativa
- Criação/edição/exclusão de Store
- Alterações em Store Members (adicionar, remover, modificar role/permissions)
- Movimentações de estoque (entrada, saída, transferência)
- Transferências entre lojas
- Resolução de permissões (store_members resolvidos com sucesso ou negação)
- Falhas de RLS ou autorização

Formato dos logs:

```typescript
console.log(JSON.stringify({
  event: "store.switched",
  userId: "...",
  partnerId: "...",
  fromStoreId: "...",
  toStoreId: "...",
  timestamp: new Date().toISOString(),
}))
```

Nunca logar secrets, tokens ou dados pessoais.

### P10. Definition of Done

Toda fase só é considerada concluída quando atender **todos** os critérios:

- [ ] `npm run typecheck` 100% limpo
- [ ] `npm run lint` sem novos erros (zero warnings adicionais)
- [ ] RLS validada (teste manual ou automatizado para cada policy nova/alterada)
- [ ] Testes da fase passando (unit + integration)
- [ ] Sem regressão para Partners com apenas 1 loja (caso base)
- [ ] Documentação atualizada (comentários em helpers, migrations documentadas)
- [ ] Performance review: EXPLAIN ANALYZE nas queries críticas
- [ ] Logs estruturados adicionados para operações críticas da fase
- [ ] Rollback script testado

---

## Sumário

1. [Hierarquia e Modelo Conceitual](#1-hierarquia-e-modelo-conceitual)
2. [Arquitetura Atual × Arquitetura Proposta](#2-arquitetura-atual--arquitetura-proposta)
3. [Modelo de Dados Detalhado](#3-modelo-de-dados-detalhado)
4. [Tabelas que usam apenas `partner_id`](#4-tabelas-que-usam-apenas-partner_id)
5. [Tabelas que devem continuar apenas Partner](#5-tabelas-que-devem-continuar-apenas-partner)
6. [Tabelas que devem migrar para `partner_id + store_id`](#6-tabelas-que-devem-migrar-para-partner_id--store_id)
7. [Tabelas que devem usar apenas Store](#7-tabelas-que-devem-usar-apenas-store)
8. [Produtos — Override Fields](#8-produtos--override-fields)
9. [Serviços — Override Fields](#9-serviços--override-fields)
10. [Equipe — PartnerUser → StoreMember](#10-equipe--partneruser--storemember)
11. [Promoções e Cupons — Tabelas de Relacionamento](#11-promoções-e-cupons--tabelas-de-relacionamento)
12. [Marketplace — Página Pública por Store](#12-marketplace--página-pública-por-store)
13. [WhatsApp — Movido para Store](#13-whatsapp--movido-para-store)
14. [Mercado Pago — Compartilhado (Partner)](#14-mercado-pago--compartilhado-partner)
15. [Impactos nas RLS](#15-impactos-nas-rls)
16. [Impactos no Realtime](#16-impactos-no-realtime)
17. [Impactos no Cache](#17-impactos-no-cache)
18. [Impactos no Billing](#18-impactos-no-billing)
19. [Impactos nos Webhooks](#19-impactos-nos-webhooks)
20. [Observabilidade](#20-observabilidade)
21. [Impactos nas Server Actions](#21-impactos-nas-server-actions)
22. [Impactos nas Páginas do ERP](#22-impactos-nas-páginas-do-erp)
23. [Impactos nas Permissões](#23-impactos-nas-permissões)
24. [URLs da Vitrine e Marketplace](#24-urls-da-vitrine-e-marketplace)
25. [Riscos e Vantagens](#25-riscos-e-vantagens)
26. [Estado atual no código](#26-estado-atual-da-implementação-no-código)
27. [Ordem de Implementação](#27-ordem-de-implementação-revisada)
28. [Esforço Estimado](#28-esforço-estimado)
29. [Pós-Implementação](#29-pós-implementação)

---

## 1. Hierarquia e Modelo Conceitual

```
Partner (Empresa / Pessoa Jurídica)
│
│  Responsável por:
│  ├── assinatura e billing
│  ├── plano contratado e limites
│  ├── dados fiscais (CNPJ, IE, IM, CRT)
│  ├── integrações sistêmicas (Mercado Pago, Nuvem Fiscal)
│  ├── marketplace global (avaliação consolidada)
│  ├── políticas e regras de moderação
│  ├── recursos contratados (módulos do sistema)
│  └── PartnerUsers (vínculo global de usuários)
│
└── Stores (entidades operacionais)
     │
     │  Toda store pertence exatamente a 1 Partner.
     │  Um Partner pode ter N Stores.
     │
     ├── Loja Matriz (criada automaticamente na migração)
     ├── Filial Centro
     ├── Filial Shopping
     └── ...
         │
         │  Responsável por:
         │  ├── identidade visual (logo, banner, galeria)
         │  ├── endereço, telefone, WhatsApp
         │  ├── horários de funcionamento
         │  ├── estoque (via store_products.override*)
         │  ├── agenda e agendamentos
         │  ├── financeiro operacional
         │  ├── caixa / PDV
         │  ├── equipe (via store_members)
         │  ├── pedidos
         │  ├── OS
         │  ├── retirada e entrega
         │  ├── página pública no Marketplace (slug próprio)
         │  └── conexão WhatsApp própria
```

### Regra fundamental

> **Toda Store pertence exatamente a um Partner. Um Partner pode ter N Stores. Permissões, faturamento e limites de plano são sempre controlados pelo Partner.**

Isso mantém a hierarquia clara e evita duplicar lógica de assinatura ou cobrança.

---

## 2. Arquitetura Atual × Arquitetura Proposta

### Atual

```
Partner (Empresa)
  ├── user_id (dono)
  ├── store_name, store_description, store_image_url
  ├── opening_hours
  ├── address, phone
  ├── Mercado Pago tokens
  ├── WhatsApp connection
  ├── assinatura
  └── tudo mais
```

O Partner acumula **identidade jurídica + identidade operacional + identidade visual + WhatsApp + MP**. Não há distinção entre empresa e loja.

### Proposta

```
Partner (Empresa)
  ├── dados fiscais (CNPJ, IE, IM, CRT, contribuinte)
  ├── assinatura (plan, subscription, usage_counters, billing_events)
  ├── Mercado Pago (access_token compartilhado)
  ├── marketplace global (avaliação consolidada)
  ├── políticas e regras
  ├── recursos contratados
  ├── PartnerUsers (vínculo global)
  │
  └── Stores (filiais)
       ├── slug próprio (único)
       ├── página pública no Marketplace
       ├── estoque, preço, SKU (via store_products)
       ├── agenda, PDV, caixa, financeiro operacional
       ├── equipe (via store_members)
       ├── identidade visual (logo, banner, galeria)
       ├── horários, endereço, telefone
       ├── WhatsApp próprio (whatsapp_instance)
       └── promoções e cupons (via tabelas N:N)
```

### Comparação detalhada

| Aspecto | Atual | Proposto |
|---------|-------|----------|
| Entidade principal | Partner (acumula tudo) | Partner (jurídico) + Store (operacional) |
| Dono do produto | Partner | Product (partner_id) + StoreProduct (store_id) |
| Dono do estoque | Partner | StoreProduct (override_stock) |
| Dono do pedido | Partner | Order (partner_id + store_id) |
| Dono do cliente | Partner | Customer (partner_id + store_id) |
| Time/equipe | PartnerUser (global) | PartnerUser (global) + StoreMember (por loja) |
| Marketplace | 1 perfil por Partner | 1 perfil por Store (slug próprio) |
| Logo/banner | partners.store_image_url | stores.logo_url, stores.banner_url |
| WhatsApp | partner_whatsapp_connections (partner_id) | partner_whatsapp_connections (store_id) |
| Mercado Pago | partner_id (tokens) | partner_id (compartilhado, sem store_id) |
| Assinatura | Partner | Partner (inalterado) |
| Promoções | partner_id | partner_id + promotion_stores (N:N) |
| Cupons | partner_id | partner_id + coupon_stores (N:N) |

---

## 3. Modelo de Dados Detalhado

### 3.1 Store (expansão da tabela existente)

```sql
-- Tabela já existe (migrations/01_create_stores_table.sql)
-- Adicionar colunas:

ALTER TABLE stores ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS opening_hours JSONB;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS gallery JSONB;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_headquarters BOOLEAN DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES addresses(id);

-- Slug único (ex: "loja-dudit-centro")
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
```

**Schema final da tabela `stores`:**

| Coluna | Tipo | Origem |
|--------|------|--------|
| `id` | UUID PK | Existente |
| `partner_id` | UUID NOT NULL → partners(id) | Existente |
| `name` | TEXT NOT NULL | Existente |
| `slug` | TEXT UNIQUE | **NOVO** |
| `description` | TEXT | **NOVO** |
| `phone` | TEXT | **NOVO** (mover de partners) |
| `city` | TEXT | **NOVO** |
| `state` | TEXT | **NOVO** |
| `opening_hours` | JSONB | **NOVO** (mover de partners) |
| `banner_url` | TEXT | **NOVO** |
| `logo_url` | TEXT | **NOVO** (substitui image_url) |
| `gallery` | JSONB | **NOVO** |
| `whatsapp_phone` | TEXT | **NOVO** |
| `is_headquarters` | BOOLEAN DEFAULT false | **NOVO** |
| `is_active` | BOOLEAN DEFAULT true | **NOVO** |
| `address_id` | UUID → addresses(id) | **NOVO** |
| `image_url` | TEXT | Existente (deprecate) |
| `crt` | TEXT DEFAULT '1' | Existente |
| `contribuinte` | TEXT DEFAULT '9' | Existente |
| `inscricao_estadual` | TEXT | Existente |
| `ie_isento` | BOOLEAN DEFAULT false | Existente |
| `inscricao_municipal` | TEXT | Existente |
| `created_at` | TIMESTAMPTZ | Existente |
| `updated_at` | TIMESTAMPTZ | Existente |

### 3.2 Store Products (bridge com override fields)

```sql
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
```

**Regra de resolução de preço/estoque:**

```
preço efetivo = COALESCE(sp.override_price, p.price)
preço promocional = COALESCE(sp.override_promotional_price, p.promotional_price)
preço de custo = COALESCE(sp.override_cost_price, p.cost_price)
estoque = COALESCE(sp.override_stock, p.stock_quantity)
SKU = COALESCE(sp.override_sku, p.sku)
localização = COALESCE(sp.override_location, p.location)
mínimo = COALESCE(sp.override_min_stock, p.min_stock)
```

### 3.3 Store Services (bridge com override fields)

```sql
CREATE TABLE store_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Override fields (NULL = herda de services)
  override_price DECIMAL(12,2),
  override_duration_minutes INTEGER,
  override_buffer_minutes INTEGER,

  -- Controle
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(service_id, store_id)
);
```

### 3.4 Store Members

```sql
CREATE TABLE store_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id UUID NOT NULL REFERENCES partner_users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role PartnerRole,                          -- opcional: herda de partner_users se NULL
  permissions JSONB,                          -- opcional: permissões específicas da loja
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(partner_user_id, store_id)
);

CREATE INDEX idx_store_members_store_id ON store_members(store_id);
CREATE INDEX idx_store_members_partner_user_id ON store_members(partner_user_id);
```

**Regras de permissão:**

1. Se `role = OWNER` no `partner_users`: acesso total a todas as stores (ignora store_members)
2. Se não existe `store_members` para o par (partner_user, store): acesso negado à store
3. Se existe `store_members`: usar role/permissions do store_members
4. Se `store_members.role IS NULL`: herdar role de `partner_users`
5. Se `store_members.permissions IS NULL`: herdar permissions de `partner_users`

### 3.5 Promotion Stores (relacionamento N:N)

```sql
CREATE TABLE promotion_stores (
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (promotion_id, store_id)
);
```

- Se `promotion_stores` estiver vazia para uma promoção: promoção vale para **todas** as stores do Partner.
- Se tiver registros: vale apenas para as stores listadas.

### 3.6 Coupon Stores (relacionamento N:N)

```sql
CREATE TABLE coupon_stores (
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (coupon_id, store_id)
);
```

Mesma regra: vazio = todas as stores; preenchido = stores específicas.

### 3.7 WhatsApp Connection (movido para Store)

```sql
-- Atualizar tabela partner_whatsapp_connections:
-- Se existir partner_id, manter. Adicionar store_id.
ALTER TABLE partner_whatsapp_connections ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- Regra:
-- store_id NOT NULL → conexão pertence a uma Store específica
-- store_id IS NULL → conexão global do Partner (fallback / retrocompatibilidade)
```

---

## 4. Tabelas que usam apenas `partner_id`

Com base na análise de todas as migrações e do schema atual:

| Tabela | Já tem `store_id`? | Observação |
|--------|-------------------|------------|
| `products` | SIM | Adicionado na migração 02 |
| `services` | SIM | Adicionado na migração 02 |
| `customers` | SIM | Adicionado na migração 02 |
| `orders` | SIM | Adicionado na migração 02 |
| `suppliers` | SIM | Adicionado na migração 02 |
| `stock_movements` | SIM | Adicionado na migração 02 |
| `cart_items` | SIM | Adicionado na migração 02 |
| `payment_methods` | SIM | Adicionado na migração 02 |
| `reviews` | SIM | Adicionado na migração 02 |
| `product_kits` | SIM | Adicionado na migração 02 |
| `addresses` | SIM | Suporte polimórfico p/ store_id |
| `partner_users` | **NÃO** | Escopo global do Partner |
| `partner_invitations` | **NÃO** | Escopo global |
| `plans` | **NÃO** | Global do sistema |
| `subscriptions` | **NÃO** | Pertence ao Partner |
| `usage_counters` | **NÃO** | Pertence ao Partner |
| `billing_events` | **NÃO** | Pertence ao Partner |
| `appointments` | **NÃO** | **PRECISA ADICIONAR** |
| `quotes` | **NÃO** | **PRECISA ADICIONAR** |
| `quote_items` | **NÃO** | Via quotes |
| `sales` (PDV) | **NÃO** | **PRECISA ADICIONAR** |
| `sale_items` | **NÃO** | Via sales |
| `transactions` | **NÃO** | **PRECISA ADICIONAR** |
| `recurring_transactions` | **NÃO** | **PRECISA ADICIONAR** |
| `accounts_payable` | **NÃO** | **PRECISA ADICIONAR** |
| `accounts_receivable` | **NÃO** | **PRECISA ADICIONAR** |
| `financial_categories` | NÃO | Pode ser global ou por loja |
| `finance_accounts` | NÃO | **PRECISA ADICIONAR** |
| `product_variants` | NÃO | Via products |
| `product_suppliers` | NÃO | Via products |
| `product_fiscal_profiles` | NÃO | Global do Partner |
| `product_logistics` | NÃO | Via products |
| `notification_scheduled_jobs` | NÃO | **PRECISA ADICIONAR** |
| `audit_logs` | NÃO | Já tem partner_id |
| `service_orders` | NÃO | **PRECISA ADICIONAR** |
| `promotions` | NÃO | Via promotion_stores |
| `coupons` | NÃO | Via coupon_stores |
| `partner_whatsapp_connections` | NÃO | **PRECISA ADICIONAR** store_id |

---

## 5. Tabelas que devem continuar apenas Partner

**Escopo exclusivo do Partner (sem `store_id`):**

| Tabela | Motivo |
|--------|--------|
| `subscriptions` | Assinatura pertence à empresa |
| `plans` | Catálogo global de planos |
| `usage_counters` | Contagem consolidada do Partner |
| `billing_events` | Eventos de faturamento do Partner |
| `partners` | A própria entidade Partner |
| `partner_users` | Vínculo do usuário com o Partner |
| `partner_invitations` | Convite para o Partner |
| `product_fiscal_profiles` | Configuração fiscal é da empresa |
| `product_logistics` | Dimensões/peso do produto, não da filial |
| `audit_logs` | Log de auditoria consolidado |
| `mercadopago_tokens` | Conta MP é do Partner (compartilhada) |

---

## 6. Tabelas que devem migrar para `partner_id + store_id`

**Já têm `store_id`** (migração 02 já aplicou):

| Tabela | Ação necessária |
|--------|----------------|
| `products` | Manter `store_id` + popular via `store_products` |
| `services` | Manter `store_id` + popular via `store_services` |
| `orders` | Garantir que todo pedido tenha `store_id` (via trigger) |
| `customers` | Garantir que todo cliente tenha `store_id` |
| `suppliers` | Garantir que todo fornecedor tenha `store_id` |
| `stock_movements` | Evoluir lógica para usar `store_products.override_stock` |
| `cart_items` | Garantir store_id |
| `payment_methods` | Cada filial pode ter métodos próprios |
| `reviews` | Já tem, está correto |
| `product_kits` | Garantir store_id |
| `addresses` | Já tem suporte, está correto |

**Precisam ADICIONAR `store_id`:**

| Tabela | Prioridade | Motivo |
|--------|-----------|--------|
| `appointments` | **ALTA** | Agendamento é por filial |
| `quotes` / `quote_items` | **ALTA** | Orçamento é por filial |
| `sales` (PDV) | **ALTA** | PDV é operacional por filial |
| `sale_items` | **ALTA** | Vinculado a sales |
| `transactions` | **ALTA** | Financeiro operacional |
| `recurring_transactions` | **ALTA** | Financeiro operacional |
| `accounts_payable` | **ALTA** | Contas por filial |
| `accounts_receivable` | **ALTA** | Contas por filial |
| `finance_accounts` | **MÉDIA** | Contas financeiras por filial |
| `service_orders` | **ALTA** | OS operacional por filial |
| `notification_scheduled_jobs` | **MÉDIA** | Notificações por filial |
| `partner_whatsapp_connections` | **MÉDIA** | WhatsApp por filial |

---

## 7. Tabelas que devem usar apenas Store

| Tabela | Observação |
|--------|-----------|
| `store_products` | Bridge Product ↔ Store |
| `store_services` | Bridge Service ↔ Store |
| `store_members` | Bridge PartnerUser ↔ Store |
| `promotion_stores` | Relacionamento N:N Promoção ↔ Store |
| `coupon_stores` | Relacionamento N:N Cupom ↔ Store |

**Nota:** Manter `partner_id` nas tabelas principais (orders, customers, etc.) é benéfico para performance de consultas e RLS, mesmo que `store_id` já resolva o partner via JOIN. **Padrão: manter ambos.**

---

## 8. Produtos — Override Fields

### Modelo

```
Product (cadastro único do Partner)
  ├── name, description, images, category, fiscal data
  ├── price, promotional_price, cost_price
  ├── stock_quantity, min_stock
  ├── sku, location, gtin, ncm
  └── is_active
        │
        ▼
StoreProduct (por filial)
  ├── override_price          │ NULL → usa products.price
  ├── override_promotional_price │ NULL → usa products.promotional_price
  ├── override_cost_price     │ NULL → usa products.cost_price
  ├── override_stock          │ NULL → usa products.stock_quantity
  ├── override_min_stock      │ NULL → usa products.min_stock
  ├── override_sku            │ NULL → usa products.sku
  ├── override_location       │ NULL → usa products.location
  ├── override_allow_sell_without_stock │ NULL → usa products.allow_sell_without_stock
  └── is_active               │ independente do products.is_active
```

### Query de resolução

```sql
SELECT
  p.id, p.name, p.description, p.images,
  COALESCE(sp.override_price, p.price) AS effective_price,
  COALESCE(sp.override_promotional_price, p.promotional_price) AS effective_promotional_price,
  COALESCE(sp.override_cost_price, p.cost_price) AS effective_cost_price,
  COALESCE(sp.override_stock, p.stock_quantity) AS effective_stock,
  COALESCE(sp.override_sku, p.sku) AS effective_sku,
  COALESCE(sp.override_location, p.location) AS effective_location,
  COALESCE(sp.override_allow_sell_without_stock, p.allow_sell_without_stock) AS effective_allow_sell_without_stock,
  sp.is_active AS store_active
FROM products p
LEFT JOIN store_products sp ON sp.product_id = p.id AND sp.store_id = :storeId
WHERE p.partner_id = :partnerId
  AND p.is_active = true
  AND (sp.is_active IS NULL OR sp.is_active = true)
```

### Comportamento na UI

- **Listagem de produtos (visão da loja):** Mostra `effective_price`, `effective_stock`
- **Edição de produto:** Aba "Por Loja" com campos de override para cada filial
- **Importação XML:** Produto vai para `products` + `store_products` da loja ativa
- **Criação de produto:** Cria em `products` + opcionalmente `store_products`

---

## 9. Serviços — Override Fields

### Modelo

```
Service → StoreService

StoreService:
  override_price           │ NULL → usa services.price
  override_duration_minutes │ NULL → usa services.duration_minutes
  override_buffer_minutes  │ NULL → usa services.buffer_minutes
  is_active                │ independente
```

---

## 10. Equipe — PartnerUser → StoreMember

### Modelo de acesso

```
PartnerUser (vínculo com o Partner)
  ├── user_id
  ├── role (global: OWNER, ADMIN, MANAGER, etc.)
  ├── permissions (global)
  │
  └── StoreMember (vínculo com a loja) [0..N]
        ├── store_id
        ├── role (opcional: herda de partner_user se NULL)
        └── permissions (opcional: herda de partner_user se NULL)
```

### Regras de autorização

```
1. Usuário é OWNER do Partner?
   └── ✅ Acesso total a TODAS as stores

2. Usuário não é OWNER?
   ├── Existe StoreMember para a store atual?
   │   ├── Sim → usar role/permissions do StoreMember
   │   │          (com fallback para partner_user se NULL)
   │   └── Não → ❌ Acesso negado a esta store
   │
   └── Se store_id = NULL (contexto global do Partner)?
       └── Usar role/permissions do PartnerUser (compatibilidade)
```

### Comportamento na migração

- Na Fase 5, para cada `partner_user` existente, criar `store_member` vinculado à **Loja Principal**
- Para OWNERs: não criar `store_member` (acesso implícito a todas)
- Na UI de equipe: permitir associar membro a lojas específicas com role/permissions independentes

---

## 11. Promoções e Cupons — Tabelas de Relacionamento

### Promoções

```sql
-- promotions permanece com partner_id (escopo do Partner)
-- Relacionamento N:N com stores:

CREATE TABLE promotion_stores (
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (promotion_id, store_id)
);

-- Regra:
--   promotion_stores vazio → promoção vale para TODAS as stores do Partner
--   promotion_stores preenchido → vale apenas para as stores listadas
```

### Cupons

```sql
CREATE TABLE coupon_stores (
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (coupon_id, store_id)
);

-- Mesma regra das promoções
```

### Validação

```sql
-- Verificar se promoção é válida para uma store:
CREATE OR REPLACE FUNCTION is_promotion_valid_for_store(p_promotion_id UUID, p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM promotion_stores ps
    WHERE ps.promotion_id = p_promotion_id
    AND ps.store_id != p_store_id
  ) OR EXISTS (
    SELECT 1 FROM promotion_stores ps
    WHERE ps.promotion_id = p_promotion_id
    AND ps.store_id = p_store_id
  );
$$;
```

---

## 12. Marketplace — Página Pública por Store

### Modelo (iFood-like)

Cada Store possui:
- Página pública própria com slug único
- Logo, banner, galeria
- Telefone, endereço, horários
- Avaliações (`reviews` já tem `store_id`)
- Produtos (via `store_products`)
- Promoções e cupons da store

### URLs

```
https://dudit.com.br/cambe-pr/loja-dudit-centro
https://dudit.com.br/cambe-pr/loja-dudit-shopping
https://dudit.com.br/cambe-pr/loja-dudit-norte
```

Formato: `/[cidadeUf]/[store-slug]`

Onde `store-slug` é único globalmente (ou por cidade).

### Descoberta/Marketplace

- Stores aparecem **individualmente** nas buscas
- Cada store tem sua própria ficha no Redis
- O ranking considera avaliação da store, não do partner
- Filtros por store na exploração

### Estrutura de páginas

```
/[cidadeUf]/[store-slug]          → Página pública da Store (vitrine)
/[cidadeUf]/[store-slug]/produto/[id] → Detalhe do produto na Store
/[cidadeUf]/[store-slug]/cardapio → Cardápio/menu

/explorar?cidade=cambe-pr&store=loja-dudit-centro → Busca com filtro de store
```

---

## 13. WhatsApp — Movido para Store

### Modelo

```sql
ALTER TABLE partner_whatsapp_connections
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- Regra:
-- store_id NOT NULL → conexão pertence a uma Store específica
-- store_id IS NULL  → conexão global (retrocompatibilidade / Partner-level)

-- Store-level tem prioridade sobre Partner-level.
-- Se uma store tem conexão própria, usa essa.
-- Se não tem, usa a conexão global do Partner (se existir).
```

### Resolução de conexão

```typescript
async function resolveWhatsappConnection(partnerId: string, storeId: string | null) {
  if (storeId) {
    // Tenta conexão específica da store
    const { data } = await supabase
      .from("partner_whatsapp_connections")
      .select("*")
      .eq("store_id", storeId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (data) return data
  }
  // Fallback: conexão global do Partner
  const { data } = await supabase
    .from("partner_whatsapp_connections")
    .select("*")
    .eq("partner_id", partnerId)
    .is("store_id", null)
    .maybeSingle()
  return data
}
```

### Impacto no Evolution Provider

- `createWhatsappProviderFromConnection()` precisa receber `storeId` para resolver a conexão correta
- Envio de notificações (pedido criado, agendamento) deve usar WhatsApp da Store de origem
- A UX de configuração deve permitir associar conexão a uma Store específica

---

## 14. Mercado Pago — Compartilhado (Partner)

### Decisão

> **Manter uma única conta Mercado Pago por Partner. Todas as Stores compartilham a mesma conta para recebimentos.**

- Tokens MP permanecem em `partner_id` (sem `store_id`)
- Pedidos têm `store_id` para rastreabilidade, mas `mp_payment_id` é vinculado ao Partner
- Webhooks de pagamento continuam processando normalmente
- A arquitetura **permite** evoluir para contas por Store no futuro (adicionando `store_id` nos tokens), mas não será implementado nesta fase

### O que NÃO muda

- `lib/mercadopago/token-manager.ts` — permanece em escopo de Partner
- `app/api/mercadopago/` — endpoints permanecem em escopo de Partner
- `lib/payments/` — processamento permanece em escopo de Partner
- `lib/billing/gateways/mercado-pago.ts` — permanece em escopo de Partner

### O que precisa ser adaptado

- Associar `store_id` ao pedido no momento de criar a preferência MP (para rastreabilidade)
- O webhook deve propagar `store_id` para notificações e atualizações de estoque

---

## 15. Impactos nas RLS

### Problema atual

A RLS da tabela `stores` usa:

```sql
partner_id = (SELECT id FROM partners WHERE user_id = auth.uid())
```

Isso só funciona para o **dono**. Membros da equipe não conseguem acessar.

### Solução

```sql
-- NOVA RLS (usa get_user_partner_ids, já existente da migração 970)
CREATE POLICY "stores_select" ON stores FOR SELECT USING (
  partner_id IN (SELECT public.get_user_partner_ids())
);

CREATE POLICY "stores_insert" ON stores FOR INSERT WITH CHECK (
  partner_id IN (SELECT public.get_user_partner_ids())
);

CREATE POLICY "stores_update" ON stores FOR UPDATE USING (
  partner_id IN (SELECT public.get_user_partner_ids())
);

CREATE POLICY "stores_delete" ON stores FOR DELETE USING (
  partner_id IN (SELECT public.get_user_partner_ids())
);
```

### RLS para novas tabelas

```sql
-- store_products
CREATE POLICY "store_products_select" ON store_products FOR SELECT USING (
  store_id IN (SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids()))
);

-- store_services (mesmo padrão)
-- store_members (mesmo padrão)

-- promotion_stores
CREATE POLICY "promotion_stores_select" ON promotion_stores FOR SELECT USING (
  store_id IN (SELECT id FROM stores WHERE partner_id IN (SELECT public.get_user_partner_ids()))
);

-- coupon_stores (mesmo padrão)
```

### Função auxiliar (evita repetição)

```sql
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

---

## 16. Impactos no Realtime

### Supabase Realtime

- Subscrições no cliente devem aceitar filtro por `store_id` (`eq("store_id", storeId)`)
- O `StoreProvider` gerencia a store ativa; queries de realtime usam esse valor
- Broadcast de eventos deve incluir `store_id` no payload
- Quando usuário troca de store via `StoreSwitcher`, as subscrições devem ser reiniciadas

### Firebase Cloud Messaging (Push)

- Notificações incluem `store_id` no payload
- Target: Partner inteiro (managers/owners) x Store específica (operadores)

### Trigger.dev

- Jobs de notificação incluem `store_id`
- Jobs de WhatsApp resolvem conexão por `store_id`

---

## 17. Impactos no Cache

### Redis (Upstash)

- Chaves de cache incluem `store_id` quando escopo for de loja
- Padrão: `{entidade}:{partnerId}:{storeId}`
- Invalidação (`lib/cache/invalidation.ts`) aceita `storeId`

### Redis Sync (Marketplace)

- `lib/redis-sync.ts` sincroniza:
  - Stores como entidades buscáveis (cada store individualmente)
  - StoreProducts como itens de catálogo por store
  - StoreServices como serviços por store
- Estrutura no Redis:
  - `store:{storeId}` — perfil completo da store
  - `store:{storeId}:products` — produtos da store
  - `store:{storeId}:services` — serviços da store

### Next.js Revalidation

- Tags de revalidação incluem `store_id`
- Ex: `revalidateTag(\`store_${storeId}_products\`)`
- Webhook do Supabase propaga `store_id`

---

## 18. Impactos no Billing

### O que NÃO muda

- Assinatura pertence ao Partner (`subscriptions.partner_id`)
- Planos são do Partner
- `usage_counters` consolidados por Partner
- `billing_events` por Partner

### O que ADICIONAR

- **Contador de Stores no plano:** cada plano tem um limite de stores permitidas
  - Plano Free: 1 store
  - Plano Vendedor: 1 store
  - Plano Crescer: 3 stores
  - Plano Profissional: ilimitado
- Validação ao criar store: `COUNT(stores) < plan.max_stores`

### O que NÃO fazer agora

- Faturamento por store
- Planos diferentes por store
- Cobrança adicional por store extra

---

## 19. Impactos nos Webhooks

### Supabase Webhooks

Endpoint: `app/api/webhooks/supabase/route.ts`

- Escutar também: `stores`, `store_products`, `store_services`, `store_members`
- Payload inclui `store_id`
- Debounced revalidation existente cobre novos recursos

### Mercado Pago Webhooks

Endpoint: `app/api/mercadopago/webhook/route.ts`

- Pedidos já têm `store_id` para rastreabilidade
- Webhook processa normalmente (MP vinculado ao Partner)
- Ao atualizar estoque, usar `store_products.override_stock` da store correta

### Webhooks de Notificação (usuário)

- Payload inclui `store_id`
- Configuração permite filtrar por store (ex: notificar só para loja Centro)

---

## 20. Observabilidade

### Eventos que devem gerar log estruturado

| Evento | Dados | Onde implementar |
|--------|-------|-----------------|
| Troca de loja ativa | userId, partnerId, fromStoreId, toStoreId | `setActiveStoreAction()` |
| Criação de Store | userId, partnerId, storeId, storeName | `createStoreAction()` |
| Edição de Store | userId, partnerId, storeId, campos alterados | `updateStoreAction()` |
| Exclusão de Store | userId, partnerId, storeId | `deleteStoreAction()` |
| Store Member adicionado | userId, partnerId, storeId, targetUserId, role | `addStoreMemberAction()` |
| Store Member removido | userId, partnerId, storeId, targetUserId | `removeStoreMemberAction()` |
| Store Member role alterado | userId, partnerId, storeId, targetUserId, oldRole, newRole | `updateStoreMemberRoleAction()` |
| Movimentação de estoque | userId, partnerId, storeId, productId, quantity, type | `decrementStock()` / `transferStoreStock()` |
| Transferência entre lojas | userId, partnerId, fromStoreId, toStoreId, productId, quantity | `transferStoreStock()` |
| Resolução de permissão | userId, partnerId, storeId, module, action, result (allowed/denied) | `checkPermission()` / `resolveEffectivePermissions()` |
| Falha de RLS/autorização | userId, partnerId, storeId, reason | `requireStoreAccess()` / `requireStorePermission()` |

### Padrão de log

```typescript
// lib/observability/audit-log.ts
export function logAudit(event: string, data: Record<string, unknown>): void {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    requestId: /* de header X-Request-Id ou gerado */,
    ...data,
  }
  console.log(JSON.stringify(payload))

  // Opcional: persistir em audit_logs para consulta futura
  if (shouldPersist(event)) {
    persistAuditLog(payload)
  }
}
```

### O que NÃO logar

- Tokens de acesso (MP, WhatsApp, Supabase)
- Senhas ou hashes
- Dados pessoais (CPF, email completo em logs de erro)
- Chaves de API

### Monitoramento

- Logs estruturados permitem criar alertas no observability provider (CloudWatch, DataDog, etc.)
- Eventos de falha de autorização devem gerar alerta se excederem threshold (possível ataque)
- Transferências entre lojas com valor alto devem ser auditáveis

---

## 21. Impactos nas Server Actions

### Obrigação: usar helpers compartilhados

Toda Server Action criada ou modificada DEVE usar os helpers centralizados:

```typescript
// ✅ Correto: usa helpers compartilhados
export async function createProductAction(params: {
  partnerId: string, storeId: string, data: ProductInput
}) {
  await requireStorePermission(params.partnerId, params.storeId, "products", "create")
  const resolved = resolveProduct(productData, storeProductData)
}

// ❌ Proibido: lógica de resolução duplicada
export async function createProductAction(partnerId, storeId, data) {
  // NÃO fazer SELECT * FROM stores WHERE id = storeId
  // NÃO fazer COALESCE manual de preço
  // NÃO fazer verificação manual de store_members
}
```

### Padrão atual

```typescript
export async function createProductAction(partnerId: string, data: ProductInput) {
  await checkPermission(partnerId, "products", "create")
  // ...
}
```

### Padrão proposto

```typescript
export async function createProductAction(params: {
  partnerId: string
  storeId: string
  data: ProductInput
}) {
  await checkPermission(params.partnerId, "products", "create")
  await checkStoreAccess(params.partnerId, params.storeId)
  // ...
}
```

### Funções auxiliares

```typescript
// Verifica acesso à store (via partner)
async function checkStoreAccess(partnerId: string, storeId: string): Promise<void> {
  const { data: store } = await db
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("partner_id", partnerId)
    .single()
  if (!store) throw new StoreAccessDeniedError()
}

// Converte store_id para partner_id (seguro)
async function resolvePartnerFromStore(storeId: string): Promise<string> {
  const { data } = await db
    .from("stores")
    .select("partner_id")
    .eq("id", storeId)
    .single()
  if (!data) throw new StoreNotFoundError()
  return data.partner_id
}
```

### Store Context server-side

```typescript
// Cookie-based store resolution (server component)
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
```

---

## 22. Impactos nas Páginas do ERP

### Páginas que PRECISAM de contexto de Store

| Página | Store necessária? | Status atual |
|--------|------------------|-------------|
| `/erp/inicio` | Sim | Já usa `activeStore?.storeName` |
| `/erp/dashboard` | Sim | Precisa filtrar métricas por store |
| `/erp/orders` | Sim | Já filtra por `selectedStore?.id` |
| `/erp/products` | Sim | Já filtra por `selectedStore?.id` |
| `/erp/stock-movements` | Sim | Já filtra por `selectedStore?.id` |
| `/erp/servicos` | Sim | Já filtra por `selectedStore?.id` |
| `/erp/agendamentos` | Sim | **PRECISA ADICIONAR** store_id |
| `/erp/pdv` | Sim | **PRECISA ADICIONAR** store_id |
| `/erp/customers` | Sim | Já prioriza por `selectedStore?.id` |
| `/erp/quotes` | Sim | **PRECISA ADICIONAR** store_id |
| `/erp/transactions` | Sim | **PRECISA ADICIONAR** store_id |
| `/erp/cash-register` | Sim | Caixa é por loja |
| `/erp/settings/team` | Sim | Equipe por loja (StoreMember) |
| `/erp/service-orders` | Sim | **PRECISA ADICIONAR** store_id |
| `/erp/marketing/promotions` | Sim | store_ids via promotion_stores |
| `/erp/marketing/coupons` | Sim | store_ids via coupon_stores |

### Páginas que NÃO precisam de contexto de Store

| Página | Motivo |
|--------|--------|
| `/erp/settings` (business) | Config globais do Partner |
| `/erp/integrations` | Integrações globais (MP, etc.) |
| `/erp/settings/subscription` | Assinatura do Partner |

### Store Switcher (melhorias)

- **Server-side:** Cookie `active_store_id` lido em server components
- **Badge visual:** Indicador de loja ativa no header
- **Store Management:** Nova página `/erp/stores` para criar/editar/gerenciar lojas

---

## 23. Impactos nas Permissões

### Novos campos em PartnerPermissions

```typescript
interface PartnerPermissions {
  // ... existentes (orders, products, services, customers, etc.) ...

  stores: {                              // NOVO
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
    manage_members: boolean
  }
}
```

### Novas RouteKeys

```typescript
type RouteKey =
  // ... existentes ...
  | "stores"           // Gerenciamento de lojas (/erp/stores)
  | "stores_members"   // Membros por loja
  | "stores_settings"  // Configurações por loja
```

### Role Presets para stores

| Permission | OWNER | ADMIN | MANAGER | OPERATOR | DELIVERY |
|---|---|---|---|---|---|
| `stores.view` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `stores.create` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `stores.edit` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `stores.delete` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `stores.manage_members` | ✅ | ✅ | ✅ (apenas abaixo) | ❌ | ❌ |

### Hierarquia de resolução de permissão

```
┌─ Usuário é OWNER do Partner?
│   └── ✅ Acesso total a todas as stores
│
└─ Usuário NÃO é OWNER?
    │
    ├─ Existe StoreMember para (partner_user, store)?
    │   │
    │   ├─ SIM → usar role + permissions do StoreMember
    │   │         (com fallback para PartnerUser se NULL no StoreMember)
    │   │
    │   └─ NÃO → ❌ Acesso negado à store
    │
    └─ Contexto global (store_id = NULL)?
        └── Usar role + permissions do PartnerUser (compatibilidade)
```

---

## 24. URLs da Vitrine e Marketplace

### URLs públicas

```
/explorar                              → Marketplace geral
/explorar?cidade=cambe-pr              → Marketplace filtrado por cidade
/explorar?categoria=alimentacao        → Marketplace filtrado por categoria

/[cidadeUf]/loja-dudit-centro          → Página pública da Store
/[cidadeUf]/loja-dudit-shopping        → Página pública da Store
/[cidadeUf]/loja-dudit-norte/produto/abc → Produto na Store

/vitrine/[store-slug]                  → Aliás para /[cidadeUf]/[store-slug]
```

### Geração de slug

```typescript
function generateStoreSlug(name: string, partnerId: string): string {
  // Normaliza: loja dudit centro → loja-dudit-centro
  const base = name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  // Garante unicidade (pode concatenar sufixo se conflitar)
  return base
}
```

### SEO

- Cada Store tem `<head>` próprio com meta tags (nome, descrição, logo)
- Sitemap inclui stores individuais
- Open Graph tags por store

---

## 25. Riscos e Vantagens

### Vantagens

| # | Vantagem | Impacto |
|---|----------|---------|
| 1 | **Produtos não duplicados** — override fields evitam réplica | Reduz erros fiscais |
| 2 | **Estoque independente** — cada filial controla seu estoque | Essencial para operação real |
| 3 | **Identidade visual própria** — cada filial com sua marca | Importante para grupos |
| 4 | **Marketplace iFood-like** — cada store aparece individualmente | Mais descoberta |
| 5 | **Equipe segregada** — funcionários com acesso específico | Segurança |
| 6 | **WhatsApp por filial** — cada loja com número próprio | Operação real |
| 7 | **Migração incremental** — sem Big Bang | Baixo risco |
| 8 | **Override fields** — fallback automático reduz duplicação | Dados limpos |
| 9 | **Promoções/cupons normalizados** — tabelas N:N sem arrays | Escalabilidade |
| 10 | **Hierarquia clara** — Partner controla billing/permissões | Sem duplicação de lógica |

### Riscos

| # | Risco | Mitigação |
|---|-------|-----------|
| 1 | **Performance** — queries com `partner_id + store_id` podem ser mais lentas | Índices compostos, consultas otimizadas |
| 2 | **Complexidade de RLS** — policies mais complexas | Função `user_has_store_access` centralizada |
| 3 | **Server Actions** — cada action valida store | Função `checkStoreAccess` centralizada |
| 4 | **Cache mais complexo** — mais chaves de cache | Padronizar nomenclatura de tags |
| 5 | **Migração de dados** — popular registros existentes | Fases incrementais com defaults |
| 6 | **Permissões duplicadas** — PartnerUser + StoreMember | Herança clara (fallback) |
| 7 | **Adoção gradual** — clientes existentes podem estranhar | Loja Principal automática e transparente |
| 8 | **Override fields** — lógica de resolução pode confundir | Views ou funções auxiliares |

---

## 26. Estado atual da implementação no código

### ✅ Já existe

| Componente | Arquivo |
|-----------|---------|
| Tabela `stores` (11 colunas) | `migrations/01_create_stores_table.sql`, `migrations/210_add_fiscal_fields_to_stores.sql` |
| `store_id` em 10 tabelas | `migrations/02_add_store_id_to_tables.sql` |
| Trigger create store on partner insert | `migrations/03_create_initial_store_for_partners.sql` |
| `StoreProvider` (React context) | `lib/store-context.tsx` |
| `useStore()` hook | `lib/store-context.tsx` |
| `StoreSwitcher` (seletor de loja) | `components/store-switcher.tsx` |
| `NewStoreModal` (criar loja) | `components/store-switcher-modal.tsx` |
| Store-scoped queries (products, orders, customers, etc.) | `lib/store-queries.ts` |
| `StoreIcon` e referências no sidebar | `components/erp/ERPSidebar.tsx` |
| Addresses com suporte a `store_id` | `migrations/047_consolidate_addresses.sql` |
| `checkPermission` com partner_id | `lib/permissions/access.ts` |

### ❌ Precisa ser criado/adaptado

| Componente | Prioridade |
|-----------|-----------|
| Expansão da tabela `stores` (slug, logo, banner, etc.) | 🔴 Fase 1 |
| RLS corrigida para `get_user_partner_ids()` | 🔴 Fase 1 |
| `store_products` + override fields | 🔴 Fase 3 |
| `store_services` + override fields | 🔴 Fase 3 |
| `store_members` | 🔴 Fase 4 |
| `promotion_stores` | 🟡 Fase 8 |
| `coupon_stores` | 🟡 Fase 8 |
| `store_id` em appointments, quotes, sales, transactions, etc. | 🔴 Fase 5/6 |
| `store_id` em `partner_whatsapp_connections` | 🔴 Fase 9 |
| Server-side store context (cookie) | 🔴 Fase 2 |
| `PartnerPermissions.stores` + RouteKeys | 🔴 Fase 4 |
| Página de gerenciamento de stores (`/erp/stores`) | 🔴 Fase 2 |
| Marketplace per-store (`/[cidadeUf]/[store-slug]`) | 🟡 Fase 8 |
| Redis sync para stores | 🟡 Fase 8 |
| Migração de dados (partners → stores) | 🔴 Fase 1 |

---

## 27. Ordem de Implementação (revisada)

Cada fase é independente, deployável separadamente, sem quebrar o sistema existente.

```
FASE 0 ──── Análise e Preparação
  ├── Revisar este RFC com o time
  ├── Ajustar modelo se necessário
  └── Setup de ambiente de desenvolvimento

FASE 1 ──── Fundação (sem quebra)
  ├── Expandir tabela stores (slug, description, phone, city, etc.)
  ├── Corrigir RLS da stores para usar get_user_partner_ids()
  ├── Remover campo store_name/image_url da partners (migrar para stores)
  │   (manter como alias/virtual para retrocompatibilidade)
  ├── Migração única: criar "Loja Principal" para partners existentes
  │   • Copiar partners.store_name → stores.name
  │   • Copiar partners.store_image_url → stores.logo_url
  │   • Copiar partners.opening_hours → stores.opening_hours
  │   • Marcar como is_headquarters = true
  └── Nada muda para o usuário
  ⏱ 2-3 dias | ⚠️ Risco: mínimo

FASE 2 ──── Store Context (server-side)
  ├── Criar cookie active_store_id (server-side)
  ├── Adicionar getActiveStoreId() / setActiveStore() no partner-context
  ├── StoreProvider: sincronizar com cookie
  ├── StoreSwitcher: atualizar cookie ao trocar de loja
  ├── ERP Layout: resolver store ativa em server component
  ├── StoreSwitcher badge: mostrar store ativa no header
  ├── Página /erp/stores (listar, criar, editar stores)
  └── Permitir criar filiais (além da Loja Principal)
  ⏱ 3-5 dias | ⚠️ Risco: baixo

FASE 3 ──── RLS e Permissões
  ├── Função user_has_store_access(p_store_id)
  ├── Aplicar RLS em todas as tabelas com store_id
  ├── Adicionar stores, stores_members, stores_settings em RouteKeys
  ├── Adicionar stores em PartnerPermissions
  ├── Atualizar role presets (OWNER, ADMIN, MANAGER, OPERATOR, DELIVERY)
  ├── Atualizar checkPermission para aceitar storeId
  └── Atualizar route-permissions.ts
  ⏱ 3-5 dias | ⚠️ Risco: médio

FASE 4 ──── Store Members
  ├── Criar tabela store_members
  ├── Migração única: criar store_member para cada partner_user
  │   (vinculado à Loja Principal / ou pular se for OWNER)
  ├── Implementar resolução de permissão (StoreMember → fallback PartnerUser)
  ├── Atualizar tela /erp/settings/team:
  │   • Associar membro a lojas específicas
  │   • Role/permissions independentes por loja
  ├── Atualizar server actions para verificar store_members
  └── Validação: OWNER sempre tem acesso total (ignora store_members)
  ⏱ 5-7 dias | ⚠️ Risco: médio

FASE 5 ──── Store Products
  ├── Criar tabela store_products (com override fields)
  ├── Migração única:
  │   • Para cada product existente, criar store_product
  │     vinculado à Loja Principal
  │   • override_stock = products.stock_quantity
  │   • override_price = products.price
  ├── Lógica de resolução: COALESCE(override, product.original)
  ├── Atualizar query de produtos (listagem, busca) para usar store_products
  ├── Atualizar tela de cadastro de produto:
  │   • Aba "Por Loja" com campos de override
  │   • Permitir ativar/desativar produto por loja
  ├── Atualizar importação XML para criar store_products
  ├── Atualizar PDV para usar store_products
  └── Remover referências diretas a products.stock_quantity no escopo de loja
  ⏱ 5-7 dias | ⚠️ Risco: médio

FASE 6 ──── Store Services
  ├── Criar tabela store_services (com override fields)
  ├── Migração única: criar store_service para cada service existente
  ├── Lógica de resolução (mesmo padrão dos produtos)
  ├── Atualizar query/tela de serviços
  └── Aba "Por Loja" no cadastro de serviços
  ⏱ 3-5 dias | ⚠️ Risco: baixo

FASE 7 ──── Estoque (Inventory Movements)
  ├── store_id já existe em stock_movements (migração 02)
  ├── Migrar lógica de estoque para store_products.override_stock
  ├── Atualizar triggers de baixa de estoque para usar store_products
  ├── Atualizar estoque no PDV e pedidos
  ├── Atualizar movimentações de estoque (entrada/saída/transferência)
  ├── Criar suporte a transferência entre lojas (tipo 'transfer')
  └── Remover products.stock_quantity (deprecate)
  ⏱ 5-7 dias | ⚠️ Risco: médio-alto

FASE 8 ──── Agenda (Appointments)
  ├── Adicionar store_id à tabela appointments
  ├── Migração única: popular Loja Principal para registros existentes
  ├── Atualizar server actions de agendamento para incluir storeId
  ├── Atualizar filtros na UI
  ├── Adicionar suporte a staff por loja
  └── Atualizar notificações de agendamento
  ⏱ 3-5 dias | ⚠️ Risco: baixo

FASE 9 ──── Financeiro (Transactions, Payable, Receivable)
  ├── Adicionar store_id em:
  │   • transactions
  │   • recurring_transactions
  │   • accounts_payable
  │   • accounts_receivable
  │   • finance_accounts
  │   • quotes / quote_items
  ├── Migração única: popular Loja Principal para registros existentes
  ├── Atualizar server actions financeiras
  ├── Atualizar filtros e relatórios financeiros
  └── Dashboard financeiro: consolidado (todas) × por loja
  ⏱ 7-10 dias | ⚠️ Risco: alto (mexe em financeiro)

FASE 10 ──── PDV / Caixa
  ├── Adicionar store_id em:
  │   • sales
  │   • sale_items
  │   • cash_register (se tabela separada)
  ├── Migração única: popular Loja Principal
  ├── Atualizar server actions de PDV
  └── Caixa é aberto por loja (cada filial tem seu caixa)
  ⏱ 5-7 dias | ⚠️ Risco: médio

FASE 11 ──── Marketplace (página pública por Store)
  ├── Criar rota /[cidadeUf]/[store-slug]
  ├── Slug único por store (gerado automaticamente)
  ├── Página pública da Store:
  │   • logo, banner, galeria
  │   • produtos (via store_products)
  │   • avaliações
  │   • horários, endereço, telefone
  ├── Atualizar busca do marketplace para retornar stores
  ├── Sincronizar stores com Redis (lib/redis-sync.ts)
  ├── Atualizar ranking do marketplace para usar store
  └── Cada store aparece individualmente nas buscas
  ⏱ 5-7 dias | ⚠️ Risco: médio

FASE 12 ──── WhatsApp (movido para Store)
  ├── Adicionar store_id em partner_whatsapp_connections
  ├── Implementar resolução: store-level > partner-level
  ├── Atualizar createWhatsappProviderFromConnection()
  ├── Atualizar configuração de WhatsApp:
  │   • Associar conexão a uma Store
  │   • Cada filial com número próprio
  ├── Atualizar envio de notificações
  └── Retrocompatibilidade: se store_id = NULL, mantém comportamento atual
  ⏱ 5-7 dias | ⚠️ Risco: médio

FASE 13 ──── Promoções e Cupons
  ├── Criar promotion_stores (N:N)
  ├── Criar coupon_stores (N:N)
  ├── Atualizar CRUD de promoções para selecionar lojas
  ├── Atualizar CRUD de cupons para selecionar lojas
  ├── Validação: tabela vazia = todas as lojas
  └── Validação: aplicar apenas nas lojas selecionadas
  ⏱ 3-5 dias | ⚠️ Risco: baixo

FASE 14 ──── Service Orders / OS
  ├── Adicionar store_id em service_orders
  ├── Migração única: popular Loja Principal
  ├── Atualizar server actions
  └── Atualizar filtros e notificações
  ⏱ 2-3 dias | ⚠️ Risco: baixo

FASE 15 ──── Configurações por Loja
  ├── Settings: separar abas "Geral (Partner)" × "Por Loja"
  ├── Mover campos de partners para stores (opening_hours, phone, etc.)
  ├── Herança: Store herda do Partner se não configurado
  └── Atualizar integrações (MP, WhatsApp) para contexto de loja
  ⏱ 5-7 dias | ⚠️ Risco: alto
```

### Mapa de dependências entre fases

```
Fase 1 (Fundação)
  └── Fase 2 (Store Context)
       └── Fase 3 (RLS/Permissions)
            ├── Fase 4 (Store Members)
            ├── Fase 5 (Store Products)
            │    └── Fase 7 (Estoque)
            ├── Fase 6 (Store Services)
            │    └── Fase 8 (Agenda)
            ├── Fase 9 (Financeiro)
            │    └── Fase 10 (PDV/Caixa)
            ├── Fase 11 (Marketplace)
            ├── Fase 12 (WhatsApp)
            ├── Fase 13 (Promoções/Cupons)
            ├── Fase 14 (Service Orders)
            └── Fase 15 (Config por Loja)
```

---

## 28. Esforço Estimado

| Fase | Descrição | Arquivos | Tabelas | Esforço |
|------|-----------|----------|---------|---------|
| 1 | Fundação | 5-10 | 1 (stores) | ⭐ 2-3 dias |
| 2 | Store Context server-side | 10-15 | — | ⭐ 3-5 dias |
| 3 | RLS e Permissões | 15-20 | — | ⭐⭐ 3-5 dias |
| 4 | Store Members | 10-15 | 1 (store_members) | ⭐⭐ 5-7 dias |
| 5 | Store Products | 20-30 | 1 (store_products) | ⭐⭐ 5-7 dias |
| 6 | Store Services | 15-20 | 1 (store_services) | ⭐ 3-5 dias |
| 7 | Estoque | 15-20 | — | ⭐⭐ 5-7 dias |
| 8 | Agenda | 10-15 | 1 (appointments) | ⭐ 3-5 dias |
| 9 | Financeiro | 30-40 | 6+ (transactions, etc.) | ⭐⭐⭐ 7-10 dias |
| 10 | PDV/Caixa | 15-20 | 2+ (sales, etc.) | ⭐⭐ 5-7 dias |
| 11 | Marketplace | 20-30 | — | ⭐⭐ 5-7 dias |
| 12 | WhatsApp | 10-15 | 1 (connections) | ⭐⭐ 5-7 dias |
| 13 | Promoções/Cupons | 5-10 | 2 (promotion_stores, coupon_stores) | ⭐ 3-5 dias |
| 14 | Service Orders | 5-10 | 1 (service_orders) | ⭐ 2-3 dias |
| 15 | Config por Loja | 15-20 | — | ⭐⭐ 5-7 dias |

**Total:** ~190-280+ arquivos | ~58-95 dias de esforço líquido

**Nota:** Muitos arquivos serão alterados em múltiplas fases (ex: uma server action pode ser alterada nas fases 5, 8, 9, 10). O número de arquivos únicos é ~150-180.

---

## Diagrama da Arquitetura Final

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            PARTNER                                       │
│                                                                          │
│  partners {                                                              │
│    id, user_id, cnpj, business_type,                                     │
│    subscription → plans, subscriptions, usage_counters, billing_events,  │
│    mercadopago_tokens → access_token, refresh_token,                     │
│    partner_users → [ { user_id, role, permissions } ],                   │
│    partner_invitations,                                                  │
│    product_fiscal_profiles, product_logistics,                           │
│    audit_logs                                                            │
│  }                                                                       │
│                                                                          │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
               ┌───────────┼───────────┐
               │           │           │
               ▼           ▼           ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│      STORE          │ │      STORE          │ │      STORE          │
│  (Matriz)           │ │  (Filial Centro)    │ │  (Filial Shopping)  │
│                     │ │                     │ │                     │
│  stores {           │ │  stores {           │ │  stores {           │
│    id, partner_id,  │ │    id, partner_id,  │ │    id, partner_id,  │
│    name, slug,      │ │    name, slug,      │ │    name, slug,      │
│    logo, banner,    │ │    logo, banner,    │ │    logo, banner,    │
│    gallery, phone,  │ │    gallery, phone,  │ │    gallery, phone,  │
│    city, state,     │ │    city, state,     │ │    city, state,     │
│    opening_hours,   │ │    opening_hours,   │ │    opening_hours,   │
│    whatsapp_instance│ │    whatsapp_instance│ │    whatsapp_instance│
│  }                  │ │  }                  │ │  }                  │
│                     │ │                     │ │                     │
│  ┌───────────────┐  │ │  ┌───────────────┐  │ │  ┌───────────────┐  │
│  │ store_products│  │ │  │ store_products│  │ │  │ store_products│  │
│  │ override_price│  │ │  │ override_price│  │ │  │ override_price│  │
│  │ override_stock│  │ │  │ override_stock│  │ │  │ override_stock│  │
│  │ override_sku  │  │ │  │ override_sku  │  │ │  │ override_sku  │  │
│  └───────────────┘  │ │  └───────────────┘  │ │  └───────────────┘  │
│                     │ │                     │ │                     │
│  ┌───────────────┐  │ │  ┌───────────────┐  │ │  ┌───────────────┐  │
│  │ store_services│  │ │  │ store_services│  │ │  │ store_services│  │
│  │ override_price│  │ │  │ override_price│  │ │  │ override_price│  │
│  │ override_dur. │  │ │  │ override_dur. │  │ │  │ override_dur. │  │
│  └───────────────┘  │ │  └───────────────┘  │ │  └───────────────┘  │
│                     │ │                     │ │                     │
│  orders (store_id)  │ │  orders (store_id)  │ │  orders (store_id)  │
│  customers (s_id)   │ │  customers (s_id)   │ │  customers (s_id)   │
│  appointments (s_id)│ │  appointments (s_id)│ │  appointments (s_id)│
│  transactions (s_id)│ │  transactions (s_id)│ │  transactions (s_id)│
│  sales (store_id)   │ │  sales (store_id)   │ │  sales (store_id)   │
│                     │ │                     │ │                     │
│  store_members {}   │ │  store_members {}   │ │  store_members {}   │
│                     │ │                     │ │                     │
│  promotion_stores   │ │  promotion_stores   │ │  promotion_stores   │
│  coupon_stores      │ │  coupon_stores      │ │  coupon_stores      │
│                     │ │                     │ │                     │
│  Página pública:    │ │  Página pública:    │ │  Página pública:    │
│  /cambe-pr/loja-    │ │  /cambe-pr/loja-    │ │  /cambe-pr/loja-    │
│  dudit-matriz       │ │  dudit-centro       │ │  dudit-shopping     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

---

## Decisões Arquiteturais (resumo executivo)

| Decisão | Escolha | Alternativa rejeitada |
|---------|---------|----------------------|
| **Store Products** | Override fields (NULL = herda) | Duplicar produtos ou criar Product copy |
| **Promoções/Cupons** | Tabelas N:N (promotion_stores, coupon_stores) | Array store_ids (desnormalizado) |
| **Marketplace** | Página individual por Store (slug próprio) | Página institucional listando Stores |
| **WhatsApp** | Store-level (store_id na conexão) | Partner-level (atual) |
| **Mercado Pago** | Compartilhado (Partner, sem store_id) | Independente por Store (adiado) |
| **Assinatura** | Partner (inalterado) | Por Store (rejeitado) |
| **Permissões** | PartnerUser + StoreMember (com fallback) | Apenas PartnerUser |
| **RLS** | `get_user_partner_ids()` + `user_has_store_access()` | Políticas duplicadas |
| **Store Context** | Server-side cookie + client-side React context | Apenas client-side |
| **Hierarquia** | Store → Partner (N:1). Tudo controlado pelo Partner. | Store autônoma |

---

## Checklist Pré-Implementação

- [ ] RFC revisado e aprovado pelo time
- [ ] Definição de slugs de store (formato, unicidade)
- [ ] Definição de limite de stores por plano
- [ ] Estratégia de migração de dados de partners para stores
- [ ] Plano de rollback para cada fase
- [ ] Testes de RLS para todos os cenários (owner, admin, manager, operator, delivery)
- [ ] Testes de permissão com store_members
- [ ] Benchmark de performance (queries com partner_id + store_id)
- [ ] Documentação para devs (como criar nova server action com store context)

---

## 29. Pós-Implementação

Após a conclusão de todas as fases, executar as atividades de encerramento:

### 29.1 Remoção de código legado

| O quê | Quando | Risco |
|-------|--------|-------|
| `products.stock_quantity` | Após Fase 7 estabilizar (1 ciclo sem divergência) | Médio |
| `partners.store_name` | Após Fase 15 (toda UI usando `stores.name`) | Baixo |
| `partners.store_image_url` | Após Fase 15 | Baixo |
| `partners.store_description` | Após Fase 15 | Baixo |
| `partners.opening_hours` | Após Fase 15 | Baixo |
| `partners.phone` (se duplicado) | Após Fase 15 | Baixo |
| `products.store_id` (se substituído por store_products) | Após Fase 7 + validação | Médio |
| Código de compatibilidade em StoreProvider | Após Fase 2 | Baixo |

### 29.2 Limpeza de compatibilidade temporária

- Remover fallbacks que foram criados apenas para transição
- Remover `if (storeId == null)` branches que não são mais necessários
- Simplificar `resolveProduct()` se override_stock se tornar obrigatório
- Remover jobs de verificação de divergência (estoque, permissões)

### 29.3 Revisão de índices

```sql
-- Identificar índices não utilizados
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%pk%'
ORDER BY tablename;

-- Remover índices que perderam utilidade
-- Ex: idx_products_store_id se store_products substituiu products.store_id
-- Ex: índices temporários criados para migração
```

### 29.4 Revisão de colunas de migração

Colunas que foram adicionadas apenas para popular dados durante a migração:

- `stores.is_headquarters` — se não for mais usada na UI
- Colunas de deprecação marcadas com `_deprecated` se houver

### 29.5 Documentação técnica final

- [ ] Diagrama ER final das tabelas envolvidas
- [ ] Fluxo de autorização (PartnerUser → StoreMember)
- [ ] Fluxo de resolução de produtos/serviços
- [ ] Fluxo de resolução de integrações (WhatsApp)
- [ ] Exemplo de criação de nova Server Action com Store Context
- [ ] Estratégia de backup e restore para migrações
- [ ] Runbook de rollback para cada fase

---

## Critérios de Sucesso

Após a conclusão de todas as fases:

- **Retrocompatibilidade:** Partners com 1 loja continuam funcionando sem alteração perceptível (UI, fluxos, performance).
- **Operação multi-loja:** Partners com múltiplas lojas conseguem operar estoque, agenda, PDV, financeiro e equipe de forma independente por Store.
- **Marketplace unificado:** Marketplace utiliza exatamente a mesma camada de serviços, queries e resolvers do ERP. Nenhuma lógica duplicada.
- **Zero lógica duplicada:** Nenhuma Server Action contém implementação manual de resolução de Store, permissão ou conexão. Todas usam os helpers compartilhados.
- **Performance estável:** Nenhuma query crítica apresenta regressão superior a 10% em relação à linha de base pré-migração. Índices cobrindo `partner_id + store_id` presentes em todas as tabelas afetadas.
- **Integrações resilientes:** WhatsApp, Mercado Pago e demais integrações continuam operando corretamente com fallback (Store → Partner) quando não configuradas por filial.
- **Logs auditáveis:** Todas as operações críticas (troca de loja, movimentação de estoque, alteração de permissões) geram logs estruturados rastreáveis.
- **Código legado removido:** `products.stock_quantity`, `partners.store_name`, `partners.store_image_url` e demais colunas depreciadas foram removidas após validação.
