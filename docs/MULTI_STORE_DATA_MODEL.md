# MULTI-STORE DATA MODEL

## 1. Definições dos 5 Tiers

### GLOBAL

- Dados da marca/partner, compartilhados entre TODAS as lojas
- store_id: NÃO EXISTE na tabela (coluna não presente)
- partner_id: PRESENTE (vincula ao partner)
- RLS: `partner_id IN (SELECT public.get_user_partner_ids())`
- Criação: nível partner, visível automaticamente em todas as lojas
- Exclusão: apenas nível partner
- Herança: N/A (não há override)
- Exemplos: customers, product_categories, brands

### HYBRID (Bridge)

- Dados com cadastro GLOBAL + override por loja via bridge table
- Base table: NÃO tem store_id
- Bridge table: store_id NOT NULL, UNIQUE(resource_id, store_id)
- Bridge fields: OPIONAIS (NULL = herda do base). Ex: override_price, override_stock_quantity
- Base RLS: partner_id IN get_user_partner_ids()
- Bridge RLS: user_has_store_access(store_id) para SELECT, role check para mutation
- Visibility Scope: 'all', 'selected', 'exclusive' (controla quais lojas enxergam)
- Exemplos: products + store_products, services + store_services

### HYBRID (Nullable)

- Dados que podem ser GLOBAIS (store_id=NULL) ou exclusivos de uma loja (store_id=UUID)
- store_id: NULLABLE (NULL = global, UUID = exclusivo da loja)
- Sem bridge table (sem override fields)
- RLS: `(store_id IS NULL OR user_has_store_access(store_id))`
- Exemplos: payment_methods, financial_categories, finance_accounts

### STORE

- Dados operacionais pertencem a UMA loja específica
- store_id: NOT NULL (obrigatório)
- partner_id: PRESENTE (denormalizado para RLS)
- RLS: user_has_store_access(store_id)
- Criação: sempre requer contexto de loja
- Isolamento: não visível entre lojas
- Exemplos: orders, stock_movements, appointments

### USER

- Dados do usuário individual
- store_id: NÃO EXISTE
- partner_id: NÃO EXISTE
- user_id: PRESENTE (auth.uid())
- RLS: `auth.uid() = user_id`
- Exemplos: profiles, addresses

### SYSTEM

- Dados de infraestrutura da plataforma
- store_id: NÃO EXISTE
- partner_id: NÃO EXISTE (ou opcional para contexto)
- RLS: service role apenas, ou público
- Exemplos: plans, audit_logs, 2FA tables

## 2. Regras de Herança (Bridge Pattern)

### Regra 1: Herança Automática

```
Campo na bridge = NULL → usa valor da base
Campo na bridge = valor → usa valor da bridge
```

### Regra 2: Propagação

Alterações na base NÃO propagam automaticamente para bridges existentes.
Ex: Preço global do produto muda de R$10 para R$12. Lojas sem override_price específico veem R$12. Lojas com override_price=R$11 mantêm R$11.

### Regra 3: Criação de Bridge

Quando uma store é criada, bridges NÃO são criadas automaticamente. A herança padrão (sem bridge = usa base) já resolve.

## 3. Visibility Scope (all / selected / exclusive)

Campo na bridge table: `visibility_scope TEXT DEFAULT 'all'`

### 'all' (default):

- Produto/serviço visível em TODAS as lojas por padrão
- store_products opcional (só para override ou ocultar)
- Sem store_products → visível com dados da base
- store_products com is_active=false → oculto nesta loja
- store_products com override → visível com override

### 'selected':

- Produto/serviço visível APENAS nas lojas com store_products explícito
- store_products com is_active=true → visível nesta loja
- store_products com is_active=false ou sem registro → NÃO visível
- Útil para: campanha sazonal em lojas selecionadas

### 'exclusive':

- Produto/serviço EXCLUSIVO de UMA loja
- Apenas 1 store_products permitido (validado na app)
- Nenhuma outra loja enxerga
- Útil para: produto criado por uma loja para uso exclusivo dela

