# Auditoria residual de `customers` antes do cutover RLS

Data: 2026-08-09  
Escopo: Fase 4.1, validação final antes de aplicar `20260807_proposed_customers_rbac_rls.sql`.

## Conclusão

Nenhuma migration foi aplicada. A auditoria residual não encontrou um caminho de produção que entregue `SELECT` direto de `customers` a operator/delivery por cliente RLS-bound.

Foram corrigidos quatro grupos de risco antes da simulação final:

- cancelamento marketplace usava o cliente RLS-bound para sincronizar créditos de comprador sem `partner_users`;
- `buyer_id` era usado como se sempre fosse `customers.id`;
- vendas, orçamentos, devoluções e ordens de serviço aceitavam `customerId` do payload sem confirmar `customers.partner_id`;
- hidratações de cliente em pedidos/devoluções tinham filtros de parceiro incompletos.

## Consumidores residuais e autorização

| Fluxo | Cliente usado | Validação antes de admin/consulta | Dependência direta de SELECT para operator/delivery |
|---|---|---|---|
| ERP orders create/update | `createAdminClient()` | `requirePermission` + `customerId` com `id + partner_id` | Não; cliente é validado e usado apenas no contexto autorizado |
| ERP order detail/history | `createAdminClient()` | permissão de orders + pedido filtrado por `partner_id` | Não; hidratação é server-side, limitada aos campos da tela |
| Marketplace checkout | admin para projeção operacional | linhas do carrinho resolvem `partnerId` e cliente canônico | Não; comprador não depende de membership ERP |
| Marketplace cancelamento | RLS para buscar/atualizar o pedido; admin só após ownership | usuário autenticado + `order.buyer_id = user.id`; `partner_id` vem do pedido | Não |
| Sync de cancelamento | admin em todos os call sites de produção | chamado depois da autorização do pedido/retorno; helper exige pedido com `partner_id` | Não |
| Créditos de cliente | admin/RPC conforme o fluxo | `customer_id` canônico; queries de saldo e créditos filtram `partner_id` | Não |
| Returns/cancelamentos ERP | `createAdminClient()` | permissão de orders + request/order filtrados por parceiro; `data.customerId` validado | Não |
| Orçamentos | RLS para quote + admin somente para validar cliente | permissão de quotes + `customerId` com `id + partner_id` | Não |
| Ordens de serviço | `getAdminClient()` | permissão de service orders + `customer_id` com `id + partner_id` | Não |
| Delivery | admin nos detalhes já escopados | contexto ativo do parceiro + escopo do pedido | Não há SELECT direto de `customers` para delivery |
| `lib/store-queries.ts` | action server-side | fallback browser direto removido | Não |
| `CustomerService` genérico | RLS-bound | exportado, mas sem consumidores encontrados no código | Nenhum consumidor atual identificado |

### Marketplace sem `partner_users`

O comprador marketplace não é tratado como membro ERP. O cancelamento primeiro lê o pedido pelo cliente autenticado e confirma ownership. Só então usa admin para efeitos colaterais. O sincronizador resolve `order.customer_id`; para pedidos legados, tenta `marketplace_user_id` dentro do mesmo `partner_id`. Nunca usa `buyer_id` diretamente como `customers.id` sem essa resolução.

## Riscos eliminados

- leitura/alteração de saldo de cliente de outro parceiro por `customerId` arbitrário;
- associação de pedido, orçamento, devolução ou OS a cliente de outro parceiro;
- falha do cancelamento marketplace após remover SELECT de `customers` para buyer sem membership;
- atualização de customer durante hidratação sem filtro de parceiro;
- sincronização de appointments/transactions fora do `partner_id` do pedido.

## Matriz antes/depois

| Perfil | Antes do cutover | Depois do cutover proposto | Resultado da simulação |
|---|---|---|---|
| owner/admin/manager | CRUD direto da tabela no próprio parceiro | CRUD direto, membership ativa e parceiro ativo; `partner_id` imutável | Passou own CRUD; cross-tenant bloqueado |
| operator | leitura ampla dependente de policy permissiva; escrita operacional | sem SELECT base; view segura + actions server-side para leitura/escrita | base SELECT bloqueado; view própria funciona; INSERT policy passa |
| delivery | acesso amplo potencial à tabela | somente view segura, sem PII interna | base SELECT bloqueado; view própria funciona |
| usuário inativo | risco dependente da combinação de policies | bloqueado por membership ativa | view bloqueada |
| parceiro desabilitado | risco dependente de policy | bloqueado pelo parceiro ativo | view bloqueada |
| comprador marketplace | sem `partner_users`; dependia de ações server-side | pedido/ownership primeiro; admin somente após validação | fluxo não depende de RLS de customers |

## Validações realizadas

- `npm test`: 23 arquivos, 299 testes aprovados.
- `npx tsc --noEmit`: aprovado, sem erros.
- `node scripts/simulate-customers-rls-rollback.mjs`: zero falhas; migration aplicada somente dentro de transação e revertida.
- A simulação confirmou own/cross-tenant CRUD, `partner_id` imutável, views seguras, membership inativa, parceiro desabilitado e grants.
- `node --check` dos scripts de auditoria: aprovado.
- `git diff --check`: sem erros de whitespace.
- Fluxos UI de operator/delivery: validação manual informada pelo usuário, aprovada.

O harness live `scripts/audit-customers-rls.mjs` não produziu uma conclusão live final porque os fixtures obrigatórios de operator/delivery/inativo/parceiro desabilitado não estão configurados no ambiente (`RLS_TEST_*`). Isso não altera a simulação transacional, mas deve ser resolvido antes da aplicação real.

## Preparação para aplicação controlada

A migration está pronta para revisão/aplicação, mas permanece pendente. Antes do apply real:

1. configurar os fixtures `RLS_TEST_*` e executar o harness live;
2. revisar o diff da migration e confirmar que não houve mudança estrutural fora do escopo;
3. aplicar em janela controlada, registrar o snapshot de policies/grants antes/depois;
4. validar marketplace, sitemap, busca, ERP, PDV, importação, agendamento, pedidos, devoluções e buyer marketplace;
5. monitorar erros de `customers_operator_safe`, `customers_delivery_safe`, cancelamento e créditos.

Nenhuma etapa acima foi aplicada neste diagnóstico.
