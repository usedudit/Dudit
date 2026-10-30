# Auditoria de segurança do Dudit — registro de andamento

**Data do registro:** 29/10/2026  
**Status:** em andamento; este documento registra o ponto de retomada, não uma aprovação para lançamento.  
**Escopo solicitado:** auditoria ampla do código, banco/RLS, autenticação, autorização, APIs, operações críticas, dependências, configuração e testes, seguida das correções seguras comprovadas.

## Resumo do estado

- Foram encontradas e corrigidas falhas de autorização na alteração de papéis de equipe e em operações de associação de membros a lojas/parceiros. Foi criada uma migration para reforçar o isolamento de `store_members` no banco.
- Foi corrigida a revalidação de cache de permissões após mudanças de acesso.
- Durante a validação de build foi encontrada uma incompatibilidade com Next.js 16: um módulo `"use server"` exportava uma função síncrona. A função pura foi movida para um módulo comum.
- Os testes focados das correções passaram. A suíte completa ainda teve duas falhas nos testes de exclusão de conta por falta de configuração de `TRIGGER_SECRET_KEY`; os fixtures foram ajustados e os testes focados passaram depois disso. A suíte completa não foi repetida.
- `npm audit` não reportou vulnerabilidades em dependências (incluindo a auditoria de produção). O TypeScript passou antes das últimas alterações, portanto precisa ser executado novamente.
- O build ainda precisa ser repetido. O usuário pediu para executar build e TypeScript depois por conta própria. Lint não estava disponível: não há script no `package.json` nem executável ESLint em `node_modules/.bin`.
- No registro original, a migration não havia sido aplicada. A checagem em 30/10 encontrou `store_members` e a função `can_manage_store_member` no schema exposto pelo Supabase configurado, indicando que a migration está aplicada nesse projeto. O ambiente exato e as policies efetivas ainda não foram confirmados.

## Achados confirmados e correções feitas

### 1. Escalada de privilégio ao alterar papel de membro da equipe — corrigido no código

**Evidência:** `updateTeamMemberRole` em `app/actions/erp/team.ts` aceitava o novo papel vindo da chamada da Server Action sem validar se o papel era válido/atribuível pelo ator nem se o ator podia modificar o papel atual do alvo.

**Correção:** validação do papel com `ALL_ROLES`, das regras de atribuição com `canUserInviteRole` e do alvo com `canModifyUser`. Isso impede, por exemplo, que um gerente atribua papéis administrativos ou altere membros fora de sua alçada.

**Cobertura adicionada:** `lib/permissions/partner-roles.security.test.ts` cobre os limites de atribuição por gerente, a impossibilidade de atribuir `owner` e a hierarquia de modificação.

### 2. Cache de permissões podia manter acesso antigo após revogação — corrigido

**Evidência:** `revalidateUserAccess` em `lib/utils/revalidation.ts` usava revalidação com janela de stale-while-revalidate, permitindo que uma permissão antiga continuasse em cache após uma alteração de acesso.

**Correção:** a invalidação agora expira imediatamente a tag de acesso (`revalidateTag(tag, { expire: 0 })`).

### 3. Falta de validação do vínculo loja/parceiro em operações de membros — corrigida no código; reforço RLS preparado

**Evidência:** operações em `app/actions/erp/store-members.ts` e resolução em `lib/store-members.ts` podiam aceitar combinações de identificadores sem provar que a loja pertencia ao parceiro informado, e algumas consultas de associação não escopavam simultaneamente pelo alvo, parceiro e loja.

**Correção no código:** validação de pertencimento de loja e usuário ao parceiro; escopo da associação pelo `store_id`; validação de que o usuário-alvo pertence ao parceiro; validação da hierarquia de papéis; restrição de permissões personalizadas a `owner`/`admin`; exigência de vínculo e permissão para listar lojas de outro usuário; e validação dos IDs de lojas no salvamento de acesso.

**Banco:** criada `migrations/20261029_harden_store_member_tenant_scope.sql`, com helper `SECURITY DEFINER` de escopo restrito (incluindo `search_path` explícito e grants limitados) e substituição das policies de leitura/escrita de `store_members` para validar o vínculo loja/parceiro e a regra de papéis.

**Estado em 30/10/2026:** a API de schema do Supabase configurado lista `store_members` e `can_manage_store_member`, objetos criados pela migration, então ela aparenta estar aplicada nesse projeto. Não foi possível confirmar o ledger, o nome do ambiente ou as policies efetivas; a chave pública local está inválida e a conexão Postgres rejeitou o certificado TLS. Nenhum dado de aplicação foi lido.

### 4. Export síncrono em módulo de Server Actions incompatível com Next.js 16 — corrigido no código

**Evidência:** `app/actions/erp/order-financial-breakdown.ts` tinha `"use server"` e exportava `calculateOrderFinancialBreakdown`, função síncrona. O build apontou a restrição de Server Actions.

**Correção:** cálculo e tipos foram extraídos para `lib/payments/order-financial-breakdown.ts`; a action permanece assíncrona e importa o helper puro. Imports foram ajustados em `components/erp/orders/OrderDetailView.tsx` e `lib/payments/order-financial-breakdown.test.ts`.

### 5. Configuração ausente nos testes de exclusão de conta — fixtures corrigidos

**Evidência:** dois testes da suíte completa falharam porque o serviço fecha a operação com segurança quando `TRIGGER_SECRET_KEY` não está configurada no ambiente de teste.

**Correção de teste:** `lib/services/account-deletion.service.test.ts` e `lib/services/account-deletion.e2e.test.ts` agora configuram a chave no teste, simulam a chamada de `@trigger.dev/sdk/v3` e restauram o ambiente após cada teste. Isso corrige o setup dos testes; não é evidência de que a infraestrutura Trigger está configurada em produção.

## Validações já realizadas

| Verificação | Resultado observado | Limite |
|---|---|---|
| `npx tsc --noEmit` | Passou uma vez | Executado antes da extração final do helper de cálculo e de alterações posteriores; repetir ao retomar. |
| Testes focados | 4 arquivos, 18 testes passaram | Incluíram helper financeiro, exclusão de conta e teste de papéis. |
| Suíte completa (execução sequencial) | 821 passaram; 2 falharam | Falhas relacionadas à configuração ausente de `TRIGGER_SECRET_KEY`; fixtures ajustados depois, sem nova execução completa. |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilidades de produção reportadas | Estado observado no momento da auditoria. |
| `npm audit --audit-level=high` | 0 vulnerabilidades reportadas | Estado observado no momento da auditoria. |
| Build | Primeira tentativa terminou por falta de memória; segunda chegou à compilação e encontrou o export síncrono acima | Código foi corrigido depois; build não foi repetido. O usuário fará build posteriormente. |
| Lint | Não executado | `package.json` não define script de lint e não foi encontrado ESLint em `node_modules/.bin`. |
| `git diff --check` | Sem erros de whitespace nos arquivos verificados | Não representa revisão final do diff completo. |
| RLS em banco | Não executado | Sem aplicação/ambiente de integração disponível nesta etapa. |