### Fluxo de Resolução em Runtime:

```
function resolveVisibility(product, storeId):
  scope = product.visibility_scope  // 'all' | 'selected' | 'exclusive'
  sp = store_products.findBy(product.id, storeId)

  if scope == 'all':
    return sp?.is_active ?? product.is_active  // TRUE por padrão se não há store_products
  elif scope == 'selected':
    return sp?.is_active == true  // FALSE se não há store_products
  elif scope == 'exclusive':
    return sp?.store_id == storeId AND sp?.is_active == true
```

## 4. Regras de Criação

### Quem cria o quê:

| Tipo | Quem cria | Onde |
|---|---|---|
| GLOBAL | Owner/Admin do partner | Nível partner |
| HYBRID Base | Owner/Admin do partner | Nível partner |
| HYBRID Bridge | Owner/Admin/Manager da loja | Nível loja |
| HYBRID Nullable (global) | Owner/Admin do partner | store_id=NULL |
| HYBRID Nullable (store) | Owner/Admin/Manager da loja | store_id=UUID |
| STORE | Owner/Admin/Manager da loja | store_id=UUID |

### Produto Exclusivo da Loja:

1. Criar products (GLOBAL) normalmente
2. Criar apenas 1 store_products vinculando à loja desejada
3. visibility_scope = 'exclusive'
4. Apenas aquela loja enxerga o produto

## 5. Padrões RLS

### GLOBAL

```sql
-- SELECT
CREATE POLICY "select" ON table_name FOR SELECT USING (
  partner_id IN (SELECT public.get_user_partner_ids())
);
-- Mutation: verifica role via partner_users
```

### HYBRID (Bridge)

```sql
-- Base table
CREATE POLICY "select" ON products FOR SELECT USING (
  partner_id IN (SELECT public.get_user_partner_ids())
);
-- Bridge table
CREATE POLICY "select" ON store_products FOR SELECT USING (
  public.user_has_store_access(store_id)
);
```

### HYBRID (Nullable)

```sql
CREATE POLICY "select" ON payment_methods FOR SELECT USING (
  partner_id IN (SELECT public.get_user_partner_ids())
  AND (store_id IS NULL OR public.user_has_store_access(store_id))
);
```

### STORE

```sql
CREATE POLICY "select" ON orders FOR SELECT USING (
  partner_id IN (SELECT public.get_user_partner_ids())
  AND (public.user_has_store_access(store_id) OR buyer_id = auth.uid())
);
```

## 6. Casos de Uso (Exemplos Completos)

### Caso 1: Produto global herdado

Produto "Coca Cola 2L" criado na matriz.
Todas as 5 lojas vendem automaticamente.
Loja Centro define preço R$12 (override). Demais lojas vendem a R$10 (preço global).

### Caso 2: Produto exclusivo de loja

Loja Shopping cria "Combo Executivo Shopping".
visibility_scope = 'exclusive', store_products apenas para loja Shopping.
Nenhuma outra loja vê ou vende.

### Caso 3: Fornecedor global desativado em loja

Fornecedor "Distribuidora ABC" é global.
Loja Curitiba desativa: store_suppliers.is_active = false.

### Caso 4: Conta financeira por loja

"Mercado Pago" é GLOBAL (store_id=NULL).
"Banco Itaú Centro" é STORE (store_id=UUID da loja Centro).
"Banco Itaú Curitiba" é STORE (store_id=UUID da loja Curitiba).

## 7. Anti-Patterns (O que NÃO fazer)

1. ❌ Criar coluna store_id em tabelas GLOBAIS
2. ❌ Duplicar registros da base por loja (criar products diferentes para cada loja)
3. ❌ Usar store_id direto em tabelas que deveriam ter bridge (products, services)
4. ❌ Ignorar herança ao criar override (sempre persistir campos completos na bridge)
5. ❌ store_id NOT NULL em tabelas HYBRID nullable
6. ❌ store_id NULLABLE em tabelas STORE (deve ser NOT NULL)
