# Supabase Performance & Scalability Audit

## Escopo e limitações

Auditoria estática de app, components, hooks, lib, trigger, scripts e migrations, cobrindo UI → Next.js → Supabase/PostgreSQL. Não houve conexão com um projeto Supabase ativo; EXPLAIN ANALYZE, pg_stat_statements, advisors, cardinalidade, pool e Realtime precisam ser coletados em staging/produção.

Validação local: npm test passou com 289 testes em 22 arquivos; npx tsc --noEmit passou.

## Top 10 highest-impact fixes

| Priority | Issue | Area | Impact |
|---|---|---|---|
| Critical | Backfill com RPC sequencial por item e delete global | Métricas | Muito alto |
| Critical | Carteira inteira + select(*) + descriptografia de CPF por linha | Customers | Muito alto |
| High | Dashboard com ~14 queries e counts exatos repetidos | Dashboard | Alto |
| High | Middleware com Auth + até 3 queries no caminho crítico | Auth | Alto |
| High | Search RPC recalcula fuzzy/ranking por linha em quatro tabelas | Marketplace | Alto em milhões |
| High | Importação faz scan de todos os CPFs criptografados | ERP import | Alto |
| High | Cliente service-role em Server Component e overfetch | Segurança/DB | Alto |
| Medium | Cache global sem eviction e storeId sem efeito na query | Cache | Médio/alto |
| Medium | Realtime dispara refetch da lista e contador por evento | Frontend | Médio |
| Medium | Índices de várias gerações precisam de deduplicação por uso | PostgreSQL | Médio |

## Achados detalhados

### F-00 — RPC de busca marketplace está quebrada no banco atual

Severity: Critical. Verificação direta em PostgreSQL em 2026-08-05.

`select * from public.search_marketplace('a','tudo',20,null,null,null)` falhou com `column pt.risk_score does not exist`. A definição instalada tem assinatura com sete argumentos, incluindo `p_store_ids`, e referencia `pt.risk_score` e `st.risk_score`, mas a inspeção de information_schema não encontrou essas colunas em partners/stores.

Isso é uma falha funcional antes de ser um problema de performance: busca, marketplace e qualquer fluxo que use essa RPC podem retornar erro em produção. Corrigir a migração/estado do schema de forma consistente, testar com a assinatura instalada e só depois medir o plano. Não aplicar uma coluna ou migration às cegas: comparar a definição desejada, histórico e deploy efetivo.

### Evidência live — estado atual e uso de índices

O banco conectado é PostgreSQL 17.6, com pg_stat_statements habilitado. Cardinalidade atual ainda é baixa: audit_logs 1.902, orders 360, order_items 431, transactions 130, notifications 131, products 24 e customers 4 linhas vivas.

Nesta janela, há índices com zero scans em orders, products, customers, transactions, audit_logs e stock_movements. Exemplos: customers `idx_customers_partner`, `idx_customers_partner_created`, `trgm_idx_customers_name`; orders `idx_orders_partner_id_situation`, `idx_orders_pickup_window_start`; products `idx_products_partner_created`, `idx_products_fts`; transactions vários índices de referências/recorrência. Isso não autoriza remoção imediata — as estatísticas podem ter sido resetadas — mas justifica inventário e período de observação antes de criar mais índices.

O top de pg_stat_statements inclui 146.080 chamadas de leitura do WAL/Realtime, totalizando aproximadamente 828s, além de introspecção do Supabase com centenas de chamadas e médias elevadas. Separar carga de plataforma/introspection da carga da aplicação ao avaliar custo e latência.

Os planos medidos confirmam que o índice de orders funciona para a listagem recente (`idx_orders_partner_created_id_desc`) e para count (`Index Only Scan`). A query de customers com `select *` não usou índice na base de apenas quatro linhas; com volume real, deve ser repetida após paginação e seleção explícita. O contador unread usou `idx_notifications_user_unread` corretamente.

### F-01 — Backfill é O(N) round-trips e replay destrutivo

Severity: Critical. Location: scripts/backfill-marketplace-metrics.ts:18-80.

Current code:

~~~ts
await supabase.from("marketplace_metrics_events").delete().neq("id", "00000000-0000-0000-0000-000000000000")
for (const order of orders || []) {
  await supabase.rpc("record_marketplace_order_metrics", { p_order_id: order.id })
}
~~~

O mesmo padrão ocorre para appointments e subscriptions. O custo é 3 + N chamadas RPC/HTTP; execuções concorrentes podem corromper contadores.