## Revisão iniciada, ainda inconclusiva

Foi iniciada a leitura dos fluxos de pagamento Mercado Pago, especialmente:

- `app/api/mercadopago/process-erp-payment/route.ts`
- fluxo relacionado a `create-preference` e `PaymentModal`

O endpoint de processamento já verificava autenticação, CSRF, limite de requisições, assinatura/quote com usuário, parceiro e valor máximo, além do vínculo do pedido com o parceiro. A retomada confirmou falhas de autorização e de limite de valor descritas abaixo. A revisão dos efeitos de confirmação e sua reconciliação com o webhook ainda está pendente.

### Atualização em 30/10/2026 — permissão de cobrança ERP

**Achado confirmado:** `process-erp-payment` autorizava qualquer usuário com linha ativa em `team_members`, sem verificar a permissão RBAC para alterar pedidos. O RBAC atual é resolvido por `partner_users`/contexto e permissões por papel; por exemplo, o papel `DELIVERY` não pode criar nem editar pedidos. A verificação de vínculo permitia que um membro sem permissão de edição tentasse criar uma cobrança Mercado Pago.

**Correção aplicada:** o endpoint agora exige `orders.edit` via `checkPartnerPermission` antes de emitir a cobrança. O lookup em `team_members` foi removido. A consulta do parceiro continua apenas para confirmar existência e obter dados relacionados.

**Achado relacionado:** `app/api/orders/retry-payment/route.ts` também aceitava membros da equipe por `requirePartnerAccess` simples, sem testar o papel. A via do comprador permanece permitida para recuperar o próprio pagamento; a via de equipe agora exige `orders.edit`.

**Achado confirmado — valor acima do saldo:** para `orderId` existente, o endpoint recusava pedidos quitados, mas permitia cobrar qualquer valor até o máximo da quote mesmo se ele excedesse o saldo pendente. Também não falhava fechado se o ID não pertencesse ao parceiro. A requisição agora retorna 404 se não resolver um pedido daquele parceiro, recusa pedidos sem saldo e limita a cobrança ao saldo restante calculado por `total_amount - paid_amount` (com `amount_paid` como fallback).

**Validação:** revisão estática do fluxo e do modelo de permissões; sem execução de testes ou build nesta retomada.

### Continuação em 30/10/2026 — escopo do pedido e idempotência ERP

**Achado confirmado:** a autorização ERP para cobrar um pedido verificava `orders.edit` no parceiro, mas não resolvia a permissão efetiva da loja associada ao pedido. Um usuário com acesso mais restrito por loja poderia tentar cobrar um pedido de outra loja do mesmo parceiro.

**Correção aplicada:** pedidos com `store_id` agora também exigem `orders.edit` efetivo naquela loja. As cotações assinadas podem carregar o ID do pedido e o endpoint de processamento exige que esse vínculo corresponda ao `orderId` recebido; os fluxos de cobrança do modal ERP enviam esse contexto.

**Cobertura relacionada:** a mesma permissão efetiva da loja foi acrescentada ao fluxo de recuperação de pagamento quando a chamada parte de um membro da equipe. A via do comprador continua limitada ao próprio pedido.

**Achado confirmado:** a chave de idempotência antiga dependia somente de parceiro, valor e janela de 30 segundos. Cobranças diferentes do mesmo valor pelo mesmo parceiro nesse intervalo podiam colidir e reutilizar a resposta de pagamento.

**Correção aplicada:** a chave agora deriva de parceiro, usuário, pedido, valor e token da cotação, preservando a mesma chave em repetição da mesma intenção e separando cotações distintas.

**Validação de entrada:** `partnerId`, `orderId` e `amount` agora também são validados quanto ao tipo/formato esperado antes de chegar à autorização e à criação da cobrança.

**Validação:** inspeção estática dos chamadores e do fluxo de cotação; `git diff --check` passou. Sem testes, TypeScript ou build.

### Webhook Mercado Pago — concorrência de pagamentos parciais

**Achado confirmado por inspeção estática:** `processWebhookWithRetry` é iniciado de forma assíncrona por cada notificação; a confirmação aprovada lia `paid_amount` e `payment_breakdown`, calculava o novo estado em memória e atualizava o pedido apenas por `id`. Duas aprovações distintas da mesma ordem podiam calcular sobre o mesmo saldo e a última gravação sobrescrever o ledger da primeira. A rotina também ignorava pedidos já marcados como pagos, descartando uma aprovação distinta válida.

**Correção aplicada:** cada aprovação atualiza o pedido por compare-and-swap usando `updated_at` e o snapshot de `payment_breakdown`; quando outra notificação ganha a corrida, o handler relê o estado e tenta reconciliar novamente, até oito tentativas. Cada leg inclui `mpPaymentId`, permitindo deduplicação por cobrança e não apenas pelo pedido. A verificação da aprovação considera a autorização gravada em metadata pelo servidor (pedido, parceiro e valor da intenção), para que duas cobranças parciais válidas não sejam confundidas com fraude após o saldo mudar. Metadados foram adicionados aos fluxos de pagamento, preferência e ERP; cobranças ERP ligadas a um pedido agora usam o ID do pedido como referência externa. O fluxo de preferência que recebe `paymentOrderId` valida ordem, parceiro e permissão de loja/parceiro, e usa esse mesmo pedido na cotação, metadata e referência externa.

**Proteções relacionadas:** eventos repetidos de aprovação não somam novamente o mesmo pagamento; eventos de estorno/cancelamento de uma cobrança já registrada continuam no fluxo de processamento; uma cobrança rejeitada/cancelada distinta não cancela um pedido já quitado. Se pagamentos diferentes forem efetivamente aprovados acima do total, o excedente fica marcado no ledger (`overpaymentAmount`) e é registrado para reconciliação; não há estorno automático. A emissão concorrente de duas intenções antes da liquidação ainda pode causar cobrança excedente, portanto a correção reconcilia e sinaliza esse caso, mas não o impede na origem. O tratamento contábil de reversões em pedidos cobertos por vários pagamentos ainda precisa ser validado.

**Validação:** revisão estática do handler, dos criadores de pagamento e do helper financeiro; `git diff --check` passou nesta retomada. Nenhuma notificação real foi enviada e nenhum registro do banco foi alterado. Não foram executados testes, TypeScript ou build.

