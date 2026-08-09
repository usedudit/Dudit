# Inventário de consumidores de `customers`

Validação de compatibilidade realizada em 2026-08-07. Nenhuma migration foi
aplicada. A lista abaixo separa acesso ao banco de componentes que apenas
consomem actions/loaders.

## Acesso direto RLS-bound

Estes módulos usam `getSupabaseServerClient()` ou recebem esse cliente e
dependem da policy da tabela:

| Módulo | Fluxo | Perfis relevantes | Impacto da proposta |
|---|---|---|---|
| `app/actions/erp/customers.ts` | criar, editar, arquivar, desarquivar, status, listagem, CPF e créditos | owner/admin/manager/operator | operator quebra sem cutover; criação usa `.select().single()` |
| `app/actions/erp/client-loaders.ts` | bucket de clientes ERP | owner/admin/manager/operator | operator quebra; precisa view segura |
| `app/erp/agendamentos/page.tsx` | catálogo de clientes para agendamento | owner/admin/manager/operator | operator quebra; precisa view segura |
| `lib/erp/import/preview.ts` | preview/deduplicação | owner/admin/manager/operator | operator quebra; CPF/e-mail precisam ação segura |
| `lib/erp/import/batch-importer.ts` | deduplicação e INSERT de clientes | owner/admin/manager/operator | operator quebra no SELECT e no retorno do INSERT |
| `app/actions/erp/birthday.ts` | consulta para notificação de aniversário | owner/admin/manager/operator | operator quebra na leitura |
| `app/actions/erp/quotes.ts` | busca de cliente para orçamento | owner/admin/manager/operator | operator quebra na busca |
| `app/actions/erp/recurring-transactions.ts` | nomes de clientes em transações | perfis com `financial.view`, incluindo operator | operator quebra |
| `app/actions/erp/transactions.ts` | cartões de contato e lookup financeiro | perfis com `financial.view`, incluindo operator | revisar chamadas RLS-bound; algumas buscas já usam admin |
| `app/actions/erp/orders.ts` | crédito de cliente e helpers de cancelamento | perfis com `orders` | helpers RLS-bound precisam cliente admin/ação validada |
| `lib/services/customer.service.ts` | serviço genérico CRUD | caller não encontrado no código atual | contrato inseguro se reutilizado por operator |
| `app/actions/erp/deliveries.ts` | detalhes de entrega hidratados com cliente | delivery | precisa usar `customers_delivery_safe` |
| `app/actions/shared/coupons.ts` | escopo de clientes de cupons | owner/admin/manager; operator não tem coupons | sem impacto para operator |
| `app/actions/shared/promotions.ts` | escopo de clientes de campanhas | owner/admin/manager; operator não tem coupons | sem impacto para operator |
| `lib/services/sync-cancellation.ts` | estorno de crédito em cancelamento | comprador marketplace e ERP | comprador marketplace não é membership; precisa admin após ownership do pedido |
| `app/actions/marketplace/orders.ts` | cancelamento pelo comprador, via `sync-cancellation` | usuário marketplace | risco de regressão sem cutover |

## Acesso `adminClient`/service-role, sem dependência de RLS

Esses fluxos já usam contexto administrativo e não dependem das policies de
`customers`, mas continuam exigindo validação da action antes do adminClient:

- `app/actions/erp/pdv.ts`: carga inicial, cliente rápido, detalhes e endereço;
- `app/actions/erp/orders.ts`: detalhes de pedido e rotinas ERP principais;
- `app/actions/erp/returns.ts`: detalhes e resolução de devoluções;
- `app/actions/erp/service-orders.ts`: snapshot de cliente;
- `app/actions/erp/transactions.ts`: maioria das consultas financeiras;
- `app/actions/marketplace/cart.ts`: identificação de cliente e crédito do marketplace;
- `app/actions/marketplace/recurring-subscriptions.ts`: cliente do usuário marketplace;
- `app/api/marketplace/customer-reviews/route.ts`;
- `lib/data/customers.ts` e `lib/data/orders.ts`;
- `lib/data/reports/clientes.ts`;
- `lib/erp/export/index.ts` e `lib/erp/export/fetchers/customers.ts`;
- `lib/services/marketplace-customer.ts`;
- `lib/services/account-deletion.service.ts`;
- `lib/services/notification.service.ts` e `notification-resolver.service.ts`;
- `lib/services/subscription-archiver.service.ts`;
- `lib/services/recurring-execution.service.ts`;
- `lib/services/whatsapp-automation.service.ts`.

## Acesso browser

`lib/store-queries.ts` possui fallback em `supabaseBrowser.from('customers')`.
Ele é alcançado quando `getPartnerCustomersAction` falha. Antes da migration,
esse fallback precisa usar a projeção segura ou ser removido; caso contrário,
`operator` continuará tentando consultar a tabela operacional diretamente.

## Componentes/telas que dependem indiretamente

- ERP clientes: `CustomersPage`, `CustomerDetailPage`, `NewCustomerPage`;
- PDV: `POSPage` e seletores de cliente;
- agendamentos: catálogo SSR e `AppointmentSheet`;
- orçamentos: `CreateQuote`, `QuoteDetail`, `QuotePrintModal`;
- pedidos/vendas: `CreateOrder` e detalhes;
- cupons/campanhas: `CouponsPage`, `CouponFormPage`, telas de promoções;
- devoluções, transações e ordens de serviço;
- logística: `DeliveryDetailPage`;
- relatórios e exportação.

Esses componentes não devem ser tratados como consumidores SQL separados: a
dependência passa pelas actions/loaders listadas acima.

## Partner migration

Não foi encontrado UPDATE de `customers.partner_id` em actions, importadores,
batch jobs ou serviços. Os fluxos atuais fazem INSERT com `partner_id`; o
update de cliente exclui explicitamente esse campo. O trigger de imutabilidade
não bloqueia um fluxo legítimo identificado.

## Grants

Não foi encontrado código ou migration que conceda/execute `TRUNCATE`,
`REFERENCES` ou `TRIGGER` em `customers` para `anon`/`authenticated`.
As ocorrências de `REFERENCES customers(id)` são foreign keys criadas pelo
schema, não uso do grant por usuários de aplicação. Os triggers existentes
são criados durante migrations por owner/postgres.
