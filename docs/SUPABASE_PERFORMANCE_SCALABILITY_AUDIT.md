# Supabase Performance & Scalability Audit

## Escopo e limitações

Auditoria estática de app, components, hooks, lib, trigger, scripts e migrations, cobrindo UI → Next.js → Supabase/PostgreSQL. Não houve conexão com um projeto Supabase ativo; EXPLAIN ANALYZE, pg_stat_statements, advisors, cardinalidade, pool e Realtime precisam ser coletados em staging/produção.

Validação local: npm test passou com 289 testes em 22 arquivos; npx tsc --noEmit passou.

Atualizacao desta auditoria: alem da revisao estatica, foram executadas verificacoes read-only no PostgreSQL e no Redis conectados em 2026-08-07. Nao foram executadas escritas, migrations, deletes ou alteracoes de dados. Os achados live abaixo complementam e mantem os achados anteriores.

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

### F-12 — Divergencia live entre PostgreSQL e Redis no marketplace

Severity: Critical. Verificacao direta em PostgreSQL e Upstash Redis em 2026-08-07.

Entre 14 candidatos ativos do marketplace no banco, a comparacao das chaves `data:v2:{type}:{id}` encontrou 6 objetos ausentes no Redis, 1 objeto stale e 7 correspondentes. O servico `653eaeac-6efc-4eb7-a384-b6379b2b4bbb` estava atualizado no banco em `2026-08-07T15:47:13Z`, mas no Redis ainda tinha `2026-08-03T16:02:51Z`. Cinco payloads de produtos tambem nao continham `stock_available`. Os zsets tinham 9 itens em `explore:index:all`, 6 produtos e 3 servicos, enquanto o banco tinha 14 candidatos ativos.

Isso confirma que Redis hoje nao pode ser tratado como fonte autoritativa para preco, estoque, visibilidade ou disponibilidade. O banco deve ser a fonte de verdade; Redis pode acelerar descoberta/ranking, mas checkout e reserva devem sempre reler e validar no PostgreSQL.

### F-13 — Sincronizacao Redis nao e atomica e engole falhas

Severity: High. Location: `lib/redis-sync.ts:64-72,233-250` e `app/api/webhooks/supabase/route.ts:37-88`.

Uma sincronizacao grava/remover chave e zsets com `Promise.all`, sem transacao, e captura o erro retornando normalmente. O webhook pode responder `processed` mesmo quando a escrita no Redis falhou. Como os caminhos usam `silent: true` em varios casos, a versao global de cache tambem pode nao ser invalidada.

Usar pipeline/transaction atomica para objeto + indices, incluir `source_updated_at`/versao monotonicamente e rejeitar writes atrasados. Falha deve entrar em outbox/retry observavel; o endpoint precisa diferenciar recebido de processado.

### F-14 — Reconciliacao por LIMIT nao garante recuperacao de eventos perdidos

Severity: High. Location: `app/api/cron/sync-redis/route.ts:17-68`.

O cron revisa apenas os ultimos 100 produtos, 50 servicos e 50 parceiros, sem watermark/cursor. Se houver mais mudancas que esse limite entre duas execucoes, eventos antigos podem ficar divergentes para sempre. O job tambem dispara sincronizacoes em paralelo sem limite e usa `Promise.allSettled`, descartando o detalhe das falhas.

Trocar por outbox com `event_id`, `updated_at`/cursor, tentativas e dead-letter; manter um reconciliador paginado como rede de seguranca. Limitar concorrencia para nao transformar uma recuperacao em rajada contra Redis/Postgres.

### F-15 — Caches de busca e variantes podem ficar stale por ate 24h/1h

Severity: High. Location: `app/actions/marketplace/search.ts:373-425` e `app/actions/marketplace/products.ts:231-256`.

O cache de IDs de consultas tem TTL de 24h e retorna cedo quando os objetos existem, sem conferir freshness no banco. Variantes usam cache de 1h. Uma atualizacao de preco/estoque pode atualizar o objeto Redis, mas nao necessariamente invalidar o cache de IDs ou todas as listas relacionadas; a sincronizacao de variantes e disparada fire-and-forget em `app/actions/erp/products.ts:1171-1174`.

Para campos criticos, invalidar por versao do item/tenant e nao apenas por TTL; aguardar a escrita/invalidation antes de confirmar a mutacao. Para estoque e preco exibidos no checkout, fazer leitura autoritativa no banco.

### F-16 — Disponibilidade de servicos tem custo extra e corrida de reserva

Severity: Critical para consistencia. Location: `app/actions/marketplace/services.ts:231-357,363-510,512-549`.