### Locks de execução dos jobs internos

**Achado confirmado:** `releaseExecutionLock` removia a chave Redis com `DEL` incondicional. Se a execução ultrapassasse o TTL e outra instância adquirisse o lock, a primeira ainda poderia apagar a chave da segunda e permitir sobreposição.

**Correção aplicada:** cada lock agora guarda um token aleatório de proprietário; a liberação usa script Lua atômico para apagar a chave apenas quando o token ainda corresponde. Todos os chamadores atuais passam o token de aquisição. Execuções em modo fail-open sem Redis não tentam liberar uma chave que não criaram.

**Validação:** inspeção estática dos três chamadores (`backup-database`, `process-pending-webhooks` e `idempotency.ts`); sem chamada de escrita ao Redis e sem teste de concorrência nesta etapa.

### XSS em conteúdo público e editor de rich text

**Achado confirmado:** `OptimizedMapbox` inseria o URL de logo da loja em um template `innerHTML`. O campo é controlável pelo parceiro em `stores.logo_url`; conteúdo com aspas/atributos HTML podia escapar do atributo `src` no mapa público. A CSP ativa também inclui `'unsafe-inline'` em `script-src`, então não fornece bloqueio efetivo a handlers inline nesse cenário.

**Correção aplicada:** o marcador agora é montado com elementos DOM e aceita apenas URLs HTTP(S) sem credenciais, com fallback conhecido para URLs inválidas.

**Achado confirmado relacionado:** `RichTextEditor` carregava diretamente o HTML salvo no `innerHTML` e permitia que colagem/imagens chegassem ao editor sem saneamento confiável. As ações de gravação de descrições de produto e serviço também aceitavam HTML bruto.

**Correção aplicada:** o valor carregado, conteúdo colado/arrastado e HTML persistido em descrições de produto/serviço passam por `sanitizeRichText`; a inserção e edição de imagens agora usam nós DOM e URLs HTTP(S) validadas.

**Pendente:** avaliar CSP nonce estrita compatível com renderização dinâmica, cache público e scripts de terceiros; não foi alterada nesta etapa para evitar quebrar scripts/rotas sem uma validação de cobertura. Reavaliar atributos `style` permitidos no rich text.

**Validação:** revisão estática dos pontos de entrada e sanitização. Sem testes de navegador, testes automatizados ou build nesta etapa.

`npm audit --omit=dev --audit-level=high` e `npm audit --audit-level=high` foram repetidos em 30/10/2026; ambos reportaram zero vulnerabilidades. `git diff --check` não apontou whitespace inválido.

### Checagem de conexões em 30/10/2026

- Supabase REST aceitou uma consulta de schema autenticada com credencial de serviço; não foram lidos registros. A OpenAPI retornou 162 relações e funções RPC visíveis ao papel de serviço.
- A resposta de schema inclui `store_members` e `can_manage_store_member`, objetos da migration de 29/10; a existência desses objetos sugere que ela foi aplicada ao projeto configurado, mas não prova o estado integral das policies nem se o projeto é produção/homologação.
- A chave pública configurada em `NEXT_PUBLIC_SUPABASE_ANON_KEY` recebeu `401 Invalid API key` no projeto indicado por `NEXT_PUBLIC_SUPABASE_URL`. O teste da chave `SUPABASE_PUBLISHABLE_KEY` também foi rejeitado. Isso aponta configuração local inválida/desatualizada; não prova que o ambiente de produção usa os mesmos valores. Nenhum valor de chave foi copiado para este relatório.
- A conexão PostgreSQL direta apresentou certificado `SELF_SIGNED_CERT_IN_CHAIN`. A verificação TLS não foi desativada, então a inspeção de `pg_policies`, grants e estado efetivamente aplicado no banco segue pendente.
- Redis respondeu `PONG` via endpoint REST. O bucket R2 respondeu ao `HEAD`; nenhum objeto foi listado, lido ou alterado.

**Arquivos alterados nesta retomada:** `app/api/mercadopago/process-erp-payment/route.ts`, `app/api/orders/retry-payment/route.ts`, `app/api/mercadopago/create-preference/route.ts`, `lib/mercadopago/payment-quote.ts` e `components/erp/orders/PaymentModal.tsx`.

### Acesso a anexos privados em 30/10/2026

**Achado confirmado:** ações de download assinavam um `fileKey` fornecido pelo cliente depois de checar apenas autenticação ou permissão no parceiro; não provavam que a chave estava vinculada ao pedido, transação, movimentação, devolução ou ordem de serviço solicitada. Algumas ações de exclusão usavam o cliente administrativo e verificavam o ID do anexo e do pai, mas não confirmavam que o registro pai pertencia ao parceiro/loja autorizado.

**Correção aplicada:** downloads, listagens e exclusões agora consultam os registros por cliente Supabase vinculado à sessão e exigem autorização de parceiro/loja ou propriedade do comprador/cliente quando aplicável. Downloads e exclusões verificam a relação exata anexo↔registro; a ordem de serviço passou a receber seu ID explicitamente no fluxo genérico e no componente dedicado. Exclusões via cliente administrativo também restringem a gravação ao ID do pai.

**Superfície coberta:** anexos de pedidos, transações, movimentações de estoque, evidências de devolução e anexos de ordem de serviço.

**Validação:** inspeção estática dos chamadores e das consultas; `git diff --check` passou. Sem execução de testes, TypeScript ou build nesta retomada. Como a chave pública local do Supabase está inválida, as consultas vinculadas à sessão dependem de correção de configuração antes de validação integrada.

**Ajuste adicional:** a exclusão de anexo de ordem de serviço agora retorna falha se o registro não estiver associado à OS informada, antes de tentar remover o objeto do R2.

**Arquivos alterados:** `app/actions/erp/orders.ts`, `app/actions/erp/transactions.ts`, `app/actions/erp/stock-movements.ts`, `app/actions/erp/returns.ts`, `app/actions/erp/service-orders.ts`, `components/erp/shared/GenericAttachmentsTab.tsx`, `components/erp/service-orders/AttachmentsTab.tsx`.

### Revisão adicional de autorização ERP em 30/10/2026

**Achado confirmado — itens de agendamento:** as ações `getAppointmentItemsAction` e `saveAppointmentItemsAction` autorizavam o módulo do parceiro ativo, mas aceitavam um `appointmentId` sem confirmar que o agendamento pertencia ao parceiro/loja. A leitura podia expor itens de outro tenant; a gravação podia alterar/excluir itens vinculados a um agendamento alheio. Agora o pai é resolvido por `id + partner_id`, a permissão efetiva da loja é exigida e as escritas de itens também incluem `appointment_id` no filtro.

