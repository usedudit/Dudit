# Proposta - RLS de `customers` alinhada ao RBAC

Status: proposta preparada para revisão. Nenhum SQL foi aplicado no Supabase.

## Restrição técnica

RLS do PostgreSQL controla linhas, não colunas. Uma policy de `SELECT` para a
role SQL `authenticated` não consegue liberar apenas alguns campos para
`operator` ou `delivery`. Por isso, esses perfis não devem receber leitura
direta da tabela operacional `customers`; devem usar projeções seguras.

A aplicação precisa migrar os consumidores diretos de `customers` dos perfis
limitados para as views/RPCs seguras antes de aplicar a migration. Caso
contrário, ERP/importação de `operator` pode deixar de funcionar.

## Matriz RBAC → acesso efetivo

| Perfil | SELECT base `customers` | SELECT seguro | INSERT | UPDATE | DELETE |
|---|---:|---|---:|---:|---:|
| owner | completo | opcional | sim | sim | sim |
| admin | completo | opcional | sim | sim | sim |
| manager | completo | opcional | sim | sim | sim |
| operator | não | `customers_operator_safe` | sim, via ação/RPC validada | sim, via ação/RPC validada | não |
| delivery | não | `customers_delivery_safe`, somente se houver consumidor | não | não | não |

Todas as decisões acima exigem, simultaneamente:

- `auth.uid()` autenticado;
- membership em `partner_users` com `is_active = true`;
- parceiro com `is_active = true`;
- `erp_disabled IS NOT TRUE` quando aplicável;
- `partner_id` derivado da associação autenticada;
- `partner_id` imutável em UPDATE.

## Projeções seguras propostas

`customers_operator_safe` retorna somente os campos necessários aos fluxos
operacionais atuais: `id`, `partner_id`, `name`, `email`, `phone`, `image_url`,
`status`, `person_type`, `store_credit` e `created_at`.

`customers_delivery_safe` retorna somente `id`, `partner_id`, `name`, `email`,
`phone` e `image_url`. Existe consumidor atual no detalhe de entrega
(`app/actions/erp/deliveries.ts`), que deve ser migrado para essa view antes da
aplicação; a projeção cobre exatamente os campos usados por esse fluxo.

CPF/CNPJ, notas, dados familiares, endereço completo, identificadores de
marketplace e demais campos internos não entram nessas projeções.

## Consumidores que exigem cutover antes da aplicação

- `app/actions/erp/client-loaders.ts`: leitura direta para bucket de clientes.
- `lib/store-queries.ts`: fallback browser direto em `customers`.
- `app/erp/agendamentos/page.tsx`: catálogo SSR direto.
- `lib/erp/import/batch-importer.ts`: leitura de e-mail/CPF para deduplicação.
- ações de clientes que usam `getSupabaseServerClient()` para membros operator.

PDV, marketplace e integrações que usam `adminClient` continuam funcionando,
desde que a autorização da ação permaneça antes da consulta administrativa.

## Grants propostos

- `anon`: remover todos os grants diretos de `customers`.
- `authenticated`: manter somente `SELECT`, `INSERT`, `UPDATE` e `DELETE`;
  remover `TRUNCATE`, `REFERENCES` e `TRIGGER`.
- `service_role`: preservar o acesso usado pelas ações server-side e jobs.

Os grants das views seguras devem ser somente para `authenticated`; nenhum
fluxo público deve consultar dados de `customers` diretamente.

## Critérios de aprovação

Antes da aplicação, os testes devem comprovar isolamento entre parceiros,
membership ativa, parceiro habilitado, matriz de cada perfil, imutabilidade de
`partner_id`, ausência de PII nas views seguras e compatibilidade dos fluxos
ERP, PDV, agendamento, importação, marketplace e server-side.
