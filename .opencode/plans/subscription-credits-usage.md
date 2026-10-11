# Créditos de assinatura utilizáveis: agendamento de serviços + entregas parciais de produtos

## Como sistemas reais funcionam (resumo da pesquisa)

Existem 3 modelos reais de assinatura com fulfillment:

1. **Box fixo** (HelloFresh, Amazon Subscribe & Save): a cada ciclo o sistema gera UM pedido com a quantidade completa e entrega de uma vez. Sem parciais.
2. **Carteira de créditos / entitlement** (ClassPass, academias "10 aulas por mês", clubes): o cliente tem N créditos por período, usa quando quiser dentro da janela, cada uso consome 1 crédito, saldo zera/expira no fim do período. **Este é o modelo que o Dudit já usa para serviços** (`subscription_item_credits` + RPC `consume_credits_fifo`).
3. **Leiteiro / jornal / clube do pão**: vendedor define agenda OU cliente retira/entrega parcialmente dentro da janela de entitlement; cada saída debita o saldo; cobrança é mensal e separada do fulfillment. **Este é o modelo do exemplo dos 18 pães** — é o modelo 2 estendido a produtos.

Conclusão: o modelo correto para o Dudit é **unificar serviços e produtos no modelo de créditos/entitlement por ciclo** (serviços já funcionam assim; produtos precisam estender o mesmo sistema). O pedido automático do ciclo vira **somente registro financeiro da cobrança**; estoque e logística passam a acontecer nos pedidos de entrega/agendamento criados com créditos.

Decisão: ciclo só cobra, entregas baixam estoque.

## Estado atual (fatos do código)

- `subscription_item_credits` já tem coluna `product_id` (nullable) — `migrations/20260711_create_subscription_credits_and_items_tables.sql:52-53`; ledger também.
- `grantSubscriptionCredits` só concede para `item_type === 'service'` — `lib/services/credit.service.ts:37`.
- RPC `consume_credits_fifo(p_partner_id, p_customer_id, p_service_id, ...)` é keyed só por serviço — `migrations/20260711_add_consume_credits_fifo.sql:3-73`.
- Único consumo real hoje: checkout marketplace com `paymentMethod === "Assinatura (Créditos)"` → pedido R$0 `situation=paid` → fulfillment cria agendamento e consome créditos, **resolvendo serviço por NOME e ignorando o resultado do consume** — `lib/services/marketplace-checkout-fulfillment.ts:1071-1102`.
- `MySubscriptionDetailPage` (marketplace) **não tem seção de créditos**; aba de créditos da lista (`MySubscriptionsClient.tsx:441-486`) é read-only, sem CTA.
- ERP `SubscriptionDetailPage` aba "Créditos de Serviço" é read-only — `components/erp/recurring/SubscriptionDetailPage.tsx:751-800`.
- Pedido automático do ciclo: `createRecurringOrder` (`lib/services/recurring-execution.service.ts:127-360`) cria pedido com TODOS os itens (produtos+serviços), reserva/baixa estoque dos produtos no início do ciclo (331-357).
- F108: pedido `paid` com `paid_amount <= 0` **não** gera transação financeira — `migrations/f108_create_order_transaction_trigger.sql:38-40`. Pedidos R$0 não duplicam receita.
- Slot de atendimento: `isStaffSlotAvailable` (`lib/commerce/scheduling-availability`) e `getPublicAvailableTimeSlots` (`app/actions/marketplace/services.ts:297`) já existem.
- Refund de créditos já dispara em cancelamento de agendamento ERP e de pedido — `app/actions/erp/appointments.ts:1407,1523`, `lib/services/sync-cancellation.ts:52-57`.

## Modelo alvo

### Serviços (cliente agenda com crédito)
1. Cliente abre detalhe da assinatura → aba "Créditos" → vê saldo por serviço com validade (fim do ciclo).
2. Clica "Agendar" → modal: data (limitada a hoje..validade do crédito), horário (slots públicos do staff), profissional (se múltiplos), observações.
3. Server action cria: pedido R$0 (`payment_method="Assinatura (Créditos)"`, `situation="paid"`, `order_source="Assinatura"`, `recurring_subscription_id`, notes "já coberto pela assinatura") + agendamento vinculado (com `service_id` preenchido!) + consome 1 crédito (idempotência, **checa resultado**, rollback do pedido/agendamento se falhar).
4. Vendedor (ERP) agenda o mesmo jeito pelo detalhe da assinatura (espelho partner-scoped).