**Achado confirmado — leitura de produtos para agenda:** `fetchProductsByIdsAction` aceitava `partnerId` fornecido pelo chamador e usava cliente administrativo sem autorização daquele parceiro. Agora exige permissão de visualização de agenda antes da leitura. A busca por loja também exige permissão efetiva de `stock_movements.view` naquela loja.

**Achado confirmado — contas financeiras e entregas:** criar conta financeira não conferia se `storeId` pertencia ao parceiro nem a permissão da loja; atribuição/solicitação de motorista aceitava `deliveryId` sem validar o tenant da entrega referenciada. As ações agora validam o vínculo parceiro-loja/entrega. A listagem de contas filtrada por loja também exige permissão efetiva nessa loja.

**Ajuste de concorrência e validação — pagamento na retirada:** a confirmação agora exige permissão efetiva da loja, valida `paymentMethod` em runtime e só continua efeitos financeiros/logísticos se o update condicional do pedido realmente alterou uma linha.

**Validação:** inspeção estática das ações e chamadores. Não foram executados testes, TypeScript ou build. `git diff --check` aponta whitespace no arquivo paralelo `components/marketplace/ExplorarPageClient.tsx` (linha 687), não alterado nesta auditoria; não corrigi essa edição concorrente.

**Arquivos alterados nesta revisão:** `app/actions/erp/appointment-items.ts`, `app/actions/erp/finance-accounts.ts`, `app/actions/erp/delivery-driver-assignments.ts`, `app/actions/erp/confirm-pickup-payment.ts`.

### Movimentações manuais de estoque em 30/10/2026

**Achados confirmados:** a busca de produtos aceitava `storeId` sem validar a permissão efetiva da loja e retornava produtos sem filtro de parceiro; as ações de criação confiavam apenas na permissão do parceiro; o estorno criava a movimentação compensatória na loja ativa, que podia ser diferente da loja da movimentação original; e a exclusão removia o registro do ledger sem compensar a alteração de estoque. Também foi confirmado que a migration anterior concedia o RPC `create_batch_stock_movement` diretamente a `authenticated`, embora ele dependa da autorização feita pelas ações do servidor.

**Correções aplicadas:** busca agora usa a loja ativa quando não há filtro explícito, verifica permissão de leitura e filtra também pelo parceiro. Criação unitária e em lote exigem permissão efetiva de estoque na loja ativa. Exclusão legada encaminha para o fluxo de estorno, preservando o histórico; exclusão/estorno verificam a permissão da loja de origem. A nova RPC `undo_stock_movement_atomic` bloqueia a movimentação original com `FOR UPDATE`, restaura o estoque, cria o registro compensatório e marca o vínculo na mesma transação. O RPC genérico e o novo RPC de estorno têm execução restrita a `service_role`; a Server Action mantém as verificações de usuário, parceiro e loja. Os chamadores de estoque em pedidos e devoluções também executam via cliente administrativo depois da autorização; os fluxos de edição/lote de pedido e reembolso agora verificam a permissão efetiva na loja do registro.

**Risco residual:** a aplicação da migration corretiva foi informada pelo usuário, mas não conferida no projeto Supabase configurado. A função exige que produtos de movimentação com `store_id` estejam associados à mesma loja; validar este pressuposto com dados e schema efetivos em homologação, além de conferir que a versão ativa é a corretiva. Nenhuma migration foi aplicada nem estado de banco alterado nesta revisão.

**Validação:** revisão estática da Server Action e das migrations de estoque; nenhum teste, TypeScript ou build foi executado.

**Migration desta retomada:** `migrations/20261030120000_atomic_stock_movement_undo.sql`. O usuário informou em 30/10/2026 que aplicou a migration. Não confirmei independentemente o ambiente nem o ledger. A revisão da arquitetura histórica detectou que essa primeira versão delegava a um RPC de estoque que não desfaz corretamente os deltas na arquitetura atual e restaura snapshots absolutos, podendo sobrescrever movimentos posteriores.

**Migration corretiva de estorno:** criada `migrations/20261030130000_atomic_stock_movement_undo_delta.sql`. Ela substitui a função para inverter o delta registrado diretamente em `products`/`product_variants` sob lock; valida parceiro/loja, impede estoque negativo e grava o ledger reverso na mesma transação. O usuário informou que aplicou a migration. A aplicação e o schema ativo não foram conferidos no ledger nem por consulta ao banco; revisar o diff da função no ambiente correto e validar em homologação antes de confiar no fluxo.

### Caixa PDV e uploads R2 em 30/10/2026

**Achado confirmado — movimentação do caixa:** `createCashMovementAction` aceitava apenas `pdv.view` para criar sangria/reforço. Agora exige `pdv.sangria` ou `pdv.reforco`, valida tipo de movimento, sessão aberta, loja efetiva e conta de caixa pertencente ao parceiro/escopo da sessão. A reversão também resolve a loja da sessão antes de autorizar. Leitura, abertura, fechamento e consultas explícitas por loja passaram a aplicar a permissão efetiva da loja.

**Achado confirmado — upload de vídeo de produto/serviço:** `verifyItemAccess` permitia gerar URL assinada quando o item não existia. Agora falha fechado e valida permissão efetiva da loja ao emitir URL.

**Achado confirmado — referências financeiras não escopadas:** as ações de transação manual aceitavam origem `system`/`gateway`, ID da transação e vínculo de parcelamento fornecidos pelo cliente, além de IDs de conta, método de pagamento, cliente, contato e categoria sem validar o tenant. Transferências, pagamentos parciais, recorrências, ajuste de saldo e quitação em lote também podiam associar conta/método fora do parceiro/loja. Agora a criação manual força origem `manual`, rejeita IDs de transação/grupo, valida tipo/status e referências de conta, método, cliente, contato e categorias; edição valida as referências finais e a loja existente; transferências exigem duas contas do parceiro; pagamentos parciais e recorrentes validam conta/método no escopo da loja; ajustes de saldo e quitação em lote fazem preflight de conta e permissão de loja antes de mutar.

**Limite desta correção:** reembolsos, liquidações RPC e outras ações de pagamento em `transactions.ts` ainda precisam de revisão específica de concorrência, atomicidade e escopo por loja; não se considera o módulo financeiro concluído.

**Auditoria financeira adicional nesta retomada:** `settle_installment_group` tinha permissão `authenticated`, embora a ação do ERP aplique autorização financeira e de loja no servidor e seja o único chamador encontrado; migration forward-only `20261030160000_restrict_settle_installment_rpc.sql` revoga o acesso direto e mantém apenas `service_role`. A função auxiliar de atualização de saldo agora propaga erros e resultado nulo em vez de registrá-los e seguir como sucesso. Pagamentos avulsos validam juros/descontos não negativos; a quitação em lote confere valores e confirma que cada transação informada pertence a parcela pendente do grupo.