Os horarios sao calculados consultando appointments em tempo real, o que e correto para freshness, mas o plano medido para staff/data/store fez Seq Scan em `appointments` (base pequena hoje: 10 linhas no exemplo). Falta um indice parcial composto alinhado ao predicado real, por exemplo `(staff_partner_user_id, start_date, store_id, start_time) WHERE status <> 'Cancelado'`, a validar com volume representativo.

Mais importante: a criacao consulta disponibilidade e depois insere o appointment sem constraint de exclusao ou operacao atomica. Dois clientes concorrentes podem observar o mesmo slot livre e ambos reservar. A validacao de varios itens tambem chama `isStaffSlotAvailable` em loop sequencial (N+1). Implementar RPC transacional com lock/constraint de intervalo, idempotency key e validacao final no mesmo commit; agrupar a leitura de varios itens.

No frontend, `ServiceDetailsPage` nao cancela/ordena respostas concorrentes ao trocar data/staff, entao uma resposta lenta pode sobrescrever os horarios da selecao atual.

### F-17 — Supabase Realtime nao cobre os dados criticos do marketplace

Severity: High. Verificacao direta em `pg_publication_tables` em 2026-08-07.

A publication `supabase_realtime` contem apenas `notifications`, `reports` e `return_messages`. `products`, `product_variants`, `services`, `stores`, `appointments`, `orders` e `stock_movements` nao estao publicados. Portanto, preco/estoque/visibilidade/disponibilidade nao chegam ao cliente via Realtime do Supabase; dependem de webhook + Redis + reconciliacao, que ja demonstraram divergencia.

Se a UX precisar de atualizacao instantanea, publicar eventos de dominio/outbox para os consumidores. Realtime pode notificar a UI, mas nao deve substituir a leitura/lock transacional do banco para checkout, estoque ou reserva.

### F-18 — Drift entre migrations e funcao instalada de busca

Severity: Critical. Verificacao direta no banco.

O arquivo `migrations/20260610_marketplace_search_v2.sql` define uma assinatura de seis argumentos sem `risk_score`, enquanto a funcao instalada `search_marketplace` tem sete argumentos e referencia `pt.risk_score`/`st.risk_score`, colunas que nao foram encontradas em `partners`/`stores`. A falha live de `search_marketplace('a','tudo',20,null,null,null)` e evidencia de migration aplicada fora de sincronia com o repositorio.

Gerar um diff do schema instalado contra migrations versionadas, corrigir a funcao em uma migration nova e testar todas as assinaturas chamadas pelo app (`search_marketplace_fts`, browse e search). Nao adicionar colunas ou remover overloads sem confirmar consumidores.

### F-19 — Seed/rebuild do Redis pode expor estado parcial

Severity: Medium/High. Location: `scripts/seed-explore-redis.ts:62-110`.

O seed apaga os indices globais e os reconstrui item a item. Durante a janela, a vitrine pode ficar vazia ou parcialmente indexada; objeto e indices tambem nao formam uma escrita atomica. O seed nao carrega todos os campos criticos de estoque/disponibilidade.

Usar versionamento de indice (double-buffer), construir a nova versao em background e trocar um ponteiro atomico no final. Compartilhar um serializer unico com `redis-sync.ts`, incluindo versao/updated_at e os campos realmente usados na exibicao.

### F-20 — `products_select_all` expõe a tabela operacional inteira

Severity: Critical. Auditoria read-only em PostgreSQL e Data API em 2026-08-07.

`products` tem RLS habilitado, mas nao forcado, 13 policies e a policy `products_select_all` com `TO public` e `USING (true)`. Como policies permissivas de SELECT sao combinadas por OR, essa policy torna as restricoes de `products_select_own`, `products_select_policy` e `admin_select_products` inefetivas para leitura. Os grants tambem permitem SELECT/INSERT/UPDATE/DELETE para `anon` e `authenticated`; RLS ainda bloqueia parte das escritas sem ownership, mas o grant amplo aumenta a superficie desnecessariamente. Ha ainda um risco separado e mais grave: `products_insert_authenticated` tem `TO authenticated WITH CHECK (true)`, entao qualquer usuario autenticado com acesso direto ao Data API pode tentar inserir produto em qualquer `partner_id`; nao executei INSERT para preservar os dados.

Teste live como `anon`: 25 produtos legiveis, incluindo 16 que nao sao elegiveis para marketplace. A chamada REST anon conseguiu selecionar `cost_price`, `stock_reserved`, `deleted_at`, `show_in_marketplace` e `is_active`. No estado atual, 24 produtos possuem `cost_price`, 15 possuem `deleted_at` e todos os 25 possuem `stock_reserved`. O teste como `authenticated` sem claims tambem leu as 25 linhas, como esperado pela policy global.