### Produtos (vendedor registra entrega/retirada parcial com crédito)
1. Cada ciclo concede créditos de produto (quantidade do item do plano) junto dos de serviço.
2. No detalhe da assinatura (ERP), aba Créditos: para cada produto com saldo, botão "Registrar entrega" → modal com quantidade (≤ saldo), tipo (entrega ou retirada), observações.
3. Server action cria: pedido R$0 com os itens (preços reais, `total_amount=0`, `paid_amount=0`, `discount_value`=soma, `payment_method="Assinatura (Créditos)"`, `order_source="Assinatura"`, endereço/tipo da assinatura) + **baixa estoque** (reserve+finalize) + consome créditos de produto (FIFO) com idempotência e resultado checado.
4. Entrega segue o fluxo normal (delivery_status `not_sent` → módulo de entregas; pickup nasce `delivered`).
5. Saldo zera no período; próximo ciclo nova concessão. `expireObsoleteCreditsGlobally` já expira restos.

### Pedido automático do ciclo (mudança de semântica)
- `createRecurringOrder` continua criando o pedido de cobrança com todos os itens (valor financeiro do ciclo), mas **não reserva/baixa mais estoque dos itens de produto** (linhas viram financeiras). Gate `checkStockAvailability`/`awaiting_restock` do ciclo permanece como está (v1).
- Rationale: estoque passa a mover só nos pedidos de entrega; sem isso há baixa dupla (ciclo + entrega).

### Clareza "veio da assinatura, sem cobrança"
- Pedido: `payment_method="Assinatura (Créditos)"` + `order_source="Assinatura"` + notes.
- `MyOrderDetailPage`: badge "Vindo da assinatura X — sem cobrança adicional" quando `recurring_subscription_id` presente.
- ERP `OrderDetailView` `getSourceSubtitle()`/detecção de origem (`:862-911`): novo caso "Assinatura" com nome do plano.
- Agendamento: notes "Agendado via créditos da assinatura <plano>".

## Alterações por arquivo

### Migration (nova)
- `migrations/<ts>_extend_credits_for_products.sql`:
  - `CREATE OR REPLACE FUNCTION consume_credits_fifo(..., p_product_id UUID DEFAULT NULL)`: WHERE por `service_id = p_service_id` OU `product_id = p_product_id` (backward compat com chamadas existentes por p_service_id).
  - Novo índice `idx_sub_item_credits_lookup_product (customer_id, product_id, expires_at)`.

### `lib/services/credit.service.ts`
- `grantSubscriptionCredits`: incluir itens `item_type === 'product' && product_id` (gravando `product_id`, `service_id=null`) — hoje filtra só service (`:37`).
- `consumeSubscriptionCredits`: aceitar `serviceId` **ou** `productId`; passar `p_product_id` ao RPC.

### `lib/services/recurring-execution.service.ts`
- `createRecurringOrder`: para `productItems`, manter linhas financeiras mas **pular** `reserveOrderInventory`/`finalizeOrderInventory` (`:331-357`) — comentário explicando que estoque move nos pedidos de entrega com créditos. Serviços inalterados.

### `lib/services/marketplace-checkout-fulfillment.ts`
- Bloco de consumo do checkout (`:1071-1102`): resolver serviço por `service_id` do item (fallback nome), **checar `{success}`** do consume (logar erro se falhar).