**Migration 170000:** o usuário informou que aplicou `20261030170000_restrict_financial_balance_delta.sql`, que revoga execução direta por `authenticated`, faz a RPC de saldo falhar se a conta não existir e cria RPCs transacionais para pagamento de comissão e quitação de bonificações. Não confirmei o ledger nem os grants efetivos no banco. Todos os chamadores identificados de `apply_account_balance_delta` usam agora cliente administrativo depois da autorização da ação/fluxo de servidor.

**Achado confirmado — produtividade/comissões:** ações de relatório, histórico, pagamento de comissão e pagamento de bonificação exigiam apenas login antes de consultar/mutar dados com cliente administrativo; não validavam acesso ao parceiro nem permissão financeira. O ranking também agregava progresso de metas sem limitar os IDs de meta ao parceiro ativo. As ações agora exigem `financial.view` ou `financial.create`, o ranking restringe os dados às metas do parceiro, contas escolhidas precisam ser contas globais ativas do parceiro e as gravações de comissão/bonificação usam RPC transacional. O pagamento em lote de bônus agora bloqueia linhas, liquida somente bônus cobertos integralmente pelo valor pedido e atualiza o saldo na mesma transação.

**Pagamentos parciais/avulsos — correção local:** criado `20261030180000_atomic_transaction_payment.sql` com a RPC `record_transaction_payment_atomic`. Ela bloqueia a transação original, recalcula o principal restante no banco, limita o valor aplicado ao saldo pendente e grava pagamento, transação liquidada e saldo financeiro na mesma transação. As duas Server Actions chamam essa RPC com chave de idempotência gerada para a tentativa no modal. O retry após commit retorna o resultado já gravado antes de validar novamente status e conta, sem repetir eventos de timeline. O usuário informou que aplicou a migration; a especificação REST do Supabase lista a RPC para a chave de serviço, mas ledger e grants ainda não foram confirmados via PostgreSQL. Chamadas concorrentes ainda não foram exercitadas.

**Risco financeiro ainda alto e aberto:** estornos externos e alguns fluxos de cancelamento/recorrência ainda precisam de consistência entre o efeito no gateway e o saldo/ledger local. Os eventos de auditoria do pagamento acontecem depois da RPC financeira e podem exigir reconciliação se a gravação da timeline falhar após o commit.

**Cancelamento de sinal — hardening local:** a rota exigia permissão de edição de pedido no parceiro, mas não permissão efetiva na loja, e atualizava o pedido sem comparar a versão lida. Agora exige `orders.edit` na loja; grava uma intenção com o ID antes do pedido externo; chama `PUT /v1/payments/{id}` com o token OAuth válido do parceiro; confirma o estado por `GET` em respostas não exitosas; e só limpa os metadados locais depois de confirmar cancelamento ou estado terminal sem cobrança. Se já estiver aprovado, responde 409 e conserva os dados para o webhook registrar o valor recebido. O evento `cancelled`/`rejected` do pagamento cancelado é filtrado pelo ID sem cancelar o pedido inteiro; a gravação do webhook relê a versão atual e usa compare-and-swap com retry para não sobrescrever a intenção nem estado financeiro concorrente. A API do MP permite cancelar pagamentos `pending`, `in_process` e `authorized`; não permite cancelar pagamento `approved` ([referência oficial do endpoint](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/create-cancellation/put)). Integração e corrida ainda precisam ser exercitadas em homologação; não foram feitas chamadas reais ao Mercado Pago.

**Reembolsos MP de devoluções — hardening local:** `executeMercadoPagoRefundAction` agora confirma que o refund pertence à solicitação informada e aplica a permissão `orders.can_refund` também no escopo da loja. O reenvio só aceita linhas em `FAILED`, faz transição atômica para `PROCESSING` e usa a mesma chave de idempotência estável `mp-refund:{refundId}` em toda tentativa. O endpoint tem timeout; só grava `APPROVED` quando o MP retorna ID e status aprovado; estado pendente fica em `MANUAL` para reconciliação. A falha posterior de timeline/saldo não muda um reembolso já `APPROVED` de volta para `FAILED`. O endpoint exige `X-Idempotency-Key` e a chave deduplica reenvios do mesmo reembolso ([referência oficial de criar reembolso](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/create-refund/post)). Resta validar sandbox e reconciliar divergências de saldo local quando o reembolso do gateway foi aceito mas uma gravação posterior falhou.

**Cancelamento do pedido pelo comprador — hardening local:** a ação tentava cancelar no Mercado Pago, mas seguia com o cancelamento local mesmo se o pagamento já estivesse aprovado ou a chamada remota falhasse; também aceitava pedidos parcialmente pagos sem gerar estorno. Agora bloqueia cancelamento pelo comprador quando há valor recebido, confirma cancelamento/estado terminal do pagamento remoto antes de alterar o pedido e usa compare-and-swap por `situation` e `updated_at`. Em conflito ou resultado remoto incerto, preserva o pedido e pede atualização/repetição.

**Validação financeira nesta rodada:** três suítes `vitest` passaram (28 testes: retornos/reembolsos, estado financeiro de pedidos e retry de pagamento). `git diff --check` passou nos arquivos ajustados. `npx tsc --noEmit` continua falhando exclusivamente no arquivo não rastreado `app/segmentos/lojas-de-roupas-e-calcados/page.tsx`, pela importação inexistente de `LayoutIcon`; não houve chamadas reais ao MP ou gravações no banco.

**Achado adicional — lote financeiro e anexos:** operações em lote validavam a permissão geral do parceiro, mas não a permissão financeira efetiva em cada loja. O preflight agora exige a ação de loja correspondente em todas as linhas elegíveis antes de iniciar o lote e valida que a categoria selecionada pertence ao parceiro. A gravação de anexo financeiro confirma que a transação pertence ao parceiro e exige permissão da loja; a emissão de URL assinada também recebe a transação e valida o mesmo escopo antes de emitir. A chave R2 fica limitada ao prefixo do usuário e a gravação confere existência, tipo e tamanho reais do objeto antes de persistir o vínculo. A emissão de URL assinada também recebeu rate limit.

**Pendente — limite de tamanho no PUT direto ao R2:** a assinatura PUT ainda não restringe o `Content-Length`; o tamanho real é rejeitado na etapa de salvar o vínculo, mas um objeto acima do limite pode ficar órfão no bucket e consumir armazenamento. O fechamento completo exige policy POST com `content-length-range`, upload controlado pelo servidor ou mecanismo confiável de limpeza de objetos órfãos, além de migração dos clientes.