Optimized version: RPCs set-based com INSERT ... SELECT e ON CONFLICT, lotes de 500–2.000 IDs, cursor (created_at,id), idempotency key e advisory lock. Não apagar o ledger global; usar run_id/janela de replay.

Impacto: 90–99% menos round-trips.

### F-02 — Customers carrega tudo e descriptografa todos os CPFs

Severity: Critical. Location: lib/data/customers.ts:12-51.

~~~ts
.from("customers").select("*").eq("partner_id", partnerId)
for (const c of data) c.cpf = await decryptCPF(c.cpf)
~~~

Há overfetch, payload linear e CPU O(N). storeId está apenas na chave do cache e não filtra a consulta.

Optimized version: seleção explícita, paginação keyset, busca no banco e descriptografia apenas para ação autorizada/registro individual. Se o escopo for loja, aplicar store_id. Índice: (partner_id, created_at DESC, id) ou (partner_id, store_id, created_at DESC, id).

Impacto: payload/CPU proporcional à página; 80–99% menos dados em carteiras grandes.

### F-03 — Dashboard tem consultas redundantes e counts exatos

Severity: High. Location: lib/dashboard-engine/engine.ts:34-139.

~~~ts
await Promise.all([
  stores.eq("id", activeStoreId),
  stores.eq("partner_id", partnerId),
  products.select("id", { count: "exact", head: true }),
  services.select("id", { count: "exact", head: true }),
  orders.select("id", { count: "exact", head: true }),
  orders.select("id", { count: "exact", head: true }).gte("created_at", startOfMonthIso)
])
~~~

São aproximadamente 14 operações por abertura. count exact fica caro em milhões de linhas.

Optimized version: um RPC/view retorna store, flags, contagens e limites; contadores denormalizados por tenant para onboarding/limites; cache TTL para métricas não críticas. Índices: orders(partner_id, created_at DESC), products(partner_id,status), services(partner_id,status).

Impacto: 14 → 1–3 round-trips.

### F-04 — Middleware adiciona Auth e consultas a toda rota privada

Severity: High. Location: lib/supabase/middleware.ts:384-494.

~~~ts
const { data: { user } } = await supabase.auth.getUser()
const [profileResult, partnerResult, deletionResult, partnerDeletionResult] =
  await Promise.all([...])
~~~

Essas operações estão no caminho de cada request privado e multiplicam RPS no Supabase.

Optimized version: middleware limitado a sessão/redirect; RPC único para ban/deletion/partner status quando necessário, ou checagem no server layout/action. Manter RLS como autoridade final.

Impacto: menor TTFB e 2–4 operações a menos por request.

### F-05 — Busca marketplace executa fuzzy/ranking por linha

Severity: High. Location: migrations/20260610_marketplace_search_v2.sql:479-564.

A RPC combina products, services, partners e recurring_plans com UNION ALL. mp_search_row_matches normaliza e faz LIKE/FTS/fuzzy; mp_compute_search_rank repete normalização/similarity antes de ordenar.

Optimized version: coluna normalizada e search_document pré-calculados; tabela/materialized view unificada de itens públicos; FTS/prefixo primeiro e fuzzy apenas em candidatos limitados; RPC especializada por tipo/tenant.

Impacto: CPU e latência muito menores em milhões de itens. Confirmar com EXPLAIN (ANALYZE, BUFFERS).

### F-06 — Importação de clientes faz scan completo de CPFs

Severity: High. Location: lib/erp/import/batch-importer.ts:437-474.

~~~ts
.select("cpf").eq("partner_id", partnerId).not("cpf", "is", null)
for (const row of allCpfs) {
  const decrypted = await decryptCPF(row.cpf)
}
~~~

Cada lote lê e descriptografa todos os CPFs do parceiro. Com 100k clientes, custo O(M), mesmo para lote pequeno.

Optimized version: hash determinístico com salt por tenant, campo cpf_lookup_hash e índice (partner_id, cpf_lookup_hash), ou RPC que receba o lote e faça matching sem retornar a carteira.

### F-07 — Service-role após autorização e overfetch

Severity: High. Location: app/erp/settings/page.tsx:13-40.

~~~ts
await requireUser()
const supabase = createAdminClient()
supabase.from("partners").select("*").eq("id", context.partnerId)
supabase.from("stores").select("*, addresses!store_id!left(...)")
~~~

O admin ignora RLS e retorna colunas desnecessárias. A segurança depende apenas das checagens anteriores.

Optimized version: cliente server-side com sessão/RLS, campos explícitos e join/RPC invoker-safe. Se admin for indispensável, validar tenant dentro da função e limitar colunas.

