# Auditoria de performance — Dudit

**Data:** 29/10/2026  
**Escopo revisado:** App Router, Marketplace, ERP, Server Actions, rotas API, cache, clientes Supabase/Redis, configuração Next, migrations e índices versionados.

## Resumo

A inspeção estática encontrou um caminho ERP com consultas proporcionais ao número de agendamentos em um lote, limites fixos em leituras do dashboard e bastante uso de imagens HTML sem o otimizador do Next. Os três pontos precisam de medição e/ou mudança cuidadosa para separar custo de impacto percebido e evitar alterar semântica de pedidos, financeiro ou listagens.

Não foi possível executar medições de runtime nem consultas `EXPLAIN`: este checkout não tem dependências instaladas e não há acesso configurado ao banco nesta sessão. Por isso, nenhuma melhoria de aplicação ou banco foi aplicada nesta rodada. Não há resultados de benchmark ou ganhos estimados apresentados como medidos.

## Achados priorizados

| Prioridade | Problema e evidência | Local | Impacto e frequência provável | Risco / esforço | Ganho esperado | Validação necessária |
|---|---|---|---|---|---|---|
| P1 | A criação em lote faz resolução de cliente com até duas consultas por item; depois da inserção, cada linha pode consultar `order_items`/`orders`, atualizar o agendamento e, em alguns casos, criar pedido e itens. O trabalho de banco cresce com o tamanho do lote. | [appointments.ts](../app/actions/erp/appointments.ts#L159), [appointments.ts](../app/actions/erp/appointments.ts#L772), [appointments.ts](../app/actions/erp/appointments.ts#L856) | Uma vez por chamada de criação; maior para lotes com vários agendamentos ou cliente enviado como ID de marketplace. Pode aumentar latência e concorrência no Supabase. | Médio/alto. A fase posterior toca pedidos, estoque, receita, auditoria e idempotência. | Reduzir round trips em lotes; não quantificado. | Medir chamadas e latência por lote; comparar payloads de clientes repetidos e distintos; testes de idempotência, ownership, estoque, financeiro e falhas parciais antes/depois. |
| P1 | O read model do dashboard usa limites fixos de 300 produtos, 400 pedidos, 600 itens, 400 agendamentos e 1.000 transações. Métricas e gráficos são calculados sobre os registros retornados, então tenants que excedam esses limites podem ter amostras truncadas. | [dashboard.ts](../lib/data/dashboard.ts#L504), [dashboard.ts](../lib/data/dashboard.ts#L585), [dashboard.ts](../lib/data/dashboard.ts#L668) | Em cada atualização de cache do dashboard (TTL local de 120 segundos, com tags de invalidação); o efeito depende do volume por parceiro/loja. | Alto para mudar cálculo ou contrato; esforço alto para mover agregações para SQL/RPC preservando regras e store scope. | Melhorar custo com volume e confiabilidade das métricas; o tamanho do ganho precisa de plano de consulta e dados reais. | Comparar uma amostra controlada com cálculos atuais; confirmar limites PostgREST e políticas/escopos; EXPLAIN ANALYZE em homologação e verificação de paridade das métricas. |
| P2 | Há uso amplo de `<img>` em telas públicas e ERP (incluindo cards e listagens). `next.config.mjs` define `images.unoptimized: true`, mas a busca não encontrou importações de `next/image`; logo, alterar essa opção isoladamente não afeta essas imagens. | [next.config.mjs](../next.config.mjs), por exemplo [explorar/page.tsx](../app/explorar/[[...slug]]/page.tsx#L382); componentes em `components/marketplace` e `components/erp` | Frequente nas telas que exibem catálogo, lojas, pedidos ou anexos; bytes e LCP dependem da variante que o R2/CDN entrega e da posição visual. | Médio. Trocar imagens requer preservar URLs assinadas, imagens `blob:` de preview, dimensões e comportamento de carregamento. | Reduzir bytes e melhorar LCP nas vitrines/listagens se variantes adequadas já estiverem disponíveis. | Registrar bytes/dimensões e LCP por rota; verificar variantes de thumbnail existentes no R2; validar imagem acima da dobra e preview/upload após alteração. |
| P2 | O bundle inclui dependências grandes (por exemplo ExcelJS, Recharts, FFmpeg, leitor de QR e ferramentas de PDF), usadas em áreas específicas. Não foi observado um orçamento de bundle no código; sem relatório de build não é possível afirmar que elas contaminam chunks de rotas simples. | `package.json`; imports encontrados em `lib/erp/export/workbook.ts`, `components/erp/dashboard/charts/DashboardCharts.tsx`, `components/erp/product/AddProductPage.tsx` e `lib/pdf/generator.ts` | Pode afetar entrada e navegação nas rotas que compartilham esses módulos; frequência depende dos chunks e carregamento dinâmico efetivos. | Baixo/médio para lazy-load localizado; médio para validar fluxos de importação, relatórios, QR, PDF e vídeo. | Menor JavaScript inicial nas rotas que não usam esses recursos. | Produzir análise de chunks e Web Vitals antes/depois; verificar que a dependência fica fora dos chunks iniciais e os fluxos sob demanda continuam funcionando. |
| P3 | `images.unoptimized: true` impede o pipeline de `next/image`, mas não há imports de `next/image` no código de `app`/`components` encontrados nesta auditoria; por enquanto a opção não é evidência de gargalo ativo. | [next.config.mjs](../next.config.mjs) | Sem efeito observável nas tags `<img>` existentes. | Baixo; mudança isolada seria inócua. | Nenhum ganho demonstrável sem adoção de `next/image`. | Só reavaliar junto de implementação e medição de imagens. |
| P3 | O layout raiz carrega o script de anúncios em todas as rotas. Ele é `async`, portanto não bloqueia diretamente o parser, mas inicia tráfego externo também em telas do ERP. | [layout.tsx](../app/layout.tsx) | Toda navegação inicial; o custo depende de região, cache e navegador, não medido. | Médio. Pode mudar monetização/observabilidade de anúncios se restringido por rota. | Menos request de terceiros nas telas sem anúncios, caso o produto confirme que essas rotas não exibem publicidade. | Capturar waterfall e política comercial por rota antes de mover o script. |

## O que já está coberto no código

- A listagem do marketplace usa paginação/cursor e há funções SQL de busca com pré-filtros e índices GIN/trigram nas migrations de otimização existentes.
- Vários módulos ERP têm paginação keyset; há cache de read models com chave por parceiro/loja e tags de invalidação.
- O cache do dashboard é chamado depois da autorização em seus loaders e inclui parceiro/loja nas chaves; não foi encontrada razão para enfraquecer isolamento ou RLS.
- Migrations recentes incluem limpeza de índices duplicados, otimização de `auth.uid()` em policies e índices focados em consultas de marketplace/ERP. Não foi criada migration nesta auditoria.
- `lib/supabase/admin.ts` mantém um cliente service-role singleton sem operações de autenticação mutáveis, apropriado ao uso descrito no próprio código. Não alterado.

## Dados necessários para fechar a auditoria de runtime

1. Instalar as dependências conforme `package-lock.json` num ambiente controlado e rodar os comandos de validação abaixo.
2. Usar métricas de produção/homologação já existentes (Sentry, logs de performance do Supabase, Web Vitals e traces por endpoint) para ordenar frequência e latência. Não foi possível acessar esses painéis nesta sessão.
3. No banco de homologação, coletar planos de busca Marketplace, dashboard por parceiro, listagens ERP e criação de agendamentos em lote; executar `EXPLAIN (ANALYZE, BUFFERS)` somente em consultas de leitura e com volume representativo.
4. Medir imagens por rota no navegador e conferir se thumbnails/variantes existentes são servidos pelo R2/CDN.
5. Revisar chunk analysis do build para confirmar se bibliotecas de uso pontual já estão separadas pelo bundler.

## Validação executada

| Verificação | Resultado |
|---|---|
| Estado do Git antes da auditoria | Limpo; nenhuma alteração preexistente observada. |
| `npx tsc --noEmit` | Interrompido sem resultado: sem `node_modules`, o `npx` não concluiu localmente. |
| `npm test -- --run` | Não executou: `vitest` não está instalado/reconhecido. |
| `npm run build` | Não executou: `next` não está instalado/reconhecido. |
| `EXPLAIN` / `EXPLAIN ANALYZE` | Não executados: não há conexão/configuração de banco disponível; nenhuma escrita em banco foi realizada. |
| Fluxos Marketplace e ERP | Revisão estática parcial dos principais caminhos e migrations; não foi possível executar navegação autenticada ou fluxos de ponta a ponta. |

## Alterações nesta rodada

Somente este relatório foi adicionado. Nenhum código, policy RLS, migration, configuração de infraestrutura ou dado foi alterado. Os itens de maior impacto foram deixados como recomendações até que possam ser validados com dependências e métricas reais.
