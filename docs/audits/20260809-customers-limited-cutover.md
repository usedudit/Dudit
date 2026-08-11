# Fase 4.1 - cutover de consumidores limitados

Data: 2026-08-09. A migration de RLS de `customers` continua sem aplicação.

## Matriz de necessidades

| Consumidor | Consulta | Escrita | CPF/CNPJ | Dados sensíveis | Caminho após cutover |
|---|---|---|---|---|---|
| ERP customers | listagem/detalhe | criar, editar, arquivar, status | CPF/CNPJ na edição e deduplicação | somente em action autorizada | action + admin após RBAC |
| bucket/pickers | nome, email, telefone, avatar | não | não | básicos | action server-side |
| agendamentos | nome, email, telefone, avatar | não | não | básicos | loader server-side autorizado |
| orçamentos | busca e dados do cliente | criar/editar orçamento | não | básicos | action/listagem com admin após RBAC |
| importação | email e CPF para deduplicar | INSERT de clientes/endereço | sim, somente deduplicação | não retorna CPF | admin server-side; retorno limitado |
| birthday | nome e vínculo marketplace | notificação | não | nome básico | action com partner/customer canônicos |
| transactions | nome/email/telefone/endereço | não | não | contato básico | admin após `financial.view` |
| deliveries | nome/email/telefone/avatar/endereço de entrega | não | não | contato/endereço necessários à entrega | customer filtrado por partner após autorização |

## Regras aplicadas

- `partner_id` é derivado do contexto ativo autenticado.
- Um `partnerId` vindo do browser só é aceito como consistência; divergência gera
  `ForbiddenError`.
- `adminClient` é criado/usado somente depois de autenticação, contexto ativo e
  permissionamento RBAC.
- Criação e edição de clientes não dependem de `SELECT`/`RETURNING` na tabela
  operacional com o cliente RLS-bound.
- O insert principal retorna somente `id`.
- O importador de clientes usa admin server-side para deduplicação e batch
  insert, sem expor CPF descriptografado.
- O fallback browser de `lib/store-queries.ts` foi removido.
- A hidratação de clientes em deliveries inclui sempre `partner_id` como filtro
  adicional, mesmo que os pedidos já estejam escopados.

## Arquivo de autorização

`lib/services/authorized-customer-access.ts` centraliza:

- contexto ativo do parceiro;
- comparação contra argumento vindo do client;
- `requirePermission`;
- criação tardia do admin client;
- validação de ownership do customer antes de mutações.

## Validação

- `npm test`: 23 arquivos, 292 testes passaram.
- `npx tsc --noEmit`: passou.
- `scripts/simulate-customers-rls-rollback.mjs`: zero falhas, com rollback.
- A simulação cobre view própria, cross-tenant, membership inativa, parceiro
  desabilitado, exclusão de colunas PII, `security_barrier`,
  `security_invoker`, grants e imutabilidade de `partner_id`.

## Pendências antes da aplicação

- Validar os fluxos UI completos como operator/delivery em ambiente autenticado
  (criar/editar cliente, importação, agendamento, orçamento e detalhe de
  entrega).
- Reexecutar a mesma matriz após aplicar a migration em janela controlada.
- Revisar separadamente os helpers de `orders`/cancelamento marketplace que
  ainda possuem caminhos RLS-bound fora do cutover principal.