**Risco residual de caixa:** a migration `20260421_cash_register_production.sql` implementa controle atômico no RPC, mas o fluxo pode cair para fallback de múltiplas gravações se o RPC falhar. A semântica da autorização `auth.uid()` ao chamar o RPC via cliente administrativo e a atomicidade do fallback precisam de validação em homologação; não consultei nem alterei políticas/estado no banco.

**Validação após a migration de pagamentos e do cancelamento de sinal:** `vitest` passou em cinco suítes focadas (55 testes: engine financeiro, reembolsos, lote financeiro, atualização de pagamento MP e retry de pedido). `git diff --check` passou nos arquivos alterados. `npx tsc --noEmit` não apontou erros nos arquivos desta correção; segue falhando pelo arquivo não rastreado `app/segmentos/lojas-de-roupas-e-calcados/page.tsx`, que importa `LayoutIcon`, ausente em `lib/icons.tsx`. A conexão PostgreSQL somente leitura falhou com `SELF_SIGNED_CERT_IN_CHAIN`; a chave pública local recebeu HTTP 401. Não desativei validação TLS. A consulta REST somente leitura com a chave de serviço retornou HTTP 200 e listou `record_transaction_payment_atomic`, o que confirma que a RPC está exposta no schema PostgREST para essa role, mas não prova o ledger nem as permissões de outras roles. Não houve gravação no banco nem chamada real ao Mercado Pago.

### Webhooks e worker de eventos em 30/10/2026

**Achados confirmados no ingresso Mercado Pago:** a Edge Function ignorava validação quando `MP_WEBHOOK_SECRET` não estava definido, aceitava timestamps futuros, e respondia sucesso mesmo se não conseguisse gravar no outbox. A validação agora falha fechado sem segredo, verifica idade nos dois sentidos, aceita os segredos de pagamentos e assinaturas configurados, rejeita payloads acima de 256 KiB e devolve 503 quando não há gravação durável. O upsert idempotente ignora duplicatas sem substituir eventos já processados.

**Achados confirmados no worker:** o lote podia durar mais que o TTL do lock e o worker tratava o ACK imediato de uma rota assíncrona como processamento concluído. O lote foi reduzido a dois eventos, o lock agora falha fechado e dura 360 segundos, e o endpoint de replay autentica pelo segredo interno, valida a assinatura do MP permitindo o timestamp expirado apenas nessa rota autenticada e aguarda o processamento até retornar sucesso/falha. O worker usa timeout compatível, marca falhas para retry limitado a cinco tentativas e valida URL HTTPS em produção. O webhook de assinatura grava agora no mesmo outbox durável dos pagamentos; o replay passa pela rota principal para verificar o estado diretamente no Mercado Pago.

**Falha de processamento corrigida nesta retomada:** respostas não exitosas da API de preapproval/authorized payments agora provocam retry; erros na consulta/atualização de `recurring_subscriptions` também são propagados; e falha ao persistir cobrança tardia de assinatura SaaS cancelada não é mais engolida. Isso impede que o worker marque esses eventos como concluídos sem gravar o resultado.

**Limitações restantes:** a Edge Function e o worker são arquivos locais; mudanças não foram implantadas. A checagem de rate limit de webhooks falha aberta se Redis tiver erro inesperado. O worker e o status de cada evento não foram exercitados; não houve chamada a Mercado Pago, Redis ou banco nesta revisão. Exige homologação com eventos assinados, duplicados, expirados, futuros e falha temporária de armazenamento/MP. A verificação de permissão de clientes e a filtragem por parceiro nas ações de detalhe, pedidos e créditos foram revisadas estaticamente nesta retomada; ainda falta cobrir todas as ações de ERP.

**Varredura dos demais jobs internos:** os cinco endpoints presentes (`backup-database`, `process-pending-automations`, `process-pending-webhooks`, `process-whatsapp-reminders` e `retry-failed-whatsapp`) usam validação de bearer dedicado antes de executar. Esta verificação foi estática e não substitui revisar payloads e idempotência dos jobs de WhatsApp/automações.

### ERP — escopo de loja em agendamentos em 30/10/2026

**Achados confirmados e corrigidos localmente:** `createAppointmentsAction`, `updateAppointmentAction` e `deleteAppointmentAction` verificavam a permissão de agendamentos no parceiro, mas não a permissão efetiva da loja do registro/destino. Agora criação valida todas as lojas antes do insert; edição exige acesso à loja atual e à loja de destino; exclusão exige acesso à loja do agendamento. `deleteUnavailableSeriesAction` também usava o `partnerId` enviado pelo cliente após validar permissão apenas no parceiro ativo; agora exige correspondência com o contexto ativo, verifica o acesso a cada loja afetada e exclui apenas os IDs que foram pré-validados.

As listagens paginadas de produtos e movimentações de estoque também podiam retornar dados de todas as lojas quando `storeId` era omitido. Agora confirmam o parceiro ativo, aplicam a loja ativa como padrão e validam `products.view`/`stock_movements.view` na loja selecionada.

**Achados de mutações de produto corrigidos localmente:** a atualização em lote aplicava diretamente chaves arbitrárias do payload aos produtos. Agora só aceita preço, quantidade de estoque, status e imagens, valida os valores, restringe a gravação ao parceiro e exige permissão de movimentação de estoque quando altera estoque. A verificação de produto individual também valida a permissão efetiva da loja, cobrindo edição, arquivamento, exclusão e consulta de pedido ligado ao produto. Preço promocional e preço normal agora confirmam parceiro e permissão de loja. A duplicação limita o lote a produtos de um único parceiro, verifica que todos os IDs foram resolvidos e exige permissão de leitura/criação nas lojas de origem/destino. A criação de produto valida permissão de criação na loja e, quando recebe estoque inicial diferente de zero, exige também `stock_movements.create` na loja.

**Variantes e fornecedores:** o lote de variantes usava `upsert` com SKU global como chave de conflito, podendo atualizar uma variante pertencente a outro produto; agora insere sem sobrescrever conflitos. Operações em lote de variantes validam IDs, parceiro e permissões por loja; alterações de estoque em variantes exigem `stock_movements.create`. Vínculos de fornecedor agora confirmam o `partner_id` do fornecedor e exigem a permissão específica de fornecedores para criar, editar, remover ou visualizar. As ações de listagem e busca de fornecedores validam autenticação, parceiro ativo e permissão `suppliers.view` antes de retornar dados pessoais.