Fluxos que usam `getAdminClient` (marketplace, Redis, dashboard e varias rotinas administrativas) nao dependem dessa policy porque bypassam RLS. Fluxos com `getSupabaseServerClient`/browser client dependem das policies de leitura: import preview/batch, autorizacao de produto, telas ERP/PDV/etiquetas, consultas de loja e varias actions de ERP. O sitemap publico usa `getSupabaseServerClient` anon e consulta products diretamente, portanto uma remocao cega quebraria a indexacao publica. A proposta segura e remover a policy global somente depois de migrar esses poucos leitores anon para uma view/RPC publica com colunas explicitas e filtro de marketplace; em PostgreSQL 15+, a view deve usar `security_invoker = true` ou ficar protegida fora do schema exposto. As leituras ERP devem permanecer com predicado de partner/store e policies de ownership.

Durante a auditoria read-only anterior a correcao, nenhuma RLS ou grant foi alterado.

Status da correcao em 2026-08-07: aplicada a RPC `get_marketplace_products_public` com retorno tipado de 26 campos e filtro fixo de marketplace; `app/sitemap.ts` e `getCollectionItems()` foram migrados para ela. O endpoint de preferencia do Mercado Pago passou a usar `adminClient` no fallback de resolucao de produto/variante, pois e um fluxo autenticado de checkout e precisa validar a fonte de verdade do estoque/preco.

Apos a migracao `20260807_restrict_products_public_access`, `products_select_all` nao existe mais e `products_insert_authenticated` exige ownership do parceiro ou membership com papel `owner`, `admin` ou `manager`. Nao houve alteracao de grants amplos. Validacao live: `anon` e `authenticated` sem claims leem 0 linhas diretamente de `products`, enquanto a view publica retorna 9 linhas e nenhum campo proibido (`cost_price`, `stock_reserved`, `deleted_at` ou internos). TypeScript e 22 arquivos/289 testes passaram.

Os leitores autenticados de ERP/PDV/importacao continuam consultando `products` com as policies de parceiro existentes; nao foram migrados para a projecao publica. O teste de Data API autenticado com JWT de usuario real permanece pendente de uma sessao de teste; o papel PostgreSQL `authenticated` sem claims foi validado diretamente.

## Fase 3 — implementação incremental concluída em 2026-08-07

O checkout Mercado Pago agora deriva o `partner_id` canônico do carrinho/produtos antes de consultar configuração ou token MP; divergências com o `partnerId` informado pelo client são rejeitadas. O fluxo continua autenticado e o `process-payment` já validava o parceiro do carrinho antes de criar o pedido.

Redis continua sendo apenas cache de descoberta/ranking. A sincronização agora aplica uma projeção explícita sem `cost_price`, `stock_reserved`, `deleted_at`, `status` ou `moderation_status`, e exige `is_active`, `status = ativo`, `moderation_status = approved`, `deleted_at IS NULL` e `show_in_marketplace = true` para produtos/serviços. O webhook tenta três vezes e retorna erro quando a sincronização falha, permitindo retry do provedor; as escritas são determinísticas/idempotentes. O cron audita até 250 membros do índice global e reconcilia objetos ausentes.

Também foram sincronizadas as mutações relevantes de serviços no ERP, corrigidos os membros prefixados no purge de exclusão de conta e adicionada autorização/validação de parceiro às sessões de importação, inclusive no `applyMappingAction`.

Validação live pós-correção: 6 membros no índice global, 0 objetos ausentes, 0 violações de projeção, 0 itens inelegíveis e 0 stale contra PostgreSQL. Foi removido 1 membro órfão correspondente a produto já deletado e reconciliado 1 serviço defasado. Suíte local: 23 arquivos e 292 testes aprovados. O `tsc --noEmit` permanece bloqueado por erro de sintaxe preexistente em `lib/help-data.ts`, fora do escopo da Fase 3.

## RLS, Auth e Realtime

Evidencia live adicional: a publication `supabase_realtime` foi inspecionada diretamente; ela cobre `notifications`, `reports` e `return_messages`, mas nao cobre as tabelas criticas do marketplace listadas em F-17. Tambem foram confirmados PostgreSQL 17.6, `pg_stat_statements` habilitado, uso dos indices de orders/notifications e o plano Seq Scan da consulta de appointments em uma base ainda pequena.

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