### `app/actions/marketplace/recurring-subscriptions.ts`
- `bookServiceWithCreditAction({ subscriptionId, serviceId, staffId, date, time, notes? })`:
  1. user auth → customers por user_id; subscription ativa pertencente ao customer;
  2. crédito com saldo > 0 e não expirado para (customer, serviceId); validade da data: `date <= expires_at` (fallback `next_execution_at`);
  3. `isStaffSlotAvailable` → erro claro se ocupado;
  4. cria pedido R$0 (campos acima, buyer/user, store da assinatura) + order_items (line_type `service_booking`, unit_price 0, service_id);
  5. cria agendamento (status "Confirmado", `service_id`, staff, data/hora, price 0, `marketplace_order_id`, source marketplace, notes);
  6. `consumeSubscriptionCredits` com `orderId`+`appointmentId`, idempotency `sub-credit-book:<orderId>`; se falhar → cancela pedido + apaga agendamento, retorna erro;
  7. retorna `{ success, orderId, appointmentId }`.

### `app/actions/erp/recurring-subscriptions.ts`
- `getRecurringSubscriptionDetailAction`: mapear créditos com produto (`productId`, `productName`) além de serviço (`:415-424`).
- `scheduleSubscriptionServiceAction(partnerId, subscriptionId, {...})`: espelho partner-scoped do booking (mesmos passos 2-6).
- `createSubscriptionDeliveryOrderAction(partnerId, subscriptionId, items[{productId, variantId?, quantity}], deliveryType?, notes?)`:
  1. subscription ativa do partner;
  2. valida saldo de crédito de produto por item (não expirado, consumido+qtd ≤ total);
  3. cria pedido R$0 (itens com preço real, total/paid 0, discount=soma, endereço/tipo/store da assinatura, buyer do customer);
  4. consome créditos (FIFO por product, idempotency `sub-credit-delivery:<orderId>`, checa resultado; falha → apaga pedido);
  5. `reserveOrderInventory` + `finalizeOrderInventory` (baixa física);
  6. retorna `{ success, orderId, orderNumber }`.

### UI marketplace — `components/marketplace/MySubscriptionDetailPage.tsx`
- Nova tab "Créditos" (tabs details/notes/history → +credits): lista créditos da assinatura (serviços + produtos) com saldo/validade.
  - Serviço com saldo → botão "Agendar" → `DefaultModal` (input date com max=validade, select de horário via `getPublicAvailableTimeSlots`, select staff se >1, textarea obs) → `bookServiceWithCreditAction` → toast + link "Ver pedido".
  - Produto com saldo → texto "Disponível para entrega/retirada — a loja registra a entrega" (read-only v1).
- `getMySubscriptionCreditsAction`: adicionar filtro opcional por `subscriptionId`.

### UI ERP — `components/erp/recurring/SubscriptionDetailPage.tsx`
- Aba "Créditos de Serviço" → "Créditos":
  - Cards de serviço com saldo: botão "Agendar" → modal (data/hora/staff/obs) → `scheduleSubscriptionServiceAction`.
  - Cards de produto com saldo: botão "Registrar entrega" → modal (qty input com max=saldo, tipo entrega/retirada, obs) → `createSubscriptionDeliveryOrderAction` → toast com nº do pedido.

### Badges de clareza
- `components/marketplace/MyOrderDetailPage.tsx`: quando `recurring_subscription_id`, badge "Vindo da assinatura <plano> — sem cobrança adicional" na seção de pagamento.
- `components/erp/orders/OrderDetailView.tsx`: `getSourceSubtitle`/detecção de origem ganham caso "Assinatura".

## Fora de escopo (v1)
- Cliente criar entregas de produto por conta própria (só vendedor registra).
- Agenda automática de produtos ("toda segunda") — fase 2 usando o mesmo crédito.
- Validação server-side completa do checkout "Assinatura (Créditos)" existente (débito de saldo no `checkoutCartAction`) — follow-up de segurança, não bloqueia este fluxo novo.
- Mudança do gate `awaiting_restock` do ciclo.

## Verificação
- `npx tsc --noEmit` → 0 erros.
- `npm run test` → baseline 598 pass.
- Manual: assinatura de teste `d651acec` (serviço "crote teste", 2 créditos) → agendar 1 crédito com data dentro da janela → pedido R$0 + agendamento criados, saldo 1; data fora da janela → erro; ERP → registrar entrega de produto (adicionar item de produto ao plano de teste antes) → pedido R$0 + estoque baixado + saldo decrementado; cancelar agendamento → refund de crédito.