**Validação desta rodada:** `npx tsc --noEmit` passou e `git diff --check` passou. A revisão foi estática; não há suíte de testes dedicada às Server Actions revisadas e não foi feita chamada ao banco. Estoque inicial e ajustes de estoque de produtos/variantes ainda são gravados diretamente sem uma movimentação correspondente no ledger; corrigir isso exige integrar as mudanças ao fluxo transacional de movimentação e permanece pendente. A varredura do ERP continua para pedidos, clientes, demais ações de estoque e financeiro.

### Pedidos e anexos ERP — 30/10/2026

**Achados confirmados e corrigidos localmente:** a exclusão em lote apagava `order_items` pelos IDs recebidos antes de comprovar que os pedidos pertenciam ao parceiro, permitindo atingir itens de outro tenant. Agora valida IDs únicos, limita o lote, resolve todos os pedidos pelo parceiro e verifica `orders.delete` em cada loja antes de excluir os itens. A edição de observações e as leituras de detalhe/listagem/histórico agora conferem escopo por loja; a criação herda a loja ativa e valida `orders.create` nela.

O salvamento de anexo aceitava `orderId` sem confirmar o parceiro/loja do pedido e não prendia a chave R2 ao usuário que recebeu a URL assinada. Agora a URL assinada e o vínculo exigem o pedido correto e acesso à loja; o salvamento exige chave no prefixo do usuário, valida tipo/tamanho e confirma o objeto real no R2 antes de gravar. A ação genérica de upload agora passa o ID do pedido à emissão da URL.

O mesmo problema existia no anexo de movimentação de estoque: o endpoint de salvamento gravava pelo ID recebido com cliente administrativo sem validar parceiro/loja nem chave/objeto R2. Agora emissão e salvamento recebem o ID da movimentação, confirmam vínculo e escopo de loja, exigem chave do usuário e validam metadados reais do objeto. Listagens/insights de pedidos também herdam a loja ativa; pagamento de pedido ligado a agendamento e consulta do número do pedido validam a permissão de loja. Lotes de atualização de status limitam IDs e rejeitam conjuntos incompletos antes de alterar pedidos.

**Validação:** `npx tsc --noEmit` e `git diff --check` passaram. Revisão estática; não houve chamadas ao R2, banco ou provider. A exclusão de pedido continua sendo uma sequência de duas gravações (itens e pedido), portanto falha entre elas pode deixar exclusão parcial; atomicidade transacional permanece pendente. Continuam pendentes as demais Server Actions de pedidos e o restante do ERP.

### RPC de movimentação de estoque — 30/10/2026

**Achado confirmado:** `create_batch_stock_movement` é `SECURITY DEFINER` e sua ramificação de variantes validava o par variante/produto, mas não validava o `partner_id` do produto. A Server Action também não confirmava que todos os produtos e variantes enviados pertenciam ao parceiro ativo. Um usuário de um parceiro podia, portanto, fornecer um produto e uma variante de outro parceiro, provocando alteração de estoque via RPC de serviço.

**Correção local:** as ações de movimento simples e em lote agora resolvem todos os produtos e variantes, verificam a relação variante-produto, parceiro e loja antes de chamar a RPC e limitam os lotes. Foi criada a migration `20261030190000_harden_batch_stock_movement_tenant_scope.sql` para impor as verificações de parceiro, relação variante-produto e loja dentro da transação do banco, mantendo execução apenas por `service_role`. A migration ainda não foi aplicada nem validada no ledger/schema; aplicar e confirmar antes de depender da proteção no banco.

**Validação desta rodada:** `git diff --check` passou. O `npx tsc --noEmit` não apontou erros nos arquivos desta auditoria, mas o comando global falha no arquivo não rastreado `app/actions/erp/subscriptions.test.ts`, com fixtures incompatíveis com `Plan`/`UsageCounters` e acesso não estreitado a `ActionResponse.data`. Esse arquivo apareceu no workspace durante a revisão e não foi editado. Não houve consulta ao banco nem execução da RPC.

**Arquivos alterados nesta revisão:** `app/api/internal/jobs/process-pending-webhooks/route.ts`, `app/api/mercadopago/webhook/route.ts`, `app/api/mercadopago/webhook/subscription/route.ts`, `supabase/functions/mercadopago-webhook/index.ts`.

**Validação:** revisão estática de `cash-register.ts`, da migration SQL, das rotas R2, do acesso a clientes e do fluxo de webhooks. Sem testes, TypeScript, build ou consultas ao banco. A validação de whitespace dos arquivos desta rodada foi feita separadamente; a checagem global segue apontando whitespace em alteração paralela de `components/marketplace/ExplorarPageClient.tsx`.

**Arquivos alterados nesta rodada:** `app/actions/erp/cash-register.ts`, `app/actions/erp/transactions.ts`, `app/api/r2/video-upload/route.ts`.

## Pendências para retomar

### Prioridade alta — autorização, pagamentos e isolamento

- [ ] Concluir a análise de Mercado Pago: validar em homologação a concorrência e os eventos de reversão; definir prevenção de intenções simultâneas e processo de estorno/reconciliação de excedentes; conferir os papéis legítimos que podem cobrar.
- [ ] Revisar todas as Server Actions e Route Handlers de ERP para autorização em cada mutação e escopo por parceiro/loja, priorizando pedidos, clientes, produtos, estoque, agendamentos e financeiro.
- [ ] Revisar ações de lote, IDs relacionados e casos de mass assignment; confirmar que o escopo também é aplicado nas gravações e exclusões.
- [ ] Confirmar no ledger/grants a aplicação de `20261030170000_restrict_financial_balance_delta.sql` e `20261030180000_atomic_transaction_payment.sql`; testar concorrência/idempotência de pagamentos em homologação.
- [ ] Reconciliar fluxos de estorno/cancelamento para alinhar efeito no gateway, ledger e saldo local.
- [ ] Revisar as demais regras de papéis e permissões por módulo, incluindo operações administrativas e convites.
- [ ] Revisar migrations/policies RLS existentes e comparar com a nova migration; verificar conflitos, tabelas sem RLS, views, RPCs, triggers, grants, Storage e Realtime conforme presentes no projeto.
- [ ] Confirmar/renovar a chave pública Supabase do ambiente local com o dashboard e repetir a inspeção RLS via conexão PostgreSQL com certificado confiável. Não substituir a chave pública por uma chave de serviço.
- [ ] Confirmar o registro/ambiente da migration pelo ledger e consultar `pg_policies`, grants e `relrowsecurity` por conexão PostgreSQL com TLS confiável. Só então adicionar/rodar testes de integração em homologação que provem leitura e escrita legítimas, bloqueio entre parceiros/lojas e ausência de efeitos colaterais. Não reaplicar nem alterar políticas em produção nesta auditoria.

### Demais áreas de segurança ainda não concluídas

