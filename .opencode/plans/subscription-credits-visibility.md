# Créditos sempre visíveis + claridade do fluxo de produtos (v1: só vendedor registra)

## Contexto / problema
- A aba "Créditos" (ERP + marketplace) só lista linhas de `subscription_item_credits`. Se o ciclo ainda não concedeu crédito (manual, falha, ou crédito zerado/expirado filtrado), a aba aparece **vazia** — o vendedor/cliente não vê nem serviços nem produtos do plano e não entende o sistema.
- Produtos já têm fluxo completo (vendedor registra entrega no ERP → pedido R$0 com desconto total → baixa de estoque via reserve/finalize → consome crédito), mas está invisível quando não há linhas de crédito.
- Modelo aprovado pelo usuário: **só o vendedor registra** entrega/retirada de produto (não há agendamento de produto pelo cliente).

## Decisão
Aba de créditos = **itens do plano ∪ linhas de crédito** (merge no UI). Todo item contratado aparece sempre, com saldo `0/n` quando ainda não houver crédito liberado. Ações (Agendar / Registrar entrega) só quando `remaining > 0`.

## Alterações

### 1. ERP — `components/erp/recurring/SubscriptionDetailPage.tsx` (aba credits, ~889–951)
- `useMemo` `mergedCredits`:
  - Base: `detail.items` → `{ key: item.id, itemName: item.product?.name || item.service?.name || "Item", itemType, serviceId: item.service?.id || null, productId: item.product?.id || null, quantity: 0, consumed: 0, remaining: 0, expiresAt: null, staffPartnerUserId: null, durationMinutes: item.durationMinutes }`.
  - Agrega `detail.credits` por `serviceId`/`productId` (soma quantity/consumed/remaining; menor `expiresAt` não-nula; herda staff/duration quando houver).
  - Acrescenta créditos órfãos (sem item correspondente) no fim.
- Renderiza a lista merged (mesmo layout atual): badge tipo, pill `remaining/total`, validade só se houver crédito, `• X consumidos` se total > 0.
- Botões: serviço `remaining > 0` → "Agendar" (`openScheduleModal`); produto `remaining > 0` → "Registrar entrega" (`openDeliveryModal`). Quando `remaining === 0`: texto discreto "Sem saldo — libera no próximo ciclo".
- Empty state (mascote) só se plano sem itens **e** sem créditos.
- Modal de entrega: adicionar `InfoCard` no topo — "Registre a entrega ou retirada. Baixa o estoque e consome 1 crédito por unidade."

### 2. Marketplace — `components/marketplace/MySubscriptionDetailPage.tsx` (aba credits, ~917–976)
- Mesmo merge com `sub.items` (já tem `product`/`service` com name) + `credits` de `getMySubscriptionCreditsAction`.
- Serviço com saldo → "Agendar"; produto → texto "A loja registra a entrega" (sempre visível); saldo 0 → "Sem saldo — libera no próximo ciclo".
- Empty state só se plano sem itens e sem créditos.

### 3. Sem mudança de action/DB
- `detail.items` (ERP) já expõe `product`/`service` com id+name; `sub.items` (marketplace) idem. Merge é 100% no UI.

## Fora de escopo
- Agendamento/solicitação de produto pelo cliente (v2).
- Alterar gate `awaiting_restock`, política de expiração, ou checkout antigo.

## Verificação
1. `npx tsc --noEmit` → 0 erros.
2. `npm run test` → 601 testes passando.
3. Manual/DB (script pg, NODE_PATH node_modules): conferir linhas de `subscription_item_credits` da assinatura de teste `d651acec-91fb-4446-b43f-8b10c11eebb4` (service `6164d4fb…`); se o plano tiver item de produto, confirmar que aparece na aba com saldo 0/n.

## Arquivos
- `components/erp/recurring/SubscriptionDetailPage.tsx`
- `components/marketplace/MySubscriptionDetailPage.tsx`