### F-08 — Cache global sem eviction e chave duplicada

Severity: Medium. Location: lib/data/customers.ts:10-49.

~~~ts
const customersCacheMap = new Map<string, any>()
cachedFn = unstable_cache(..., [TAGS.customers(partnerId), storeId], ...)
~~~

O Map cresce por partner/store em processos long-lived. Como storeId não filtra a query, pode haver várias entradas para o mesmo conjunto.

Optimized version: remover Map e usar cache com TTL/limite; ou aplicar realmente store_id e manter a chave completa.

### F-09 — Realtime causa duas refetches por evento

Severity: Medium. Location: providers/notifications-realtime-provider.tsx:12-20.

~~~ts
queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count", user.id] })
queryClient.invalidateQueries({ queryKey: ["notifications", "list", user.id] })
~~~

Rajadas podem recarregar lista inteira e contador repetidamente.

Optimized version: setQueryData para contador/lista, debounce de 100–300 ms e refetch da lista apenas para evento relevante. Confirmar filtro Realtime por user_id.

### F-10 — Índices de várias gerações precisam de inventário

Severity: Medium. Location: migrations 028, 040, 20260801_migration5 e 20260801_migration6.

Há múltiplas definições históricas para orders/products/customers/stock_movements. Índices duplicados aumentam custo de escrita.

Optimized version: comparar pg_indexes, medir pg_stat_user_indexes, remover apenas duplicatas confirmadas e validar cada query com EXPLAIN. Para workload multi-tenant, tenant deve aparecer no início quando for predicado dominante.

### F-11 — Policies permissivas e numerosas aumentam custo de RLS; products tem SELECT global

Severity: High. Verificação direta em pg_policies em 2026-08-05.

O banco tem 13 policies em products, 11 em orders e 8 em customers. A policy products_select_all tem qual `true` e role public. Em PostgreSQL, policies permissivas são combinadas por OR; uma policy global torna inúteis as restrições de SELECT das outras policies para essa operação e pode expor linhas fora do fluxo marketplace (inclusive itens inativos/privados, dependendo do payload/API).

Optimized version: separar claramente leitura pública de marketplace em view/RPC com apenas colunas públicas e filtro is_active/show_in_marketplace; remover SELECT global da tabela operacional. Usar TO anon/authenticated explicitamente e predicados tenant/ownership nas tabelas privadas. Consolidar policies equivalentes para reduzir subqueries EXISTS repetidas.

Impacto: menor avaliação de RLS e menor risco de vazamento/carga por leitura ampla. Validar com testes anon/authenticated e EXPLAIN sob os roles reais antes de alterar.

## RLS, Auth e Realtime

- 20260610_marketplace_search_v2.sql:82-90 usa auth.role() = service_role; migrar para TO explícito/grants conforme o modelo atual.
- Policies de notifications em 20260609_create_notifications_system.sql:114-121 devem manter índice por user_id; preferir (select auth.uid()) para evitar avaliação repetida.
- notification_delivery_log usa EXISTS correlacionado em RLS; medir em alto volume.
- Não foi possível confirmar conexões, replication slots, publication final, egress ou advisors sem projeto conectado.

## Riscos por escala

| Volume | Risco dominante |
|---|---|
| 10k | Overfetch/refetch e counts |
| 100k | Customers/import e cache global |
| 1M | Search ranking, reports e counts exatos |
| 10M | Eventos/transactions/audit exigem retenção, agregados e possível particionamento |

Para 1k–100k empresas, toda operação deve filtrar partner_id/store_id e ter índice compatível; nunca depender de filtro no cliente.

## Quick wins

1. Remover select(*) de customers/settings/imports.
2. Paginar listagens com cursor.
3. Trocar backfill por RPC set-based idempotente.
4. Consolidar dashboard em RPC/cache.
5. Debounce das invalidações de notifications.
6. Hash de CPF para deduplicação.
7. Auditar índices com pg_stat_user_indexes.

## Arquitetura recomendada

RPCs transacionais para checkout, estoque, importação e dashboard; projeção/materialized view para marketplace e métricas; jobs idempotentes com FOR UPDATE SKIP LOCKED; cache externo apenas para dados públicos com chave tenant-safe; retenção/arquivamento para audit_logs, notification_delivery_log, webhook_events, stock_movements e transactions.

## Próxima validação

Coletar top queries em pg_stat_statements; executar EXPLAIN com 100k/1M/10M linhas; medir query count por page view, Auth calls, Realtime events/refetches, egress e conexões; executar carga concorrente em 1k/10k/100k tenants.