- [ ] Autenticação e contas: login, cadastro, recuperação, OTP, sessão, cookies, redirecionamentos, convites, alteração de credenciais e exclusão de conta.
- [ ] Webhooks e jobs: ingress e reprocessamento receberam hardening local; falta implantar e validar em homologação os estados de assinatura, retry e armazenamento, além de auditar os demais jobs e webhooks.
- [ ] Uploads e arquivos: validação, tamanho/tipo, nomes/caminhos, escopo de acesso e políticas do Storage.
- [ ] XSS e conteúdo: revisar o restante das superfícies de HTML/Markdown, atributos `style` aceitos e adotar CSP com nonce após mapear scripts de terceiros e requisitos de cache/renderização dinâmica.
- [ ] Rate limiting e abuso: cobertura dos endpoints sensíveis, concorrência, repetição de operações e limites de payload/processamento.
- [ ] Secrets e configuração: busca de credenciais no código, histórico/arquivos, logs, headers de segurança, CORS, CSP, `next.config`, proxy e configurações de deploy/CI.
- [ ] Dependências e cadeia de fornecimento: interpretar os resultados do audit, revisar scripts e dependências relevantes sem atualizações amplas.
- [ ] Logs e trilha de auditoria: verificar eventos privilegiados e garantir ausência de tokens, secrets ou dados sensíveis nos logs.
- [ ] Revisar o diff completo e mudanças paralelas do workspace para separar alterações desta auditoria de alterações pré-existentes/concorrentes.

### Validação final

- [ ] O usuário executará TypeScript e build depois das alterações finais; registrar os resultados reais quando forem fornecidos.
- [ ] Repetir suíte completa depois dos ajustes dos fixtures, caso faça sentido no ambiente disponível; guardar separadamente resultados focados e completos.
- [ ] Definir/rodar lint quando houver ferramenta/configuração disponível; por ora não há script nem binário detectado.
- [ ] Fazer revisão final de migration, policies, diff, secrets acidentais e fluxos legítimos impactados.
- [ ] Preparar entrega final com achados classificados, evidências, arquivos, correções, testes, pendências de homologação e riscos residuais.

## Arquivos tocados nesta etapa conhecida

O diff inclui ainda alterações paralelas no workspace em `components/billing/BillingRefundModal.tsx`; elas não foram editadas nem atribuídas à auditoria nesta retomada.

- `app/actions/erp/team.ts`
- `app/actions/erp/store-members.ts`
- `app/actions/erp/order-financial-breakdown.ts`
- `app/actions/erp/orders.ts`
- `app/actions/erp/appointment-items.ts`
- `app/actions/erp/cash-register.ts`
- `app/actions/erp/confirm-pickup-payment.ts`
- `app/actions/erp/delivery-driver-assignments.ts`
- `app/actions/erp/finance-accounts.ts`
- `app/actions/erp/transactions.ts`
- `app/actions/erp/stock-movements.ts`
- `migrations/20261030120000_atomic_stock_movement_undo.sql`
- `migrations/20261030130000_atomic_stock_movement_undo_delta.sql`
- `migrations/20261030160000_restrict_settle_installment_rpc.sql`
- `migrations/20261030170000_restrict_financial_balance_delta.sql`
- `migrations/20261030180000_atomic_transaction_payment.sql`
- `app/actions/erp/produtividade.ts`
- `app/actions/erp/appointments.ts`
- `lib/services/transaction.service.ts`
- `lib/services/recurring-execution.service.ts`
- `lib/services/transaction.service.ts`
- `lib/services/recurring-execution.service.ts`
- `app/actions/erp/returns.ts`
- `app/actions/erp/service-orders.ts`
- `app/actions/erp/products.ts`
- `app/actions/erp/servicos.ts`
- `app/api/mercadopago/create-preference/route.ts`
- `app/api/mercadopago/process-erp-payment/route.ts`
- `app/api/mercadopago/process-payment/route.ts`
- `app/api/mercadopago/webhook/route.ts`
- `app/api/mercadopago/webhook/subscription/route.ts`
- `supabase/functions/mercadopago-webhook/index.ts`
- `app/api/r2/video-upload/route.ts`
- `app/api/orders/retry-payment/route.ts`
- `app/api/orders/cancel-deposit/route.ts`
- `app/api/internal/jobs/backup-database/route.ts`
- `app/api/internal/jobs/process-pending-webhooks/route.ts`
- `app/api/internal/jobs/process-pending-automations/route.ts`
- `app/api/internal/jobs/process-whatsapp-reminders/route.ts`
- `app/api/internal/jobs/retry-failed-whatsapp/route.ts`
- `components/erp/orders/PaymentModal.tsx`
- `components/map/OptimizedMapbox.tsx`
- `components/reusable/RichTextEditor.tsx`
- `lib/mercadopago/payment-quote.ts`
- `lib/internal-cron/idempotency.ts`
- `lib/payments/mp-order-payment-update.ts`
- `lib/security/rich-text-sanitizer.ts`
- `components/erp/orders/OrderDetailView.tsx`
- `components/erp/shared/GenericAttachmentsTab.tsx`
- `lib/utils/attachment-uploader.ts`
- `components/erp/service-orders/AttachmentsTab.tsx`
- `lib/store-members.ts`
- `lib/utils/revalidation.ts`
- `lib/payments/order-financial-breakdown.ts`
- `lib/payments/order-financial-breakdown.test.ts`
- `lib/permissions/partner-roles.security.test.ts`
- `lib/services/account-deletion.service.test.ts`
- `lib/services/account-deletion.e2e.test.ts`
- `migrations/20261029_harden_store_member_tenant_scope.sql`

O workspace também apresenta outras alterações e exclusões de documentação que já estavam presentes ou surgiram em paralelo. Elas não foram revertidas nem são atribuídas automaticamente a esta auditoria; conferir o `git status` e o histórico de trabalho antes de qualquer limpeza.

## Nota de segurança e rollback

No registro original, a migration havia sido criada, mas não aplicada; nesta retomada, o usuário informou que aplicou também a migration corretiva de estorno. Esse estado não foi confirmado pelo ledger ou por consulta ao schema do banco. Antes de novas aplicações, confirmar ledger e ambiente e revisar as policies antigas e os papéis reais do schema. Como as migrations substituem policies para fechar acesso cruzado, um rollback que restaure policies permissivas pode reabrir a falha; se houver incompatibilidade, prefira uma migration corretiva/forward-fix. Não alterar policies em produção sem validação própria e plano operacional.

**Conclusão deste registro:** há correções localizadas implementadas e testes focados aprovados, mas a auditoria permanece incompleta. Não usar este documento como declaração de que o Dudit está seguro ou pronto para lançamento.
