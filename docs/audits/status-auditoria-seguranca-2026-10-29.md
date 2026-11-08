# Auditoria de segurança da Dudit — registro de andamento

**Data do registro:** 29/10/2026  
**Status:** em andamento; este documento registra o ponto de retomada, não uma aprovação para lançamento.  
**Escopo solicitado:** auditoria ampla do código, banco/RLS, autenticação, autorização, APIs, operações críticas, dependências, configuração e testes, seguida das correções seguras comprovadas.

## Resumo do estado

- Foram encontradas e corrigidas falhas de autorização na alteração de papéis de equipe e em operações de associação de membros a lojas/parceiros. Foi criada uma migration para reforçar o isolamento de `store_members` no banco.
- Foi corrigida a revalidação de cache de permissões após mudanças de acesso.
- Durante a validação de build foi encontrada uma incompatibilidade com Next.js 16: um módulo `"use server"` exportava uma função síncrona. A função pura foi movida para um módulo comum.
- Os testes focados das correções passaram. A suíte completa ainda teve duas falhas nos testes de exclusão de conta por falta de configuração de `TRIGGER_SECRET_KEY`; os fixtures foram ajustados e os testes focados passaram depois disso. A suíte completa não foi repetida.
- `npm audit` não reportou vulnerabilidades em dependências (incluindo a auditoria de produção). `npx tsc --noEmit` passou novamente em 31/10/2026 após as correções financeiras e de devoluções.
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

**Pagamento e acesso financeiro:** mutações de status/pagamento de pedido exigiam `orders.edit`, embora pudessem criar/alterar registros financeiros. Agora status de pagamento em lote e confirmação de pagamento de agendamento também exigem `financial.edit`; criação de pedido marcado como pago exige `financial.create`. Atualização de pedido exige permissão financeira quando altera situação/valor pago/conta. As contas financeiras fornecidas também são verificadas por parceiro e loja.

**Exclusão em lote:** depois de validar IDs e lojas, a ação agora apaga somente os pedidos numa única instrução; `order_items` usa `ON DELETE CASCADE`, então não há mais remoção separada que possa deixar pedido sem itens se outra FK bloquear a exclusão. Anexos existentes bloqueiam a operação até serem removidos. A migration `20261030200000_preserve_stock_movement_ledger_on_order_delete.sql` altera a referência opcional de movimentação de estoque para `ON DELETE SET NULL` e torna anexos `RESTRICT`, preservando o ledger e evitando objetos R2 órfãos. O usuário informou que aplicou; o ledger e o schema ainda não foram consultados nesta sessão.

**Validação desta rodada:** `npx tsc --noEmit` e `git diff --check` passaram. Revisão estática; não houve chamadas ao R2, banco ou provider. A auditoria das demais Server Actions de pedidos e do restante do ERP continua pendente.

### Financeiro ERP — contas e transações em 30/10/2026

**Achados corrigidos localmente:** editar/excluir contas financeiras e alterar a conta padrão não verificavam a permissão da loja da conta; a limpeza de contas padrão podia atingir outras lojas do parceiro. Agora as ações carregam o escopo da conta, verificam `financial.edit` na loja e limitam a alteração de padrão à mesma loja (incluindo contas globais sem loja). Ao criar conta por loja com saldo inicial, o lançamento de abertura agora recebe o `storeId`, permitindo que a validação de referências e a permissão de loja correspondam à conta. A edição das notas de parcelamento também consulta as transações do grupo e exige permissão em cada loja antes de gravar.

**Continuação da revisão financeira:** a listagem de transações agora usa a loja ativa como padrão e exige `financial.view` na loja selecionada. Leituras de detalhe, edição, histórico e grupos de parcelas verificam o escopo da loja; cancelamento de transação verifica `financial.cancel`. Atualização de transação verifica acesso à loja atual e à loja de destino. A criação de parcelamento agora valida loja, conta, método de pagamento, cliente/contato e categorias antes de inserir o grupo.

**Migrations:** o usuário informou que aplicou todas as migrations criadas até esta rodada, incluindo `20261030200000_preserve_stock_movement_ledger_on_order_delete.sql`. O ledger/schema do banco ainda não foi consultado para confirmação independente.

**Validação desta rodada:** `npx tsc --noEmit` e `git diff --check` passaram. Revisão estática; sem testes de integração ou consultas ao banco. A revisão de outras ações financeiras, atomicidade entre criação de conta e saldo inicial e validação de fluxos reais por loja continua pendente.

### Devoluções e evidências — 30/10/2026

**Achados corrigidos localmente:** `getReturnAuditLogsAction` aceitava qualquer usuário autenticado e consultava `audit_logs` só pelo UUID da solicitação; agora confirma a solicitação, o parceiro, `orders.list` e a loja. O detalhe da devolução e as evidências também conferem a loja do pedido, inclusive quando a solicitação legada não tem `store_id`. `escalateReturnRequestAction` consultava dados e disparava aviso antes da autorização; agora exige `orders.can_refund` e a permissão da loja, processa a transição autorizada e só depois envia o aviso.

O salvamento de evidências não comprovava que o pedido pertencia ao parceiro/loja, aceitava chaves R2 informadas pelo cliente e confiava nos metadados do arquivo. Agora consulta a solicitação ativa no parceiro, exige acesso à loja correspondente, prende a chave ao prefixo do usuário, valida o objeto real no R2 e confere tipo/tamanho antes de gravar. O `store_id` persistido vem da solicitação/pedido, não da loja ativa do navegador.

**Validação desta rodada:** `npx tsc --noEmit` e `git diff --check` passaram. Revisão estática; não foram exercitados R2, banco, Mercado Pago ou notificações externas. Permanecem pendentes testes de integração de reembolso, retry, anexos e transições concorrentes.

### RPC de processamento de devolução — 31/10/2026

**Achados confirmados na revisão estática:** as três sobrecargas `SECURITY DEFINER` de `process_return_request` mantinham `EXECUTE` para `authenticated`. O wrapper apenas exigia vínculo ativo com um papel permitido e conferia o ator; não exigia `orders.can_refund` nem a permissão da loja. Um membro autenticado poderia chamar o RPC diretamente e contornar as verificações mais restritas das Server Actions. Além disso, `20260901_fix_return_events_to_audit_logs.sql` recriou `create_return_request` como `SECURITY DEFINER` sem wrapper de contexto nem revogação dos grants padrão, permitindo execução direta via `PUBLIC` e, portanto, potencialmente `anon`; a função validava vínculo entre pedido e parceiro, mas não autenticava o ator. Os locais legítimos encontrados chamam esses RPCs por Server Actions com cliente `service_role`.

**Correção aplicada (informado pelo usuário):** `migrations/20261031100000_restrict_process_return_request_rpc.sql` revoga execução de `PUBLIC`, `anon` e `authenticated` em `create_return_request` e nas sobrecargas existentes de `process_return_request`, concedendo-a somente a `service_role`. A primeira versão usava uma assinatura legada de 12 argumentos e falhou; depois a migration foi corrigida para descobrir as assinaturas instaladas em `pg_proc`, teve o cast do `oidvector` ajustado e o usuário confirmou que aplicou a versão corrigida. Não consultei o catálogo para confirmar os grants. As permissões de comprador, moderador e ERP continuam verificadas pelas Server Actions que executam os RPCs com cliente de serviço.

**Achado adicional:** `create_product_transaction` também aceitava chamadas autenticadas. Seu guard de parceiro/loja aceitava `OPERATOR`, embora o preset padrão desse papel não tenha `products.create`. A migration `20261031110000_restrict_create_product_transaction_roles.sql` ajusta o helper para permitir os papéis padrão `owner`, `admin` e `manager`, mantendo o contrato autenticado e a validação de loja. O usuário confirmou que aplicou esta migration; os grants efetivos e chamadas autenticadas não foram testados no banco.

**Validação:** revisão estática das definições/grants e dos locais de chamada. O usuário informou em 31/10/2026 que aplicou as duas migrations; não houve consulta ao catálogo do banco nem teste direto com papel `authenticated`.

**Compatibilidade dos fluxos existentes — revisão de 31/10/2026:** rastreadas as chamadas aos RPCs financeiros, de estoque e devolução restringidos nas migrations desta auditoria. Os caminhos encontrados passam por Server Actions que fazem autorização/escopo e usam `createAdminClient()`/`getAdminClient()` para executar os RPCs; `create_product_transaction` permanece autenticada porque a ação de cadastro usa cliente de sessão, com o guard de papel atualizado. Não foi identificada quebra estática nesses pontos. Os testes focados `lib/payments/returns-refunds.test.ts`, `lib/permissions/partner-roles.security.test.ts` e `lib/payments/order-financial-state.test.ts` passaram (29/29). Na primeira tentativa, `npx tsc --noEmit` não terminou em mais de dois minutos e foi interrompido sem resultado; uma execução posterior nesta retomada foi concluída sem saída de erro. O usuário informou que aplicou as migrations `20261031100000` e `20261031110000`; grants efetivos ainda não foram consultados. Validar os fluxos em homologação antes de depender plenamente dessas alterações.

### Portal de ordem de serviço — emissão de token público — 31/10/2026

**Achado confirmado:** `ensurePublicTokenAction` era uma Server Action exportada sem autenticação, autorização ou rate limit. Com `partnerId` e `serviceOrderId` conhecidos, qualquer pessoa podia recuperar um token público existente ou criar um novo e receber acesso ao portal da OS, que contém dados do cliente e detalhes comerciais. O token aleatório tem 128 bits, mas a própria ação pública permitia emiti-lo, anulando essa proteção.

**Correção local:** a ação agora exige usuário autenticado, `service_orders.edit`, permissão de edição da loja quando aplicável, plano mínimo Crescer e rate limit. A leitura e gravação são limitadas por OS e parceiro. A emissão usa update condicional para lidar com concorrência e não retornar um token que perdeu a corrida. As respostas de lista e detalhe não expõem mais o token bearer; os três componentes de compartilhamento sempre solicitam o token pela ação autorizada.

**Achado adicional:** a listagem e os detalhes de OS usavam cliente administrativo após verificar apenas a permissão de parceiro. A listagem podia omitir o filtro de loja ou aceitar uma loja arbitrária; detalhes não verificavam acesso à loja da OS. Isso permitia a membro com acesso a uma loja consultar OS de outra loja do mesmo parceiro. Agora a listagem deriva a loja ativa do contexto autenticado, rejeita discrepância com o filtro fornecido e aplica a permissão da loja; detalhes consultam primeiro o `store_id` escopado por parceiro e autorizam a loja antes de ler dados cacheados.

**Validação:** revisão estática dos chamadores e do portal público; `git diff --check` passou; `lib/types/service-order.test.ts` passou (17 testes); `npx tsc --noEmit` encerrou com código 0. Não foram testados login, permissões reais de loja nem o fluxo do link em ambiente integrado.

### Permissões de fornecedores — 31/10/2026

**Achado confirmado:** as duas ações de criação abrangente/legada verificavam `products.create` em vez de `suppliers.create`. Edição, exclusão, duplicação, leitura individual e histórico de importação XML usavam apenas verificação de vínculo ao parceiro (`requireSupplierOwnership`), sem conferir a permissão correspondente no módulo `suppliers`. Isso permitia que membros com acesso ao parceiro, mas sem a permissão específica do módulo, executassem essas operações.

**Correção local:** as ações de criação agora exigem `suppliers.create`. Adicionei um guard que resolve o parceiro a partir do fornecedor armazenado e exige a permissão específica de leitura, edição, exclusão ou criação antes de prosseguir; gravações usam o parceiro resolvido no servidor como escopo adicional. Operações em lote já conferiam a permissão específica e continuam assim.

**Validação:** revisão estática; `git diff --check` e `npx tsc --noEmit` passaram. Não há testes de ação de fornecedor identificados.

### Isolamento e liquidação de agendamentos — 31/10/2026

**Achados confirmados:** consultas de agenda, disponibilidade, alertas de faltas e serviços sem retorno aceitavam loja opcional ou ID enviado pelo cliente sem verificar permissão de loja; algumas consultas administrativas podiam cobrir todas as lojas do parceiro. Histórico, pedidos vinculados e detalhes podiam ser carregados sem confirmar a loja do agendamento/pedido. A leitura de detalhes usava cliente administrativo e recebia IDs de agendamento e pedido sem comprovar que pertenciam ao parceiro. Na criação, os IDs de produto, serviço, variação, item de pedido e pedido não eram todos validados quanto ao parceiro, relação entre si e loja. Na edição, era possível enviar IDs de serviço/cliente de outro parceiro e alterar campos de pagamento que geram lançamentos sem a permissão específica de liquidação financeira.

**Correções locais:** as leituras de agenda derivam a loja do contexto autenticado ou verificam permissão na loja solicitada e limitam o escopo; datas são validadas como ISO antes de compor filtros PostgREST. Detalhes e histórico confirmam parceiro e loja antes de carregar conteúdo; pedidos vinculados exigem permissão e correspondência de parceiro/loja. A criação valida limites do lote, quantidade e tipo de uso dos itens, escopo de produto/serviço, relação variante-produto, além de validar que itens de pedido e pedidos pertencem ao parceiro e à mesma loja. Na edição, serviço e cliente são resolvidos no parceiro, serviço e pedido precisam corresponder à loja, alterar pedido vinculado exige `orders.edit`, e campos/estados que registram liquidação exigem `financial.can_settle` no parceiro e nas lojas envolvidas. Valores pagos precisam ser finitos e não podem exceder o preço; estados de pagamento são aceitos por lista permitida. `syncAppointmentReceivable`, helper interno, deixou de ser exportado pelo módulo `"use server"`.

**Validação:** `lib/erp/appointment-insights.test.ts` e `lib/erp/appointment-customer-resolution.test.ts` passaram (23/23); `git diff --check` passou. `npx tsc --noEmit` foi executado e falhou em alterações paralelas do workspace: `components/BottomSheet.tsx` usa `closeGuard` não declarado, e `components/erp/settings/SubscriptionSubPage.tsx` lê `hasScheduledChange` e `scheduledPlan` antes da declaração. Esses arquivos não foram editados nesta revisão. Sem testes de integração de ações, permissões por loja ou gravações financeiras.

### Leituras de produtos, permissões de estoque e limpeza de mídia — 31/10/2026

**Achados confirmados:** `getCachedProducts` e `getCachedProductById` eram exports de um módulo `"use server"` e consultavam o banco com cliente administrativo sem autenticação/autorização própria; o segundo retornava `SELECT *`. `getProducts` e três relatórios de produto permitiam omitir a loja e ler os registros de todas as lojas do parceiro sem checar a loja ativa. A edição abrangente de produto também aceitava alteração direta de `stock_quantity` com apenas `products.edit`, sem exigir permissão de movimento de estoque. Na limpeza de imagens e variantes, qualquer URL/string de imagem persistida ou enviada por `deletedImages` podia ser convertida em chave e removida do bucket R2, sem validar host nem titularidade da chave. A rotina de edição também tratava imagens omitidas como lista vazia e podia apagar mídias ao salvar outro campo.

**Correções locais:** leituras cacheadas agora validam usuário, parceiro, módulo e loja; o cache estático de produtos recebe filtro de loja. Listagem, reposição, produtos estagnados, alertas de preço e busca por código de barras respeitam o contexto ativo e a permissão de loja; a reposição também exige leitura de fornecedores, pois retorna nome e custo do fornecedor. Alteração de estoque na edição abrangente exige `stock_movements.create` no parceiro/loja, e preços/estoques de produto e variante passam por validação numérica. Limpeza de mídia só ocorre quando a lista de imagens foi realmente enviada e remove apenas chaves do host público R2 configurado sob `users/{usuário atual}/products/`, bloqueando URLs externas e arquivos de outros usuários.

**Validação:** revisão estática e `git diff --check`; ainda sem testes específicos de ações, matriz de permissões, uploads ou exclusões R2. Na última execução, `npx tsc --noEmit` falhou em testes paralelos do workspace (`lib/billing/plan-change.test.ts` e `lib/services/mercadopago/subscriptions.test.ts`) por `await` no topo sem configuração de módulo compatível e referências `putCall` possivelmente indefinidas; não houve erro apontado nos arquivos de produtos/clientes desta rodada.

### Histórico e créditos de clientes — 31/10/2026

**Achados confirmados:** `getCustomerOrdersAction` retornava pedidos, valores, status e itens só com `customers.view`, ignorando a permissão própria `orders.view`. As consultas de pedidos e créditos no detalhe de cliente e os totais da listagem não aplicavam a loja ativa, permitindo que um membro com acesso a uma loja consultasse histórico/valores de outras lojas do mesmo parceiro. O detalhe devolvia `birth_date` mesmo quando a permissão `customers.view_personal_data` era negada; a listagem já removia esse campo.

**Correções locais:** o histórico exige `orders.view` e limita pedidos/totais à loja ativa (incluindo registros sem loja). Totais de pedidos só são consultados e devolvidos para quem tem permissão de leitura de pedidos; a página de clientes aplica redaction também após cache. Créditos exigem `financial.view` e respeitam a loja ativa. O detalhe agora oculta data de nascimento e IDs de usuário sem `customers.view_personal_data`. A tabela `customers` deixou de ter `store_id` numa migration de rollback existente, então os registros do cliente continuam intencionalmente no escopo do parceiro; o filtro por loja aplica-se aos pedidos e créditos associados.

**Validação:** revisão estática e `git diff --check` passaram; `npx tsc --noEmit` não reportou erros nos arquivos de produtos/clientes desta rodada, mas segue falhando nos testes paralelos citados acima. Ainda sem teste integrado de papéis, loja ativa, histórico ou crédito.

### Criação e edição de pedidos ERP — 01/11/2026

**Achado confirmado:** criação e edição de pedidos usavam cliente administrativo para gravar `order_items`, mas não validavam de forma independente a propriedade dos IDs de produtos, serviços e variações. A validação de estoque não era suficiente porque podia ser ignorada por configuração e não verificava titularidade. Um pedido poderia, portanto, receber referência a item de outro parceiro/loja ou a variação de outro produto. A criação também aceitava um `sourceQuoteId` sem confirmar o parceiro. A leitura do orçamento de origem tentava localizar por ID/número sem escopo de parceiro.

**Correções locais:** itens agora têm limites e validação de formato/quantidade/preço; produtos e serviços são resolvidos dentro do parceiro e loja do pedido; cada variação precisa existir e pertencer ao produto informado. A checagem ocorre tanto na criação quanto na edição e não depende da política de estoque negativo. Descontos exigem também a permissão efetiva na loja. A cotação de origem é validada por parceiro antes da criação, e todas as buscas da cotação no detalhe do pedido filtram pelo parceiro. A atualização de pagamento em lote compara `updated_at` lido no snapshot na própria escrita; se outra operação alterou o pedido, pula esse pedido, retorna aviso e não cria lançamentos, auditoria ou notificações para a gravação que perdeu a disputa. O modal também envia a versão do pedido que carregou; valores absolutos recebidos com uma versão antiga são recusados antes da alteração. A verificação de concorrência também vale para o caminho de compatibilidade de schema sem as colunas de delta.

**Validação:** revisão estática, `git diff --check` e `npx tsc --noEmit` passaram. Não houve consulta ao banco nem teste de integração de criação/edição com recursos de outro parceiro ou loja. Também não foram simuladas duas gravações concorrentes na atualização em lote.

**Limite residual:** a proteção evita sobrescrever uma versão concorrente, mas a gravação do pedido e a criação posterior de transações financeiras ainda não compartilham uma única transação PostgreSQL. Falhas entre essas etapas precisam de teste/reconciliação em homologação.

### Liquidação financeira em lote — 01/11/2026

**Achado confirmado:** `updateFinancialTransactionsInBatchAction` liquidava cada transação com INSERT no ledger de pagamentos, UPDATE da transação e delta do saldo em três chamadas independentes. Duas execuções podiam inserir pagamentos duplicados e aplicar o saldo duas vezes; uma falha intermediária também podia deixar o ledger, status e saldo divergentes. O cancelamento/reagendamento em lote também gravava após validar elegibilidade numa leitura anterior, sem condicionar a mutação ao status/versão lidos.

**Correções locais:** liquidação em lote agora usa a RPC atômica e idempotente, inclusive para parcelas, e preserva a data de quitação solicitada. Foi criada a migration `20261101160000_atomic_batch_transaction_settlement_date.sql`, com uma wrapper restrita a `service_role` sobre a RPC existente. Cancelamento, reagendamento e alteração de categoria usam comparação do status/`updated_at` e só registram auditoria quando a gravação condicional afeta a transação. Os lotes limitam seleção a 200 IDs e rejeitam IDs inválidos ou repetidos.

**Pendente:** validar quitação em lote concorrente e reconciliação ledger/status/saldo em homologação. O usuário informou que aplicou `20261101160000_atomic_batch_transaction_settlement_date.sql` e `20261101130000_atomic_close_cash_session.sql`; não confirmei independentemente o ledger nem os grants nesta sessão.

### Leitura financeira por loja e fechamento de caixa — 01/11/2026

**Achados confirmados:** `getFinanceAccountsAction` retornava contas e saldos de todas as lojas quando os chamadores omitiam `storeId`, embora isso ocorra no uso normal e o contexto ERP tenha uma loja ativa. As ações de caixa ativo e histórico tinham o mesmo comportamento sem `storeId`. O fechamento de caixa calculava saldo e contagens a partir de uma leitura anterior e depois atualizava a sessão; uma movimentação concorrente podia ser gravada no intervalo e ficar fora do fechamento. O saldo esperado também não subtraía reembolsos em dinheiro, embora a verificação de sangria já os subtraísse.

**Correções locais:** a listagem de contas valida o parceiro ativo e, sem loja explícita, usa a loja ativa e inclui contas globais; a permissão da loja é checada antes da leitura. As leituras de sessão ativa e histórico também derivam a loja ativa, validam parceiro/loja e falham fechado se não houver loja resolvida. O saldo esperado e o fechamento subtraem reembolsos em dinheiro. O fechamento chama `erp_close_cash_session_atomic`, que bloqueia a sessão, recalcula o saldo e grava o fechamento enquanto mantém o lock usado pela RPC de movimentação; valida métodos de pagamento e valores de contagem e só pode ser executada por `service_role`. As RPCs existentes de sangria/reforço e estorno agora são chamadas com o cliente autenticado, necessário para `auth.uid()` nas funções `SECURITY INVOKER`; em erro, a ação falha fechado em vez de gravar por um caminho de fallback sem lock. O resumo é recarregado após o fechamento.

**Estado da migration:** o usuário informou que aplicou `20261101130000_atomic_close_cash_session.sql`; não confirmei o ledger, a função ou os grants no banco.

**Teste em homologação pendente:** abrir uma sessão de caixa descartável, fechar enquanto uma movimentação é enviada em paralelo e confirmar que ou a movimentação entra antes do fechamento e nos totais, ou é recusada porque a sessão fechou. Também conferir que erros nas RPCs de movimentação não geram gravação parcial.

**Validação:** revisão estática, `git diff --check` e `npx tsc --noEmit`; não foram feitas gravações no banco nem testes concorrentes em homologação.

### Criação de lançamentos financeiros — 02/11/2026

**Achado confirmado em revisão estática:** a criação de lançamento manual gravava primeiro em `transactions` e depois alterava o saldo da conta em uma chamada separada. A transferência gravava as duas linhas do par e, quando confirmada, aplicava os dois deltas de saldo em chamadas separadas. Uma falha intermediária podia deixar linha sem saldo correspondente, transferência incompleta ou apenas uma das contas movimentada.

**Correção local:** ambas agora chamam `create_manual_financial_transactions_atomic`, que valida parceiro/conta, insere as linhas e calcula/aplica os deltas em uma transação PostgreSQL, com lock ordenado das contas. Foi criada a migration `20261102100000_atomic_manual_transactions_and_transfers.sql`; o usuário informou que aplicou, mas não confirmei no ledger/schema. Ela também corrige a divergência das migrations históricas sobre os tipos aceitos e deixa a constraint `NOT VALID` para preservar registros antigos desconhecidos. Revisão estática local; SQL ainda não foi executado contra PostgreSQL.

**Validação local:** `tsc --noEmit` passou e `git diff --check` passou nos arquivos acompanhados; não executei testes nem consultas ao banco.

**Correções locais desta retomada:** parcelamentos agora chamam `create_installment_group_atomic`, que cria grupo, parcelas e eventual delta da primeira parcela em uma transação; recorrências agora chamam `record_recurring_occurrence_payment_atomic`, que bloqueia o modelo, cria/localiza a ocorrência e registra pagamento, status e saldo na mesma transação. A chave idempotente é estável por recorrência/data. Ambas estão na migration `20261102110000_atomic_installments_and_recurring_payments.sql`; o usuário informou que aplicou, sem confirmação independente no ledger/schema.

**Validação local:** `tsc --noEmit` passou e `git diff --check` passou nos arquivos acompanhados. Não rodei testes nem consultei o banco; o SQL da migration continua pendente de aplicação e validação em PostgreSQL.

**Pendente:** validar em homologação criação de parcelamento com primeira parcela paga/pendente, quitação de ocorrência nova/existente e chamadas concorrentes. O usuário informou que aplicou a migration; não confirmei o ledger/schema nem executei o SQL contra PostgreSQL nesta sessão.

**Contas financeiras — correção adicional:** criação com saldo inicial e atualização de conta/padrão agora usam `create_finance_account_with_opening_balance_atomic` e `update_finance_account_atomic`. A migration `20261102120000_atomic_finance_account_lifecycle.sql` ainda precisa ser aplicada. Metadados reservados de integração foram removidos do input da Server Action. `tsc --noEmit` e `git diff --check` passaram; o SQL não foi executado contra PostgreSQL.

### Contas financeiras e saldo inicial — 02/11/2026

**Achados confirmados:** criar conta e registrar saldo inicial eram operações separadas, podendo deixar uma conta com saldo zero após a ação retornar falha. A escolha de conta padrão também limpava/definia valores em chamadas separadas e ignorava erros. A Server Action aceitava `isSystemManaged`/`integrationSource` vindos do cliente, embora nenhum chamador legítimo da interface use esses campos.

**Correção local:** criação da conta, eventual lançamento de ajuste de abertura e seleção de conta padrão agora são atômicos. Atualização de conta e troca do padrão também usam uma RPC com lock por parceiro. A ação não permite mais atribuir metadados de conta gerenciada/origem de integração. A validação de saldo rejeita valores inválidos em vez de convertê-los silenciosamente para zero.

**Correção adicional:** a criação da transação financeira de pagamento de agendamento também passou a usar uma RPC idempotente que bloqueia o agendamento e grava a transação/saldo atomicamente.

**Migration:** `20261102120000_atomic_finance_account_lifecycle.sql`. Ela usa a RPC de transações atômicas criada em `20261102100000`; o usuário informou que aplicou ambas, sem confirmação independente do ledger/schema.

**Validação pendente:** verificar em homologação criação com saldo inicial zero/positivo/negativo, conta padrão concorrente e atualização de conta. O usuário informou que aplicou as migrations; não confirmei o ledger/schema nem consultei o banco nesta sessão.

**Liquidação à vista de pedidos — correção local:** criação e refinamento da liquidação agora usam `create_order_settlement_atomic` e `refine_order_settlement_atomic`, serializados pela referência estável. O usuário informou que aplicou `20261102130000_atomic_order_settlement_balance.sql`, sem confirmação independente no ledger/schema. A correção evita commit parcial de linha/saldo em novos eventos; divergências anteriores exigem reconciliação.

**Validação desta rodada:** `tsc --noEmit` e `git diff --check` passaram. Não executei testes nem consultas ao banco; a migration SQL aguarda aplicação/validação em PostgreSQL.

**Vendas a prazo — correção local:** a criação/reparação do grupo e das linhas de parcelamento agora usa `upsert_order_installment_ledger_atomic`. A função serializa pela referência do pagamento, recupera grupos parciais de tentativas antigas e ajusta o saldo junto com mudanças de valor em parcelas que já tenham sido pagas. O usuário informou que aplicou `20261102140000_atomic_order_installment_ledger.sql`; não confirmei o ledger/schema nesta sessão.

**Validação local:** `tsc --noEmit` e `git diff --check` passaram antes desta rodada. Não rodei testes nem consultas ao banco; a aplicação da migration foi informada pelo usuário.

**Estorno de recorrência — correção local:** estorno e ajuste do saldo agora são gravados pela RPC `reverse_subscription_cycle_financials_atomic`, com bloqueio do pedido, chave idempotente por pagamento/status/total acumulado informado pelo Mercado Pago e atualização do pedido na mesma transação. O cálculo trata `transaction_amount_refunded` como total acumulado, registra a transação mesmo quando não há conta financeira vinculada e ainda reconcilia o financeiro se o pedido já estava cancelado. A busca exige vínculo exato do `mp_payment_id`; removi o fallback que poderia associar um webhook sem pedido correspondente ao ciclo mais recente da assinatura. O usuário informou que aplicou `20261102150000_atomic_subscription_refunds.sql`; não confirmei no ledger/schema.

**Validação desta rodada:** `npx tsc --noEmit` e `git diff --check` passaram; a migration também não tem whitespace no fim das linhas. Não rodei testes, SQL nem consultas ao banco. O usuário informou que aplicou a migration; validar em homologação webhook repetido, reembolso parcial cumulativo, estorno total, pedido previamente cancelado e pedido sem conta financeira.

### Confirmação de pagamento em agendamento — 02/11/2026

**Achados confirmados em revisão estática:** `confirmAppointmentOrderPaymentAction` aceitava redução do preço do pedido pela entrada do cliente sem exigir `orders.can_apply_discount`; IDs de serviço e método de pagamento também não eram validados contra parceiro/loja. Um helper interno de sincronização de entrega estava exportado em um módulo com `"use server"`, ampliando sem necessidade a superfície de ações remotas.

**Correção local:** a ação agora valida formato/limites dos dados de pagamento, exige permissão de desconto quando o preço ou desconto reduzem o pedido, limita serviço e métodos ao parceiro/loja do pedido e escopa a leitura/remapeamento de agendamentos pelo parceiro. O helper interno deixou de ser exportado. Não foi criada migration.

**Validação local:** `npx tsc --noEmit` e `git diff --check` passaram. Sem testes ou chamada ao banco.

### Cancelamento em lote com reembolso — 02/11/2026

**Achado confirmado:** `updateOrdersStatusInBatchAction` autorizava o cancelamento com `orders.cancel`, mas aceitava também `generateAutomaticRefund` sem exigir `orders.can_refund` no parceiro e na loja. O helper fazia inserts de reembolso e deltas de saldo em chamadas separadas e calculava o restante fora de lock, permitindo duplicidade em chamadas concorrentes. A seleção de conta fallback também não restringia a loja do pedido.

**Correção local:** agora o reembolso exige a permissão específica `orders.can_refund` no escopo do parceiro/loja. O helper usa a RPC `create_order_cancellation_refunds_atomic`, que bloqueia o pedido, valida loja/conta/métodos, impede ultrapassar o valor ainda reembolsável e grava as linhas e o débito do saldo na mesma transação, com chave idempotente estável por pedido/linha. Contas fallback ficam limitadas à loja do pedido ou contas globais. A ação também compara `updated_at` no cancelamento antes de iniciar efeitos colaterais, para que apenas uma requisição concorrente vença. O nome em notas usa o perfil autenticado, sem fallback para nome enviado pelo cliente. O usuário informou que aplicou `20261102160000_atomic_order_cancellation_refunds.sql`; não confirmei no ledger/schema.

**Hardening adicional do status de pagamento:** o `expectedUpdatedAt` agora é obrigatório para qualquer chamada que envie valor ou detalhamento do pagamento, e tais chamadas ficam limitadas a um pedido. Valores/IDs do breakdown passam por validação; métodos são resolvidos no parceiro e loja do pedido; descontos exigem `orders.can_apply_discount` e não podem superar o total. Removi a aceitação do `mpPaymentId` superior porque nenhum chamador legítimo desta ação o usa; IDs de pagamento do Mercado Pago novos também não podem ser injetados no breakdown. Isso reduz alteração concorrente e vínculo indevido de dados de pagamento.

**Validação local:** `npx tsc --noEmit` e `git diff --check` passaram; a migration não tem whitespace no fim das linhas. Não rodei testes, SQL ou consultas ao banco. Falta validar cancelamento concorrente e reembolso em homologação.

### RPC de movimentação de estoque — 30/10/2026

**Achado confirmado:** `create_batch_stock_movement` é `SECURITY DEFINER` e sua ramificação de variantes validava o par variante/produto, mas não validava o `partner_id` do produto. A Server Action também não confirmava que todos os produtos e variantes enviados pertenciam ao parceiro ativo. Um usuário de um parceiro podia, portanto, fornecer um produto e uma variante de outro parceiro, provocando alteração de estoque via RPC de serviço.

**Correção local:** as ações de movimento simples e em lote agora resolvem todos os produtos e variantes, verificam a relação variante-produto, parceiro e loja antes de chamar a RPC e limitam os lotes. Foi criada a migration `20261030190000_harden_batch_stock_movement_tenant_scope.sql` para impor as verificações de parceiro, relação variante-produto e loja dentro da transação do banco, mantendo execução apenas por `service_role`. O usuário informou que aplicou esta migration; a aplicação não foi confirmada no ledger/schema nesta sessão.

**Validação desta rodada:** `npx tsc --noEmit` e `git diff --check` passaram. Não houve consulta ao banco nem execução da RPC.

**Arquivos alterados nesta revisão:** `app/api/internal/jobs/process-pending-webhooks/route.ts`, `app/api/mercadopago/webhook/route.ts`, `app/api/mercadopago/webhook/subscription/route.ts`, `supabase/functions/mercadopago-webhook/index.ts`.

**Validação:** revisão estática de `cash-register.ts`, da migration SQL, das rotas R2, do acesso a clientes e do fluxo de webhooks. Sem testes, TypeScript, build ou consultas ao banco. A validação de whitespace dos arquivos desta rodada foi feita separadamente; a checagem global segue apontando whitespace em alteração paralela de `components/marketplace/ExplorarPageClient.tsx`.

**Arquivos alterados nesta rodada:** `app/actions/erp/cash-register.ts`, `app/actions/erp/transactions.ts`, `app/api/r2/video-upload/route.ts`.

## Pendências para retomar

### Prioridade alta — autorização, pagamentos e isolamento

- [ ] Concluir a análise de Mercado Pago: validar em homologação a concorrência e os eventos de reversão; definir prevenção de intenções simultâneas e processo de estorno/reconciliação de excedentes; conferir os papéis legítimos que podem cobrar.
- [ ] Revisar todas as Server Actions e Route Handlers de ERP para autorização em cada mutação e escopo por parceiro/loja, priorizando pedidos, clientes, produtos, estoque, agendamentos e financeiro.
- [x] Revisão focada das leituras/criação/edição/exclusão de agendamentos: escopo de parceiro/loja e IDs relacionados ajustados; ainda falta validação integrada por papéis e lojas.
- [x] Revisão focada de leituras, estoque e limpeza R2 no módulo de produtos; ainda falta validação integrada por papéis, lojas e armazenamento.
- [ ] Revisar ações de lote, IDs relacionados e casos de mass assignment; confirmar que o escopo também é aplicado nas gravações e exclusões.
- [ ] Confirmar no ledger/grants a aplicação de `20261030170000_restrict_financial_balance_delta.sql` e `20261030180000_atomic_transaction_payment.sql`; testar concorrência/idempotência de pagamentos em homologação.
- [ ] Confirmar no ledger/schema a aplicação de `20261101130000_atomic_close_cash_session.sql` e exercitar fechamento concorrente com venda, sangria e reembolso em homologação; o usuário informou que aplicou.
- [ ] Confirmar no ledger/schema a aplicação de `20261101160000_atomic_batch_transaction_settlement_date.sql` e exercitar quitação em lote concorrente/reconciliação; o usuário informou que aplicou.
- [ ] Confirmar no catálogo os grants após `20261031100000_restrict_process_return_request_rpc.sql` e `20261031110000_restrict_create_product_transaction_roles.sql`; o usuário informou que ambas foram aplicadas.
- [ ] Confirmar no ledger/schema a aplicação da migration `20261030200000_preserve_stock_movement_ledger_on_order_delete.sql` antes de depender da preservação do histórico de estoque e da restrição de exclusão com anexos. O usuário informou que aplicou.
- [ ] Reconciliar fluxos de estorno/cancelamento para alinhar efeito no gateway, ledger e saldo local; validar repetição/concorrência em homologação após `20261102160000_atomic_order_cancellation_refunds.sql` (aplicação informada pelo usuário, sem confirmação no ledger).
- [ ] Validar repetição/estorno parcial cumulativo em homologação após `20261102150000_atomic_subscription_refunds.sql`; o usuário informou que aplicou a migration, sem confirmação independente do ledger.
- [ ] Revisar as demais regras de papéis e permissões por módulo, incluindo operações administrativas e convites.
- [ ] Revisar migrations/policies RLS existentes e comparar com a nova migration; verificar conflitos, tabelas sem RLS, views, RPCs, triggers, grants, Storage e Realtime conforme presentes no projeto.
- [ ] Confirmar/renovar a chave pública Supabase do ambiente local com o dashboard e repetir a inspeção RLS via conexão PostgreSQL com certificado confiável. Não substituir a chave pública por uma chave de serviço.
- [ ] Confirmar o registro/ambiente da migration pelo ledger e consultar `pg_policies`, grants e `relrowsecurity` por conexão PostgreSQL com TLS confiável. Só então adicionar/rodar testes de integração em homologação que provem leitura e escrita legítimas, bloqueio entre parceiros/lojas e ausência de efeitos colaterais. Não reaplicar nem alterar políticas em produção nesta auditoria.

### Demais áreas de segurança ainda não concluídas

- [ ] Autenticação e contas: login, cadastro, recuperação, OTP, sessão, cookies, redirecionamentos, convites, alteração de credenciais e exclusão de conta.
- [ ] Webhooks e jobs: ingress e reprocessamento receberam hardening local; falta implantar e validar em homologação os estados de assinatura, retry e armazenamento, além de auditar os demais jobs e webhooks.
- [ ] Uploads e arquivos: o usuário informou que aplicou `20261103100000_atomic_order_attachment_registration.sql`, a versão corrigida de `20261103110000_atomic_other_attachment_registration.sql` e `20261103120000_restrict_attachment_table_writes.sql`; ainda falta verificar no catálogo, validar PUT assinado/R2 em homologação e revisar as políticas/configuração pública do bucket.
- [ ] XSS e conteúdo: revisar o restante das superfícies de HTML/Markdown, atributos `style` aceitos e adotar CSP com nonce após mapear scripts de terceiros e requisitos de cache/renderização dinâmica.
- [ ] Rate limiting e abuso: cobertura dos endpoints sensíveis, concorrência, repetição de operações e limites de payload/processamento.
- [ ] Secrets e configuração: busca de credenciais no código, histórico/arquivos, logs, headers de segurança, CORS, CSP, `next.config`, proxy e configurações de deploy/CI.
- [ ] Dependências e cadeia de fornecimento: interpretar os resultados do audit, revisar scripts e dependências relevantes sem atualizações amplas.
- [ ] Logs e trilha de auditoria: verificar eventos privilegiados e garantir ausência de tokens, secrets ou dados sensíveis nos logs.
- [ ] Revisar o diff completo e mudanças paralelas do workspace para separar alterações desta auditoria de alterações pré-existentes/concorrentes.

### Validação final

- [x] `npx tsc --noEmit` passou em 31/10/2026.
- [ ] Repetir o build depois das alterações finais; o usuário havia solicitado executar o build por conta própria.
- [ ] Repetir suíte completa depois dos ajustes dos fixtures, caso faça sentido no ambiente disponível; guardar separadamente resultados focados e completos.
- [ ] Definir/rodar lint quando houver ferramenta/configuração disponível; por ora não há script nem binário detectado.
- [ ] Fazer revisão final de migration, policies, diff, secrets acidentais e fluxos legítimos impactados.
- [ ] Preparar entrega final com achados classificados, evidências, arquivos, correções, testes, pendências de homologação e riscos residuais.

## Arquivos tocados nesta etapa conhecida

O diff inclui ainda alterações paralelas no workspace em `app/actions/erp/subscriptions.ts`, `components/erp/settings/SubscriptionSubPage.tsx`, `lib/billing/record-charge.ts`, `lib/billing/sync-subscription.ts`, `lib/services/mercadopago/subscriptions.ts` e `lib/services/subscription.service.ts`; elas não foram editadas nem atribuídas à auditoria nesta retomada.

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
- `migrations/20261031100000_restrict_process_return_request_rpc.sql`
- `migrations/20261031110000_restrict_create_product_transaction_roles.sql`
- `app/actions/erp/produtividade.ts`
- `app/actions/erp/appointments.ts`
- `lib/services/transaction.service.ts`
- `lib/services/recurring-execution.service.ts`
- `lib/services/transaction.service.ts`
- `lib/services/recurring-execution.service.ts`
- `app/actions/erp/returns.ts`
- `app/actions/erp/service-orders.ts`
- `app/actions/erp/suppliers.ts`
- `components/erp/service-orders/ServiceOrderDetail.tsx`
- `components/erp/service-orders/ServiceOrdersPage.tsx`
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

**Conclusão deste registro:** há correções localizadas implementadas e testes focados aprovados, mas a auditoria permanece incompleta. Não usar este documento como declaração de que a Dudit está seguro ou pronto para lançamento.

### Anexos de pedidos — 03/11/2026

**Achados confirmados:** o limite por tipo de arquivo era conferido antes da gravação sem lock, permitindo que duas confirmações simultâneas ultrapassassem o limite do plano. `fileHash` era persistido diretamente do cliente e só havia cálculo de fallback para objetos pequenos; assim, o hash não comprovava o conteúdo armazenado. A exclusão do objeto R2 também ignorava erros retornados pela remoção da linha no banco. Na ação de anexos de OS, o ID do serviço não era conferido contra o parceiro antes de inserir com cliente admin, e o objeto no R2 não era verificado.

**Correção local:** a confirmação de anexos de pedidos e OS agora lê o objeto no R2 em fluxo, calcula o SHA-256 do conteúdo efetivo e compara com o hash do cliente quando fornecido. Os IDs são conferidos contra parceiro e loja; limites/insert são transacionais por lock do pedido ou da OS e ficam restritos a `service_role`. A emissão de URL de OS aceita apenas prefixos usados pelo produto e valida tipo/tamanho. A migration já informada como aplicada criou índice único para chaves de anexos de pedidos. A exclusão de anexo de pedido agora verifica o erro da operação de banco.

**Pendente:** os catálogos live agora confirmam o índice único em `order_attachments` e as RPCs de registro; o ledger ainda não lista as migrations de novembro. A migration de anexos ERP não cria índices únicos globais porque há chaves duplicadas legadas; uma função com advisory lock rejeita reutilização de chave nos novos registros. As URLs PUT assinam o tamanho esperado; comportamento no navegador/R2 precisa de upload em homologação. Não consultei objetos no R2.

**Validação local:** `npx tsc --noEmit` e `git diff --check` passaram; sem testes ou chamadas ao banco/R2.

### Outros anexos ERP — 03/11/2026

**Achados confirmados:** anexos de movimentação, transação e devolução aceitavam o hash do cliente sem comparação obrigatória com o objeto no R2 e contavam registros antes do insert sem lock, permitindo ultrapassar o limite em chamadas concorrentes. A emissão de URL de evidência de devolução também não aplicava rate limit.

**Correção local:** `verifyUploadedObject` confere tamanho e Content-Type no R2, calcula SHA-256 em streaming e compara o hash informado pelo cliente. As gravações de OS, movimentação, transação e devolução usam RPCs transacionais que bloqueiam o registro pai, revalidam o parceiro e aplicam o limite junto com o insert; execução das RPCs fica restrita a `service_role`. As URLs PUT passam a assinar o tamanho e a emissão de evidência recebeu rate limit. Uma função com advisory lock rejeita a reutilização de chaves novas e preserva as duplicatas legadas sem modificá-las.

**Pendente:** a primeira tentativa de `20261103110000_atomic_other_attachment_registration.sql` falhou ao criar índice único devido a chaves duplicadas preexistentes em `stock_movement_attachments`. A versão corrigida está refletida nas RPCs live e o banco mantém 2 grupos de chaves duplicadas legadas sem índice global único. A auditoria de policies do Storage permanece aberta.

**Validação local:** `npx tsc --noEmit` e `git diff --check` passaram; nenhum teste, SQL ou acesso ao R2 foi executado.

### Rotas R2 e evidências de devolução — 03/11/2026

**Achados confirmados:** o endpoint genérico `get-signed-url` não tinha rate limit, não exigia tamanho e aceitava também prefixos privados do ERP. Os uploads de devolução/reembolso não assinavam o tamanho informado. No fluxo de criação de devolução, a RPC recebia URL e chave de evidência controladas pelo cliente via ação de servidor privilegiada; a ação de download assinava a chave persistida sem confirmar que pertencia ao autor da evidência.

**Correção local:** a rota genérica agora aplica rate limit, exige tamanho inteiro assinado e só aceita prefixos de mídia de cadastro usados pelo produto. O hook inclui o tamanho real. As rotas de evidência passam a exigir e assinar o tamanho; rotas de vídeo assinam tamanho do vídeo e miniatura e limitam o campo de primeiros bytes. A exclusão genérica de R2 recebeu rate limit. Antes de criar devoluções, as ações agora validam prefixo do autor, URL pública exata, metadados e conteúdo no R2; a leitura assina apenas a chave registrada e confirma que ela corresponde ao autor que enviou a evidência.

**Pendente:** validar esses PUTs no navegador/R2 e verificar políticas/configuração de acesso do bucket. Não foi necessária migration nesta etapa; não consultei o R2 nem o banco.

**Validação local:** `npx tsc --noEmit` e `git diff --check` passaram; nenhum teste foi executado.

### Grants de escrita das tabelas de anexos — 03/11/2026

**Achado confirmado:** as policies RLS de várias tabelas de anexos permitiam `FOR ALL` para usuários autenticados. Isso deixava um caminho PostgREST de escrita direta, capaz de contornar os novos controles das RPCs e cadastrar chaves de outros objetos. O importador XML também grava anexos com cliente admin e precisa continuar funcionando.

**Correção local:** `20261103120000_restrict_attachment_table_writes.sql` revoga INSERT/UPDATE/DELETE dos papéis `PUBLIC`, `anon` e `authenticated`, concede DML a `service_role` e substitui policies `FOR ALL` por policies somente de leitura, preservando o filtro por parceiro/loja e a leitura do comprador.

**Verificação live read-only:** usando a conexão do ambiente com `sslmode=require`, consultei catálogos PostgreSQL e uma contagem agregada de chaves duplicadas dentro de `BEGIN READ ONLY`, encerrando com `ROLLBACK`; nenhum valor de chave foi exibido. As cinco tabelas estão com RLS habilitado; `anon` e `authenticated` não têm INSERT/DELETE efetivos, e `service_role` mantém as gravações. As policies ativas das tabelas são somente `SELECT`; as policies `buyer_read` e `return_evidence_select_customer` estão como `PUBLIC`, mas exigem `auth.uid()` igual ao comprador/cliente. As quatro RPCs de anexos e `register_return_evidence_atomic` existem como `SECURITY DEFINER`; `EXECUTE` está restrito a `service_role`, e o helper de chave também não é executável por `anon`/`authenticated`. O certificado do servidor não foi validado nesse modo TLS.

**Índices/dados live:** há índice único para chaves em `order_attachments` e `service_order_attachments`; não há índice global único nas outras tabelas, como planejado para preservar registros legados. A consulta encontrou 2 grupos de `file_key` duplicada em `stock_movement_attachments`, reforçando a necessidade do helper transacional que rejeita reutilização em novos registros.

**Ledger:** `supabase_migrations.schema_migrations` tem 10 registros e o mais recente é `20261025162024`; não há entradas `20261103`. Os objetos/grants ativos acima confirmam que as mudanças de anexos estão presentes no banco consultado, mas o ledger não registra essas migrations. Antes de voltar a usar aplicação automática de migrations, alinhar o histórico com o procedimento operacional do projeto para evitar replay acidental. Para validar a identidade do servidor TLS em conexões futuras, configurar o certificado raiz do Supabase e `verify-full`.

**Ainda pendente:** exercitar em homologação leitura legítima e os fluxos de criação/exclusão pela Server Action e importação XML via serviço. A inspeção dos catálogos não substitui esses testes de comportamento.

**Storage/R2:** não encontrei migrations SQL locais que definam policies em `storage.objects`/`storage.buckets`. O repositório contém apenas o CORS de R2 (`docs/infrastructure/r2-bucket-cors.json`), que não informa se o bucket ou domínio `img.dudit.com.br` permite leitura pública. Essa configuração precisa ser conferida no painel Cloudflare; chaves em prefixos marcados como privados não devem ser servidas publicamente.

**Revisão adicional de R2 — 03/11/2026:** o código usa um único bucket configurado para mídia pública e documentos privados. `getR2PublicUrl()` cai automaticamente no endpoint `https://<bucket>.r2.dev` quando não há CDN/dev URL configurada; se o acesso público R2.dev estiver habilitado, os documentos ERP nesse mesmo bucket podem ser lidos diretamente pelo caminho, sem passar pelas Server Actions que emitem URL assinada. Removi o retorno de `publicUrl` de `uploadBufferToR2`, usado para gravar XML fiscal privado, para não expor URL pública nessa resposta. Isso não bloqueia leitura direta se o bucket ou domínio estiver público. CORS não determina leitura pública. Não há integração Cloudflare/painel nem credencial de administração de bucket disponível nesta sessão para confirmar esse estado; manter como pendência operacional e preferir bucket separado para objetos privados.

**Confirmação pelo usuário e teste sem autenticação — 03/11/2026:** as capturas mostram `img.dudit.com.br` Ativo com acesso Habilitado, enquanto apenas a URL `r2.dev` está desativada. Um `HEAD` anônimo no domínio para um XML fiscal já referenciado no banco respondeu HTTP 200 (`application/xml`, `cf-cache-status: DYNAMIC`); nenhum corpo nem chave foi exibido. Isso confirma que o objeto alcançável por esse caminho não está protegido por autorização de aplicação. Contagens agregadas e grants foram consultados em transações PostgreSQL `READ ONLY` com `ROLLBACK`; os grants da migration `20261103170000` confirmam execução somente por `service_role`. O ledger continua em 10 entradas, com última versão `20261025162024`, apesar dos grants live.

**Ação recomendada:** manter `dudit` como bucket público apenas para mídia de marketplace e criar `dudit-private` sem domínio customizado e com R2.dev desligado. Migrar anexos ERP, XMLs fiscais, evidências de devolução, documentos de clientes e arquivos temporários para o bucket privado; ajustar o servidor para escolher o bucket pelo tipo de chave e assinar downloads autorizados; depois apagar os originais públicos e purgar caminhos afetados do cache. Desabilitar agora o acesso do domínio atual contém a exposição, porém interrompe as imagens públicas até a separação estar pronta. O estado Cloudflare foi fornecido por capturas do usuário; não foi alterado pelo agente.

**Separação implementada localmente — 03/11/2026:** o roteamento de R2 passou a classificar chaves privadas pelo prefixo normalizado (inclusive `users/{id}/...`) e usa `CLOUDFLARE_R2_PRIVATE_BUCKET`; se a variável não estiver configurada, operações em objetos privados falham fechadas. Uploads privados deixam de receber URL pública; downloads continuam sendo URLs assinadas emitidas pelos fluxos que já autorizam cliente/loja/portal. As validações diretas de anexos de pedido e OS e a exclusão de conta também selecionam/limpam os dois buckets. Cópia entre classes pública/privada é bloqueada no helper de duplicação de mídia.

**Revisão de prefixos:** produtos/serviços de marketplace, logos/banners de loja e vídeos de comunidade ficam públicos por serem conteúdo que a loja publica; pedidos e OS foram classificados como privados em todo o prefixo, além de XMLs, anexos ERP, documentos de clientes, devoluções, reembolsos e temporários. Fotos de clientes e fornecedores do cadastro ERP também foram classificadas privadas; uploads e consultas agora usam chave privada e URLs assinadas após permissão do parceiro. Documentos de clientes usam `customers/documents/`.

O upload de evidência de devolução do marketplace agora não exige nem persiste URL pública; `file_key` é o identificador e os detalhes ERP emitem URL assinada após conferir parceiro/loja e autor. A migration `20261103180000_allow_private_return_evidence.sql` remove `NOT NULL` de `return_evidence.file_url` para compatibilizar isso; aplicar antes de testar o envio de evidência privada.

Foi criado `npm run migrate:r2-private`, que lista objetos no bucket público, copia os prefixos privados para o bucket novo, verifica metadados e mostra apenas contagens; não apaga objetos de origem e não foi executado. Antes de usar: manter `dudit-private` sem domínio customizado e com acesso público/R2.dev desligado; configurar `CLOUDFLARE_R2_PRIVATE_BUCKET=dudit-private` no runtime da aplicação e usar token R2 com acesso aos dois buckets; implantar a alteração; executar a cópia e testar os fluxos. Só depois de validar leitura legítima e negar leitura anônima, remover originais públicos e purgar cache. Os objetos legados continuam públicos até a remoção dos originais no bucket `dudit`.

**Escopo privado ampliado — 03/11/2026:** fotos de cadastro de clientes e fornecedores agora usam os prefixos privados, a emissão de upload exige permissão de edição no parceiro, as ações validam que a chave pertence ao usuário ou preservam apenas a imagem já registrada, e as consultas autorizadas retornam URL assinada temporária mantendo a chave separada para salvar no banco. Anexos de solicitação de reembolso da assinatura também gravam apenas chave privada após validar usuário, tamanho e tipo no R2; o portal com token válido e as telas administrativas assinam o acesso na leitura. O bucket antigo pode ser esvaziado no lançamento se nenhum objeto legado precisar ser preservado; nesse caso, não executar o script de cópia.

**Conteúdo que permanece público:** fotos/vídeos de produtos e serviços, logos/banners publicados pela loja e vídeos de comunidade. São exibidos como conteúdo público de marketplace. Fotos de cliente/fornecedor e anexos de reembolso não pertencem mais a esses fluxos públicos.

**Incidente durante a inspeção local:** uma busca de configuração imprimiu acidentalmente uma linha do `.env` com credencial PostgreSQL na saída da ferramenta. O valor não foi copiado para este relatório. Rotacionar a senha do banco e atualizar os ambientes que usam essa credencial; não reutilizar a credencial atual para novas consultas.

### RPCs públicos de métricas — 03/11/2026

**Achado live:** o catálogo mostra 15 funções `SECURITY DEFINER` executáveis por `anon`. Seis são RPCs de métricas: `increment_marketplace_view`, `increment_collection_views`, `increment_community_video_views`, `increment_community_video_clicks`, `increment_ad_click` e a antiga `increment_ad_impression`. As funções de marketplace, coleção e vídeo podiam ser repetidas diretamente sem rate limit; a primeira também recalculava a pontuação do marketplace mesmo para itens não publicados. Os chamadores atuais dessas métricas são ações/rotas do servidor; o clique de anúncio e impressões em lote já usam `service_role` e rate limit.

**Correção local:** `20261103130000_restrict_public_metrics_rpcs.sql` revoga execução pública/authenticated e deixa esses RPCs somente para `service_role`. A RPC de marketplace passa a atualizar apenas produtos aprovados/ativos/listados, serviços ativos/listados e planos ativos/listados; métricas de vídeos só avançam para vídeos aprovados. A rota de visualizações e as ações de coleção/vídeo passam a aplicar `API_GENERAL` e chamar com cliente administrativo. Os RPCs de aprovação por link/código e as projeções públicas de catálogo foram mantidos fora dessa restrição.

**Outros catálogos live:** não encontrei tabelas base públicas sem RLS que tenham grants de API, nem views/materialized views públicas no schema `public`. As outras funções `SECURITY DEFINER` acessíveis a `anon` incluem duas projeções públicas, três RPCs de aprovação por link e quatro helpers (`get_address_partner_id`, `get_user_full_context`, `get_user_partner_ids`, `user_has_store_access`); ainda falta revisar chamadas diretas, necessidade de grants e comportamento dos helpers. `increment_ad_impressions(uuid[])` já é executável somente por `service_role`.

**Verificação live read-only:** após o usuário informar a aplicação, consultei os grants dos seis RPCs dentro de transação `READ ONLY`; `anon` e `authenticated` não executam e `service_role` executa. A confirmação dos grants não substitui teste de tracking em homologação.

### RPCs ERP com execução direta autenticada — 03/11/2026

**Achados live:** `execute_xml_import` e `revert_xml_import` aceitavam um `p_created_by` informado pelo chamador e verificavam se esse usuário era membro do parceiro, sem exigir que fosse `auth.uid()`. `create_exchange_order` não fazia checagem do ator/tenant e insere pedidos; é chamado internamente pelo fluxo transacional de devoluções, mas não há chamador direto no app. `report_return_to_dudit` também confia no ID de reporter informado e compara com o cliente da solicitação sem amarrar ao JWT. `update_product_transaction` aceitava qualquer membro registrado do parceiro, sem checar papel ativo ou loja no próprio RPC. Essas funções estavam executáveis por `authenticated`.

**Correção local:** `20261103140000_restrict_privileged_erp_rpcs.sql` torna essas rotas RPC server-only. As ações de XML passam a chamar pelo cliente administrativo depois de autorização de parceiro e loja, resolvem a loja a partir do registro da importação e rejeitam divergência de loja. O updater de produto ganhou wrapper service-only que vincula o ator autorizado ao contexto da transação e checa papel ativo e acesso à loja; o chamador do app usa essa RPC após `fetchProductAndVerifyOwnership` e `requireStorePermission`.

**Controles observados:** `create_product_transaction` também é executável por `authenticated`, mas o wrapper live chama `mvp_assert_product_payload`, que exige contexto e papel `owner/admin/manager`; não foi incluído na revogação. `transfer_store_stock` exige papel ativo no corpo atual e sempre retorna “indisponível” após a simplificação do estoque. A verificação live read-only confirmou que os RPCs desta migration agora são executáveis somente por `service_role`. A contagem heurística anterior de 94 funções autenticadas não é um inventário de falhas: elas precisam de triagem por chamada, validações internas e grants esperados, sem revogação em lote.

**Validação local:** `npx tsc --noEmit` e `git diff --check` passaram. Não executei testes nem RPCs de mutação.

### RPCs internos de estoque, créditos, recorrência e limpeza — 03/11/2026

**Achados live:** funções `SECURITY DEFINER` executáveis por `authenticated` permitiam reduzir/aumentar estoque de qualquer `store_product`, consumir créditos por IDs fornecidos pelo cliente, duplicar orçamento em qualquer parceiro e definir `p_user_id`, reivindicar ciclos de assinatura globalmente, completar/falhar execuções por ID e invocar rotinas de limpeza global com janelas de retenção arbitrárias. Os fluxos legítimos encontrados no app passam por ações/serviços de servidor; os RPCs de duplicação e consumo de crédito ainda usavam o cliente autenticado.

**Correção local:** `20261103150000_restrict_internal_mutation_rpcs.sql` revoga `PUBLIC`, `anon` e `authenticated` desses RPCs e concede `EXECUTE` apenas a `service_role`, incluindo 18 rotinas de purge ainda executáveis por usuário autenticado. A Server Action de duplicação passa a chamar com cliente admin depois de exigir usuário e permissão de criação. `consumeSubscriptionCredits` passa a usar cliente admin; seus chamadores identificados são fluxo de checkout servidor, ação marketplace autenticada e ações ERP.

**Verificação live read-only:** o usuário informou a aplicação e os catálogos confirmam que esses RPCs e purges deixaram de ser executáveis por `anon`/`authenticated`, mantendo `service_role`. Após aplicação, validar em homologação duplicação de orçamento, reserva/consumo de créditos, cron de recorrência e limpezas agendadas; não executar RPCs destrutivos em produção.

### RPCs públicos de aprovação e helpers RLS — 03/11/2026

**Achados live:** `approve_public_quote` e `reject_public_quote` estavam expostos a `anon` e não restringem `p_method` a `code`: qualquer texto diferente segue direto para aprovação/recusa sem token ou código. O fluxo legítimo valida token/identidade/código em Server Action antes de chamar esses RPCs com cliente admin. `sign_public_service_order` também era executável por `anon`; a assinatura por código tem lockout no banco, mas a Server Action também valida contexto e aplica rate limit. Os helpers `get_address_partner_id`, `get_user_full_context`, `get_user_partner_ids` e `user_has_store_access` eram executáveis por `anon`, apesar de serem destinados ao contexto autenticado/RLS.

**Achados adicionais:** outros RPCs autenticados não validavam o tenant/ator no corpo: usuários podiam reivindicar filas de WhatsApp e receber seus registros, incrementar tentativas e bloquear convite alheio, recalcular totais e linhas de pedido de uma OS alheia, abrir janelas falsas de consentimento de preço em assinaturas de qualquer plano ou confirmar mudança de plano sem a resposta do cliente. A função de criação de categorias financeiras também aceitava qualquer `partner_id`. Os pontos encontrados não tinham chamadas diretas de cliente; os usos legítimos identificados são de servidor/admin. Uma rotina de emissão de fatura também não tinha chamador no código app encontrado.

**Correção local:** `20261103160000_restrict_public_approval_rpcs.sql` torna os três RPCs de aprovação/assinatura e esses RPCs internos executáveis somente por `service_role`; o serviço de consentimento de preço agora usa cliente admin após a ação ERP/admin validar a alteração. Os quatro helpers RLS perdem acesso de `PUBLIC`/`anon` e recebem grants explícitos para `authenticated` e `service_role`, preservando seu uso em políticas RLS. A migration também remove grants API de todas as funções `RETURNS trigger`, mantendo os triggers existentes. As projeções `get_marketplace_products_public` e `get_marketplace_services_public` continuam públicas porque retornam listagens ativas/aprovadas sem dados de contato privado.

**Verificação live read-only:** após o usuário informar a aplicação, os grants confirmam execução dos RPCs de aprovação apenas por `service_role`; os helpers RLS continuam acessíveis a `authenticated` e `service_role`, e todas as funções trigger perderam execução direta por `anon`/`authenticated`. Depois, exercitar aprovação/recusa de orçamento por código e por usuário autenticado, assinatura de OS e políticas RLS de endereços/lojas em homologação. A consulta ao banco desta rodada foi somente leitura; nenhuma função mutável foi chamada.

### RPCs de projeção com SECURITY DEFINER e tenant fora do JWT — 03/11/2026

**Achados live:** `approve_public_service_order` aceitava `p_method = 'trusted'` e aprovava OS sem código nem autenticação do usuário; a Server Action valida token e aplica rate limit antes da chamada admin. `get_sales_goals_summary`, `get_partner_video_monthly_count`, `get_partner_video_weekly_count`, `get_product_pending_orders_count`, `generate_recurring_occurrences_bulk` e as duas sobrecargas de `get_store_product_stock` usavam `SECURITY DEFINER` e não prendiam os dados retornados ao parceiro autenticado. Isso expunha agregados financeiros, detalhes de recorrências, contagem de pedidos de outros produtos e estoque de outras lojas via RPC direto.

**Correção local:** `20261103170000_restrict_cross_tenant_read_rpcs.sql` revoga `PUBLIC`/`anon`/`authenticated` nesses RPCs e concede execução somente a `service_role`. Os fluxos de OS, dashboard de metas, criação de vídeo, verificação de produto e recorrências já validam ator/tenant no servidor e foram trocados para cliente admin. Não há chamada de aplicação encontrada para os RPCs de leitura de estoque; eles também ficam restritos. Corrigi ainda o `search_path` de cinco funções `SECURITY DEFINER` server-only que não colocavam `pg_temp` explicitamente por último.

**Verificações adicionais:** a função de ofertas de entrega exige motorista autenticado e ativo; as funções de confirmação de pagamento conferem atribuição ao motorista via `auth.uid()`. `get_admin_reports_stats` e `get_target_report_summary` chamam `_assert_admin_caller`; as leituras de contexto/runtime validam o usuário autenticado. As consultas live confirmaram zero tabelas públicas sem RLS com `SELECT` efetivo para `anon`/`authenticated` e zero views/materialized views públicas com `SELECT` concedido.

**Pendente:** aplicar `20261103170000_restrict_cross_tenant_read_rpcs.sql`, confirmar os grants e validar os fluxos em homologação. A consulta de banco foi somente leitura; nenhuma RPC de mutação foi executada.

### Exclusão e organização dos objetos R2 — 03/11/2026

**Achados:** exclusões não são sincronizadas automaticamente entre o banco e R2. Excluir uma linha manualmente no banco deixa o objeto; excluir um objeto no painel/API R2 não apaga a referência no banco. A remoção de anexo de pedido, transação e movimentação chama a exclusão do objeto, e a exclusão de pedido em lote bloqueia quando ainda existem anexos. Orçamentos não mantêm PDF próprio no R2: o PDF é gerado sob demanda, e imagens de produtos são compartilhadas, então não devem ser removidas com um orçamento. Clientes são removidos logicamente para permitir restauração, mantendo sua imagem. A remoção de OS foi ajustada para buscar anexos e assinatura, apagar os objetos e então apagar o registro; a remoção individual de anexos de OS e evidência agora preserva a referência no banco quando R2 retorna erro, em vez de engolir a falha. Fornecedores são removidos fisicamente sem limpeza explícita da imagem, e isso ainda pode gerar órfãos.

**Exclusão de conta:** o job varre e verifica o prefixo `users/{id}/` nos buckets público e privado. Isso não garante apagar todos os objetos pertencentes ao parceiro: anexos enviados por membros da equipe têm o prefixo do usuário que enviou; evidências de compradores também podem usar o prefixo do comprador. Uma varredura por todo prefixo de usuário seria arriscada quando um usuário pertence a mais de um parceiro. Para cobertura completa é necessário coletar as chaves referenciadas por registros do tenant antes da purga do banco e reconciliar os objetos restantes, com uma política explícita para conteúdo compartilhado do marketplace.

**Chaves e estrutura:** uploads novos usam `users/{uploaderId}/{categoria}/{timestamp}-{uuid}.{ext}`. As categorias privada/pública estão separadas pelo bucket configurado e por prefixo; o prefixo organiza, mas não concede controle de acesso. Os caminhos de novos XMLs fiscais agora usam UUID aleatório em vez da chave de acesso da NF-e; o identificador fiscal continua no banco protegido. Recomendação: manter `dudit` para mídia publicada no marketplace e `dudit-private` sem acesso público para ERP/PII/evidências; preservar `file_key` no banco e emitir links temporários somente após autorização. A evolução para chaves `partners/{partnerId}/{tipo}/{recordId}/{uuid}` facilita limpeza por tenant/registro, mas exige validação de autorização no servidor e não deve ser feita por troca mecânica de prefixo.

**Reconciliação:** uploads assinados podem expirar sem registro no banco e deixar objetos órfãos. Criar rotina periódica que compare objetos com as chaves referenciadas no banco, respeite uma janela de segurança e gere relatório antes de excluir. Lifecycle só deve ser usado em um prefixo temporário dedicado; uma regra geral no prefixo atual apagaria anexos válidos. O relatório não consultou o R2 nesta rodada e não executou limpeza nem testes de fluxo.

### Outbox R2, agendamento e reconciliação — 03/11/2026

**Implementação local:** a migration `20261103190000_r2_object_deletion_outbox.sql` cria uma outbox restrita a `service_role`; triggers nas tabelas de anexos, evidências de reembolso, fotos de clientes/fornecedores, assinatura de OS, mídia de catálogo/loja e vídeos publicados registram chaves antigas na mesma transação que remove ou substitui a referência. O worker confere referências atuais antes de apagar, apaga a chave em ambos os buckets (incluindo cópias legadas) e tenta novamente com backoff; após 12 falhas o job fica em `dead` para inspeção. Jobs concluídos ou ignorados são retidos por 30 dias. O processamento ocorre por `/api/internal/jobs/process-r2-cleanup` usando o segredo dedicado `R2_CLEANUP_CRON_SECRET`.

**Conta:** a purga inicial do prefixo do dono agora classifica objetos em ambos os buckets; remove imediatamente apenas chaves gerenciadas sem referência. Chaves referenciadas são preservadas até o purge transacional do parceiro acionar os triggers; chaves com formato desconhecido são preservadas e contadas para não apagar mídia compartilhada por engano. Após remover os dados, o job da conta tenta drenar até dez lotes; o agendamento periódico reprocessa pendências. A certificação da exclusão registra os arquivos removidos, deferidos e não classificados.

**OS:** o upload novo foi corrigido para gravar anexos em `users/{id}/service-orders/attachments/{uuid}.{ext}`. O fluxo anterior concatenava `serviceOrderAttachments` sem separador, prefixo que não era classificado como privado. A ação do servidor, o formulário cliente e a RPC transacional foram alinhados ao caminho privado canônico; chaves legadas são reconhecidas apenas para reconciliação e limpeza.

**Reconciliação:** `npm run reconcile:r2` é um dry-run: lista os dois buckets, compara chaves gerenciadas com referências no banco e só imprime contagens por bucket. Candidatos sem referência com menos de 30 dias são reportados à parte; objetos sem formato reconhecido são contabilizados e preservados. `npm run reconcile:r2 -- --check-db-references` também faz a verificação inversa, procurando chaves ainda registradas no banco mas ausentes dos dois buckets, ou cópias no bucket inesperado. O script não apaga nem enfileira objetos.

**Agendamento:** se `pg_cron`, `pg_net` e Supabase Vault estiverem habilitados, a migration agenda `process-r2-object-cleanup` a cada minuto e a retenção diária da outbox. Antes ou depois da migration, configurar no Vault `dudit_app_url` (URL de produção) e `dudit_r2_cleanup_cron_secret` (mesmo valor novo definido em `R2_CLEANUP_CRON_SECRET` no ambiente da aplicação). Foi usado segredo dedicado porque o pg_net mantém headers de requisições pendentes em sua fila; não reutilizar `INTERNAL_CRON_SECRET` geral. Se `pg_net` estiver desabilitado, habilitá-lo e criar/agendar o job após a migration.

**Pendente para ativação:** aplicar a migration; configurar o segredo dedicado na aplicação e os dois segredos no Vault; confirmar os jobs em `cron.job`; implantar o código; depois rodar `npm run reconcile:r2` em modo dry-run e validar em homologação. Não consultei o R2 nem apliquei a migration, e não executei testes nesta rodada.


### Estado live do banco, cron, Vault e R2 outbox — 04/11/2026

**Inspeção read-only do banco de dados:**
- **Histórico de Migrations:** a tabela `supabase_migrations.schema_migrations` contém 10 registros até `20261025162024`. As migrations mais recentes foram aplicadas diretamente via SQL Editor sem registrar entradas no ledger da CLI.
- **Extensões ativas:** `pg_cron` (1.6.4, em `pg_catalog`), `pg_net` (0.20.0, em `extensions`) e `supabase_vault` (0.3.1, em `vault`).
- **Supabase Vault:** os segredos `dudit_app_url` (tamanho 20, correspondente a `https://dudit.com.br`) e `dudit_r2_cleanup_cron_secret` (tamanho 64, token dedicado) estão cadastrados e ativos em `vault.decrypted_secrets`.
- **Jobs em `cron.job`:** 25 jobs ativos. O worker `process-r2-object-cleanup` está agendado a cada minuto (`* * * * *`), invocando `net.http_post` apontando para o endpoint `/api/internal/jobs/process-r2-cleanup` com bearer do Vault. O job `purge-r2-cleanup-history` está agendado diariamente às 04:30. Os 23 jobs de expurgo e manutenção periódica também estão ativos.
- **Execuções em `cron.job_run_details`:** o job `process-r2-object-cleanup` está sendo executado a cada minuto com status `succeeded`.
- **Worker HTTP Responses em `net._http_response`:** o endpoint da aplicação em produção (`https://dudit.com.br/api/internal/jobs/process-r2-cleanup`) está respondendo com HTTP 200 (`application/json`), confirmando deploy em produção e comunicação bem-sucedida com autenticação válida.
- **Fila `public.r2_object_deletion_jobs`:** tabela criada com RLS e restrita a `service_role`. Fila vazia no momento da checagem (0 registros).
- **Triggers ativos:** triggers `queue_r2_cleanup` ativos em 13 tabelas (`billing_refund_requests`, `community_videos`, `customers`, `order_attachments`, `products`, `return_evidence`, `service_order_attachments`, `service_orders`, `services`, `stock_movement_attachments`, `stores`, `suppliers`, `transaction_attachments`).

**Resultado da reconciliação R2 (`npm run reconcile:r2` em modo dry-run):**
- Corrigido problema de execução em scripts TypeScript CommonJS (`scripts/reconcile-r2-objects.ts` e `scripts/migrate-r2-private-objects.ts` encapsulados em função assíncrona).
- Bucket público `dudit`: 281 objetos escaneados; 104 chaves gerenciadas; 37 referenciadas no banco; 61 candidatos a órfãos (>30 dias); 6 não referenciadas recentes (<30 dias, preservadas); 177 não gerenciadas (preservadas).
- Bucket privado `dudit-private`: 1 objeto escaneado; 1 gerenciado; 1 referenciado; 0 órfãos.
- Verificação inversa de banco (`--check-db-references`): 45 referências gerenciadas no banco escaneadas; 7 ausentes em ambos os buckets; 27 no bucket inesperado (ainda no bucket público aguardando migração privada); 0 duplicadas entre buckets; 0 falhas de verificação.
- Nenhum objeto foi excluído ou enfileirado.

### Anexos de propostas/orçamentos (Quotes) — 04/11/2026

**Achados confirmados nas Server Actions:**
- `getQuoteAttachmentsAction` e `getQuoteAttachmentUrlAction` em `app/actions/erp/quotes.ts` aceitavam `quoteId` e usavam o cliente administrativo (`service_role`) para consultar e assinar anexos privados sem validar se o usuário pertencia ao parceiro proprietário do orçamento nem exigir permissão RBAC (`quotes.view`) ou escopo de loja (`store_id`), permitindo acesso indevido entre parceiros (IDOR).
- `getPublicQuoteAttachmentUrlAction` não aplicava rate limiting e aceitava entradas arbitrárias sem validação de formato do token público e da chave R2.
- `saveQuoteAttachmentAction` e `deleteQuoteAttachmentAction` não conferiam a permissão de loja quando o orçamento possuía `store_id`.
- A tabela `public.quote_attachments` (criada recentemente) não possuía índice único em `file_key`, permitindo duplicidade de vínculos.
- `public.r2_managed_key_from_value` não incluía o caminho `quotes/`, tratando anexos de orçamentos como não gerenciados.
- `public.r2_managed_object_is_referenced` e `public.list_r2_referenced_managed_keys` não consultavam `quote_attachments`, o que faria a reconciliação e o outbox considerarem anexos de propostas como não referenciados.
- A tabela `quote_attachments` não possuía trigger de captura para o outbox R2, deixando arquivos órfãos quando uma proposta é excluída (em cascata) ou quando um anexo é removido.

**Correções locais aplicadas:**
- `app/actions/erp/quotes.ts`:
  - `getQuoteAttachmentsAction`: agora aplica rate limit (`ERP_GENERAL`), exige contexto autorizado do parceiro via `requireAuthorizedPartnerContext(partnerId, "quotes", "view")`, valida a existência e escopo do orçamento no parceiro e valida a permissão da loja via `requireStorePermission` quando houver `store_id`.
  - `getQuoteAttachmentUrlAction`: aplica rate limit (`ERP_GENERAL`), exige `requireAuthorizedPartnerContext(partnerId, "quotes", "view")`, valida existência do orçamento no parceiro, confere permissão de loja e só assina URL se o anexo pertencer à proposta validada.
  - `getPublicQuoteAttachmentUrlAction`: adicionado rate limit (`API_GENERAL`), validação estrita de formato de `publicToken` e `fileKey`.
  - `getQuotePresignedUploadUrlAction`, `saveQuoteAttachmentAction` e `deleteQuoteAttachmentAction`: alinhados para usar `requireAuthorizedPartnerContext(partnerId, "quotes", "edit")` e validar escopo de loja (`requireStorePermission`).
- **Migration preparada (pendente de aplicação autorizada):**
  - Criada `migrations/20261104150000_integrate_quote_attachments_r2_outbox.sql` que:
    1. Cria índice único `quote_attachments_file_key_uidx` em `public.quote_attachments(file_key)`.
    2. Atualiza `public.r2_managed_key_from_value` para reconhecer `quotes/`.
    3. Atualiza `public.assert_attachment_file_key_unused` para impedir reutilização de chaves de `quote_attachments`.
    4. Atualiza `public.r2_managed_object_is_referenced` e `public.list_r2_referenced_managed_keys` para proteger chaves de `quote_attachments`.
    5. Adiciona o trigger `queue_r2_cleanup` em `public.quote_attachments` para enfileirar chaves automaticamente em caso de `DELETE` ou `UPDATE of file_key`.

**Validação desta rodada:**
- `npx tsc --noEmit` executado com sucesso (código 0, zero erros de tipo).
- Testes focados com `vitest`: 5 testes passaram em 2 suítes (`partner-roles.security.test.ts` e `order-financial-breakdown.test.ts`).
- `git diff --check` passou sem erros de whitespace.
- Nenhuma operação destrutiva foi executada. Nenhuma migration foi aplicada em produção nesta etapa.


### Autenticação, Redirecionamentos, Bloqueios e Consentimento Legal — 04/11/2026

**1. Proteção contra Open Redirect (CWE-601):**
- **Vulnerabilidade identificada:** A lógica de validação `getSafeNext` em `app/auth/callback/route.ts`, `app/auth/login/page.tsx` e `components/auth/AuthView.tsx` utilizava uma checagem ingênua (`rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("://")`). Isso permitia payloads como `/\evil.com` ou `/%5cevil.com`, pois navegadores e analisadores de URL normalizam a barra invertida em relação à origem (`https://dudit.com.br/\evil.com` redireciona para `https://evil.com/`).
- **Correção aplicada:**
  - Criado o utilitário centralizado `lib/security/safe-redirect.ts` (`getSafeRedirectPath`), que valida URLs com `URL` parser estrito, rejeita barras duplas, barras invertidas literais e codificadas (`%5c`, `%5C`), caracteres de controle e esquemas de protocolo.
  - Criada suíte de testes `lib/security/safe-redirect.test.ts` (6 testes passando).
  - Atualizados `app/auth/callback/route.ts`, `app/auth/login/page.tsx` e `components/auth/AuthView.tsx` para usar exclusivamente `getSafeRedirectPath`.

**2. Integridade e Tratamento de Senha (CWE-20 - Password Mangling):**
- **Vulnerabilidade identificada:** A Server Action `changePasswordAction` em `app/actions/shared/password.ts` utilizava `sanitizeInput(data.newPassword, 128)` e `sanitizeInput(data.confirmPassword, 128)`. A função `sanitizeInput` invoca `stripHtml`, removendo trechos entre `<` e `>` e decodificando entidades HTML. Senhas complexas contendo `<senha>`, `&amp;` ou aspas eram alteradas silenciosamente no momento de salvar no Supabase Auth. Consequentemente, o usuário não conseguia mais fazer login no formulário de login padrão. Além disso, `isSessionFresh` usava decodificação base64 padrão em tokens JWT (que utilizam base64url por RFC 7519) e a ação não registrava log de auditoria.
- **Correção aplicada:**
  - Removido o sanitizador com `stripHtml` para senhas. Aplicada validação estrita de tipo (`typeof === "string"`), limites de tamanho (mínimo 8, máximo 128 caracteres para evitar DoS por complexidade de hash), exigência de força média/alta (`calculatePasswordScore >= 2`) e comparação exata de confirmação.
  - Atualizada a decodificação de payload do JWT em `isSessionFresh` para `base64url`.
  - Adicionado evento de auditoria `"auth.password_changed"` no logger unificado (`lib/security/audit-logger.ts`).

**3. Proteção contra Bypass de Lockout de Conta (CWE-287 / CWE-307):**
- **Vulnerabilidade identificada:** A Server Action `handleLoginResult` em `app/actions/auth/lockout.ts` recebia `(email, success)` e, quando `success === true`, chamava `clearFailedLogins(email)` incondicionalmente, sem verificar se a sessão atual pertencia àquele e-mail. Um invasor executando ataques de força bruta ou credential stuffing podia chamar `handleLoginResult(victimEmail, true)` externamente para resetar os contadores de bloqueio da vítima e prosseguir com o ataque. Além disso, a ação não possuía rate limiting, permitindo que o branch `success === false` fosse explorado para travar contas arbitrariamente.
- **Correção aplicada:**
  - Adicionado rate limit (`RateLimitCategory.AUTH_LOGIN`) na ação `handleLoginResult`.
  - Quando `success === true`, a função agora valida que o usuário autenticado (`getCurrentUser()`) existe e que `user.email` corresponde exatamente ao e-mail informado antes de invocar `clearFailedLogins`.

**4. Controle de Acesso e Prevenção de Forja em Consentimento Legal (CWE-284):**
- **Vulnerabilidade identificada:** Em `app/actions/auth/legal-consent.ts`, a função `recordLegalConsent` aceitava `userId` opcional passado pelo cliente. Se fornecido, ele substituía `getCurrentUser()`. Isso permitia que um usuário autenticado registrasse termos legais em nome de outro `user_id`. Adicionalmente, quando chamado sem sessão ativa (no fluxo de cadastro pré-confirmação de e-mail), não havia limitação de taxa (rate limiting), abrindo brecha para inserção descontrolada na tabela `user_legal_consents`.
- **Correção aplicada:**
  - Adicionado rate limit (`RateLimitCategory.AUTH_REGISTER`) na ação `recordLegalConsent`.
  - Se houver sessão autenticada (`user`), qualquer `providedUserId` divergente de `user.id` é rejeitado com erro 403 / "Acesso não autorizado".
  - Se não houver sessão autenticada, `providedUserId` é verificado no banco e só é aceito se a conta tiver sido criada nos últimos 60 minutos (janela legítima de onboarding/signup).

**5. Diagnóstico de 2FA Dormante:**
- **Constatação:** O módulo `app/actions/two-factor-auth.ts` faz referência a tabelas legadas (`user_2fa_secrets`, `user_2fa_backup_codes`, `user_2fa_settings`) que foram removidas na migration `migrations/045_remove_2fa_tables.sql`. O componente `components/profile/TwoFactorView.tsx` exibe "Funcionalidade em desenvolvimento". Recomenda-se migrar para o módulo nativo de MFA do Supabase (`supabase.auth.mfa.*`) quando a funcionalidade for implementada.

**Validação desta rodada:**
- `npx tsc --noEmit` executado com sucesso (código 0, zero erros de tipo).
- `vitest run lib/security/safe-redirect.test.ts` executado com sucesso (6 testes passando).
- `vitest run lib/security/auth-security.test.ts` executado com sucesso (10 testes passando).
- `git diff --check` verificado sem problemas de whitespace.
- Nenhuma alteração destrutiva ou migration aplicada em produção nesta etapa.


### Checkout, Pagamentos, Webhooks e Jobs Agendados — 05/11/2026

**Decisão do usuário:** Não será executada a migração dos 27 objetos privados no bucket R2; o usuário informou que o conteúdo de teste será apagado antes do lançamento.

**1. Isolamento de Loja na Confirmação de Sinal (CWE-284 / IDOR de Loja):**
- **Vulnerabilidade identificada:** Em `app/api/orders/confirm-deposit/route.ts`, a rota validava apenas `requirePermission(order.partner_id, "orders", "edit")`, mas omitia a verificação de escopo de loja `requireStorePermission(order.store_id, ...)`. Um operador com acesso restrito à Loja B conseguia confirmar manualmente o recebimento de sinal de pedidos da Loja A pertencente ao mesmo parceiro.
- **Correção aplicada:**
  - Adicionado `if (order.store_id) await requireStorePermission(order.store_id, order.partner_id, "orders", "edit")` em `app/api/orders/confirm-deposit/route.ts`, espelhando a proteção já existente em `cancel-deposit/route.ts`.

**2. Mitigação de Ataques de Temporização em Tokens Bearer de Cron e Webhooks (CWE-208):**
- **Vulnerabilidade identificada:**
  - Em `lib/internal-cron/auth.ts`, a verificação de `INTERNAL_CRON_SECRET` era feita por comparação de strings simples (`authHeader !== 'Bearer ' + secret`).
  - Em todas as 8 rotas em `app/api/cron/*` (`expire-orders`, `cart-abandonment-sweep`, `notification-reminders`, `reconcile-subscriptions`, `recurring-subscriptions`, `recurring-transactions`, `superfrete-reconcile`, `sync-redis`), a checagem de `CRON_SECRET` utilizava `authHeader !== 'Bearer ' + secret`.
  - Em `app/api/webhooks/supabase/route.ts`, a checagem de `SUPABASE_WEBHOOK_SECRET` também utilizava comparação de strings simples.
  - Comparações com operador de desigualdade (`!==`) no V8 interrompem no primeiro byte divergente, criando discrepâncias observáveis de tempo de resposta.
- **Correção aplicada:**
  - Criado o utilitário `lib/security/timing-safe.ts` (`isValidBearerToken`), que calcula o hash SHA-256 de ambos os valores antes de compará-los com `crypto.timingSafeEqual`. Como os hashes possuem tamanho fixo de 32 bytes, a comparação é estritamente de tempo constante, imune a exceções de tamanho e a vazamentos de caracteres.
  - Criada suíte de testes unitários `lib/security/timing-safe.test.ts` (6 testes passando).
  - Atualizados `lib/internal-cron/auth.ts`, `app/api/webhooks/supabase/route.ts` e todas as 8 rotas de `app/api/cron/*` para usar `isValidBearerToken`.

**3. Blindagem do Webhook do SuperFrete (CWE-306 / CWE-799):**
- **Vulnerabilidade identificada:** Em `app/api/shipping/superfrete/webhook/route.ts`:
  - Não havia limitação de taxa (rate limit).
  - O endpoint não validava a presença do cabeçalho `X-ME-Signature` antes de consultar o banco de dados.
  - Quando a remessa não era encontrada no banco, o endpoint retornava HTTP 200 `{ message: "Shipment not found, skipping" }` sem checagem de assinatura, permitindo que um invasor externo diferenciasse remessas existentes de inexistentes (oráculo de existência de remessas).
- **Correção aplicada:**
  - Adicionado rate limiting (`checkRateLimitForAPI(RateLimitCategory.WEBHOOK, "superfrete-webhook")`).
  - Rejeição imediata com 401 caso o cabeçalho `X-ME-Signature` não esteja presente.
  - Retorno uniforme e genérico (`{ received: true }`, HTTP 200) em casos onde a remessa não é localizada, eliminando o oráculo de enumeração.

**Validação desta rodada:**
- `npx tsc --noEmit` executado com sucesso (código 0, zero erros de tipo).
- `vitest` executado com sucesso em 3 suítes:
  - `lib/security/safe-redirect.test.ts` (6 testes)
  - `lib/security/timing-safe.test.ts` (6 testes)
  - `lib/security/auth-security.test.ts` (10 testes)
  - Total: 22 testes passando.
- `git diff --check` verificado sem problemas de whitespace.
- Nenhuma operação destrutiva nem alteração em produção realizada.

### Vendas, PDV e Mensageria (WhatsApp, Webhooks e OAuth) — 05/11/2026

**1. Módulo de Vendas e PDV:**
- **Auditoria de `app/actions/erp/pdv.ts`:**
  - Verificação de controle de descontos (`can_apply_discount` e respeito estrito a `salesSettingsResult.data.maxDiscountPercent`).
  - Checagem de isolamento multi-loja e verificação obrigatória de sessão de caixa aberta (`hasFinancial`).
  - Movimentação de estoque atômica executada via PostgreSQL RPC `create_batch_stock_movement`.
- **Auditoria de `app/actions/erp/orders.ts`:**
  - Exclusão em lote (`deleteOrdersInBatchAction`) exige validação de escopo de loja (`requireStorePermission`) e valida ausência de anexos ativos antes de permitir deleção.
- **Auditoria de `app/actions/erp/cash-register.ts`:**
  - Abertura de caixa (`openCashSessionAction`), sangrias/reforços (`createCashMovementAction`), estornos (`reverseCashMovementAction`) e fechamento de caixa (`closeCashSessionAction`) exigem checagem dupla de permissões RBAC (`requirePermission` e `requireStorePermission`).
  - Todas as mutações financeiras de caixa invocam procedures atômicas (`erp_create_cash_manual_movement`, `erp_reverse_cash_manual_movement`, `erp_close_cash_session_atomic`).
  - A leitura de sessões e histórico resolve e valida a loja ativa via `resolveCashReadStoreId`.
- **Auditoria de `app/actions/erp/sales-settings.ts`:**
  - `getSalesSettingsAction`, `updateSalesSettingsAction`, `getReceiptSettingsAction` e `updateReceiptSettingsAction` restringem alterações estritamente a administradores e proprietários (`roleId === "owner" || roleId === "admin"`).
  - Sanitização rígida de limites (`maxDiscountPercent`, `defaultMarginPercent`, `quoteValidityDays`, etc.).
- **Auditoria de `app/actions/erp/quotes.ts`:**
  - Visualização e aprovação pública (`getPublicQuoteAction`, `approvePublicQuoteAction`) operam sob limitação de taxa (`requireRateLimit`), token público imprevisível e resolução segura de aprovador via RPC `approve_public_quote`.
- **Auditoria de `app/actions/erp/confirm-pickup-payment.ts`:**
  - Limitação de taxa de pagamento (`RateLimitCategory.PAYMENT`), verificação de permissão no parceiro e loja (`orders.edit`), atualização atômica baseada no status `awaiting_pickup_payment`, sincronização financeira e log de auditoria.

**2. Módulo de Integrações de Mensageria (WhatsApp, Evolution API, Meta Cloud API e OAuth):**
- **Mitigação de Ataques de Temporização em Webhooks de WhatsApp (CWE-208):**
  - **Vulnerabilidade identificada:**
    - Em `app/api/whatsapp/webhook/route.ts` e `app/api/whatsapp/webhook/meta/route.ts`, a verificação de `hub.verify_token` no método `GET` utilizava `token !== platformVerifyToken` (comparação padrão não constante).
    - Em `lib/services/whatsapp-evolution-webhook.service.ts`, `verifyEvolutionWebhookSecret` realizava `timingSafeEqual(Buffer.from(receivedSecret), Buffer.from(plaintextExpected))`, disparando `RangeError` capturado por `try/catch` quando os buffers divergiam em tamanho.
    - Em `lib/services/whatsapp-webhook.service.ts`, `verifyMetaWebhookSignature` executava checagem prévia `if (expected.length !== received.length) return false`, introduzindo vazamento observável de tamanho de assinatura.
  - **Correção aplicada:**
    - Expandido o módulo `lib/security/timing-safe.ts` para exportar a função `timingSafeStringEqual(a, b)`, que aplica SHA-256 em ambos os valores antes de compará-los com `crypto.timingSafeEqual` (garantindo buffers de exatamente 32 bytes em tempo estritamente constante).
    - Atualizados `app/api/whatsapp/webhook/route.ts`, `app/api/whatsapp/webhook/meta/route.ts`, `lib/services/whatsapp-evolution-webhook.service.ts` e `lib/services/whatsapp-webhook.service.ts` para validar tokens, segredos e assinaturas com `timingSafeStringEqual`.
- **Proteção contra Forjamento de Estado OAuth e Falha Silenciosa de Segredo (CWE-345 / CWE-1188):**
  - **Vulnerabilidade identificada:**
    - Em `lib/security/whatsapp-oauth-state.ts` e `lib/security/oauth-state.ts`, caso a variável de ambiente `OAUTH_STATE_SECRET` não estivesse definida, a função `getOAuthSecret()` retornava silenciosamente `"build-time-placeholder"`. Em produção, isso permitiria que qualquer atacante forjasse assinaturas HMAC de state OAuth para qualquer `partnerId` e `userId`.
    - A comparação de cookies e assinaturas HMAC verificava comprimentos previamente antes de chamar `timingSafeEqual`.
  - **Correção aplicada:**
    - `getOAuthSecret()` em ambos os módulos agora lança uma exceção imediata caso `OAUTH_STATE_SECRET` esteja ausente em ambiente de produção (`NODE_ENV === "production"`).
    - A validação de `cookieState` e a checagem da assinatura HMAC do token de estado foram migradas para `timingSafeStringEqual`.
- **Auditoria de `app/actions/whatsapp.ts` e `app/actions/emails.ts`:**
  - Todas as Server Actions de gerenciamento de instâncias, QR Codes e credenciais WhatsApp exigem `requireUser()`, permissão explícita `can_manage_integrations` e plano mínimo "escalar" (`requireMinimumPlan`).
  - O envio de e-mails em `app/actions/emails.ts` restringe remetentes globais estritamente à role de administrador do sistema (`requireAdmin("admin")`), prevenindo uso indevido da plataforma como open relay de spam.

**Validação desta rodada:**
- `npx tsc --noEmit` executado com sucesso (código 0, zero erros de tipo).
- `vitest` executado com sucesso em 4 suítes:
  - `lib/security/timing-safe.test.ts` (10 testes)
  - `lib/security/safe-redirect.test.ts` (6 testes)
  - `lib/security/auth-security.test.ts` (10 testes)
  - `lib/services/whatsapp-webhook.service.test.ts` (5 testes)
  - Total: 31 testes passando.
- `git diff --check` verificado sem problemas de whitespace.
- Nenhuma operação destrutiva nem alteração em produção realizada.

### Marketplace & Checkout (Carrinho, Preços, Frete, Avaliações e Assinaturas Recorrentes) — 05/11/2026

**1. Auditoria de Carrinho e Checkout (`app/actions/marketplace/cart.ts` e `cart-extensions.ts`):**
- **Verificações de Integridade de Preço e Fraude:**
  - `checkoutCartAction`: O servidor não confia nos preços, descontos de cupons nem taxas de frete enviados pelo cliente. Todos os preços são recalculados via `calculateOrderPricing` e o frete de transportadora é recalculado via `quoteCarrierFreightFee` (SuperFrete) antes da inserção em `orders` e `order_items`.
  - Reserva de estoque atômica executada no checkout via `reserveOrderInventory` antes de prosseguir com a criação do pedido.
  - Prevenção de autofraude e compras em loja própria: `assertCanBuyFromStore` bloqueia compras pelo dono da loja ou membros da equipe da loja.
  - Verificação de aceitação de pedidos (`canStoreAcceptOrders`) e bloqueio de fluxos com cotas esgotadas (`resolveMarketplaceCapabilities`).
  - Proteção CSRF obrigatória (`requireCSRF`) em todas as mutações de sacola (`addToCartAction`, `addServiceBookingToCartAction`, `addSubscriptionToCartAction`).

**2. Bypass de Moderação em Avaliações (CWE-862 / CWE-79):**
- **Vulnerabilidade identificada:** Em `app/actions/marketplace/reviews.ts`, `createReviewAction` executava moderação de conteúdo (`moderateReviewContent`), porém `updateReviewAction` não executava nenhuma moderação nem limitava o tamanho do comentário. Isso permitia que um usuário enviasse uma avaliação legítima e posteriormente editasse inserindo links maliciosos, conteúdo abusivo ou payload arbitrário.
- **Correção aplicada:**
  - `updateReviewAction` agora impõe moderação obrigatória (`moderateReviewContent`) e limite de 2.000 caracteres no comentário, alinhado com `createReviewAction`.

**3. Falha de Autorização e Vínculo de Cliente em Assinaturas Recorrentes (CWE-285):**
- **Vulnerabilidade identificada:**
  - Na Dudit, compradores de marketplace vinculam-se a registros da tabela `customers` prioritariamente através da coluna `marketplace_user_id` (com constraint UNIQUE `(partner_id, marketplace_user_id)`). Clientes pré-existentes na base do lojista (ERP) que compram no marketplace têm `marketplace_user_id` preenchido, mas `user_id` mantido como `NULL`.
  - Nas Server Actions de cliente de assinaturas (`app/actions/marketplace/recurring-subscriptions.ts`):
    - `getMyRecurringSubscriptionsAction` e `getMyRecurringCreditsAction` realizavam `.eq("user_id", user.id)`, retornando lista vazia para compradores com cadastro preenchido apenas por `marketplace_user_id`.
    - `getMyRecurringSubscriptionExecutionsAction`, `updateMySubscriptionStatus` (pausa/cancelamento), `skipMyNextRecurringExecutionAction`, `updateMySubscriptionShippingAddressAction`, `changeMySubscriptionPaymentMethodAction`, `decideSubscriptionPriceChangeAction` e `bookServiceWithCreditAction` verificavam `customers!inner(user_id)` com `sub.customers?.user_id !== user.id`. Clientes legítimos eram rejeitados com erro "Assinatura não encontrada".
  - Em `lib/services/recurring/price-consent.ts`, a notificação de mudança de preço era ignorada quando `user_id` estava nulo, mesmo havendo `marketplace_user_id`.
  - Em `lib/services/recurring-execution.service.ts` e `app/actions/erp/recurring-subscriptions.ts`, os pedidos gerados pela recorrência gravavam `buyer_id: null` caso o cliente possuísse apenas `marketplace_user_id`, dificultando o acompanhamento pelo comprador.
- **Correção aplicada:**
  - Em `app/actions/marketplace/recurring-subscriptions.ts`, implementado helper uniforme `isCustomerOwner(customer, userId)` que valida tanto `customer.user_id === userId` quanto `customer.marketplace_user_id === userId`.
  - Atualizadas todas as consultas de `recurring_subscriptions` para selecionar `(user_id, marketplace_user_id)` e aplicar `isCustomerOwner`.
  - Atualizadas as buscas em `customers` para usar `.or('user_id.eq.${user.id},marketplace_user_id.eq.${user.id}')`.
  - Atualizados `price-consent.ts`, `recurring-execution.service.ts` e `app/actions/erp/recurring-subscriptions.ts` para resolver `buyer_id` e `customerUserId` com fallback para `marketplace_user_id`.

**4. Divulgação de Dados Internos de Lojistas em Páginas de Produtos (CWE-200):**
- **Vulnerabilidade identificada:** Em `app/actions/marketplace/products.ts`, ao buscar os dados públicos do produto (`_getMarketplaceProductBase`), a consulta unia a tabela `partners` com `user_id` e `partner_integrations`. Diferente de `services.ts` (que expurgava essas propriedades), `products.ts` mantinha `user_id` (UUID interno da conta do lojista) e o array de integrações no objeto serializado para visitantes públicos.
- **Correção aplicada:**
  - Adicionada exclusão explícita de `p.user_id` e `p.partner_integrations` antes de retornar o produto para o cliente, prevenindo enumeração e vazamento de metadados.

**Validação desta rodada:**
- `npx tsc --noEmit` executado com sucesso (código 0, zero erros de tipo).
- `vitest` executado com sucesso em 2 suítes:
  - `lib/security/timing-safe.test.ts` (10 testes)
  - `lib/services/marketplace-customer.test.ts` (8 testes)
  - Total: 18 testes passando.
- `git diff --check` verificado sem problemas de whitespace.
- Nenhuma operação destrutiva nem alteração em produção realizada.

### Assinaturas da Plataforma SaaS Dudit (Mercado Pago, Planos, Upgrades/Downgrades, Faturas e Reconciliação) — 05/11/2026

**1. Auditoria do Ciclo de Vida de Assinaturas SaaS (`app/actions/erp/subscriptions.ts` e `lib/services/mercadopago/subscriptions.ts`):**
- **Arquitetura de Pagamentos:**
  - O faturamento dos planos SaaS da Dudit (Começar, Crescer, Escalar) é processado com credenciais de plataforma do Mercado Pago (`MP_SUBSCRIPTION_CLIENT_ID` / `MP_SUBSCRIPTION_CLIENT_SECRET`), sem uso de intermediários externos (como Asaas).
  - Isolamento estrito de proprietário: `requirePartner()` exige validação em profundidade `partner.user_id === user.id`. Membros de equipe (não proprietários) são bloqueados de criar, cancelar ou alterar planos da empresa.
  - Upgrades mantêm o plano atual ativo até a confirmação do pagamento do novo plano pelo webhook do Mercado Pago (evitando interrupção prematura de serviço).
  - Downgrades e cancelamentos respeitam o ciclo vigente (`cancel_at_period_end`), preservando o acesso pago até `current_period_end`, momento em que o agendamento rotaciona o plano na mesma linha e arquiva recursos excedentes de forma segura via `enforcePlanLimitsAndArchiveExcess`.
- **Reconciliação e Inadimplência:**
  - O cron job `app/api/cron/reconcile-subscriptions/route.ts` autentica chamadas com `isValidBearerToken` em tempo constante.
  - `lib/billing/reconcile-subscriptions.ts` valida tanto o status do preapproval quanto as cobranças reais em `authorized_payments`. Inadimplência inicia grace period de 3 dias (`PAST_DUE_GRACE_PERIOD_DAYS`), após o qual a assinatura é cancelada e os recursos excedentes são arquivados para o plano gratuito.

**2. IDOR e Ausência de Verificação de Tenant em Consultas de Fatura Recente (CWE-639 / CWE-285):**
- **Vulnerabilidade identificada:**
  - Em `app/actions/billing/purchases.ts`, as Server Actions `getLatestCompletedPurchaseForPartnerAction` e `getLatestPurchaseForSubscriptionAction` recebiam `partnerId` ou `subscriptionId` e retornavam a fatura mais recente de `billing_purchases` sem validar se o usuário autenticado possuía permissão sobre aquele parceiro ou assinatura.
  - Isso permitia que qualquer usuário autenticado na plataforma consultasse dados financeiros, valores e descrições de compras de qualquer outra empresa cadastrada.
- **Correção aplicada:**
  - Integrada a validação de escopo via `resolveBillingPartnerScope(user, partnerId)` em ambas as funções. Consultas para parceiros fora do escopo do usuário autenticado são imediatamente rejeitadas com erro `Acesso negado`.

**3. Criação de Faturas Arbitrárias por Usuários Não Administradores (CWE-285 / CWE-20):**
- **Vulnerabilidade identificada:**
  - Em `app/actions/billing/purchases.ts`, `createPurchaseAction` permitia que usuários comuns com acesso ao parceiro criassem registros em `billing_purchases` informando `input.amount` e `input.total_amount` arbitrários.
  - No fluxo do sistema, faturas e cobranças são geradas estritamente de forma determinística pelo motor de faturamento (`recordSubscriptionCharge`) e webhooks.
- **Correção aplicada:**
  - `createPurchaseAction` agora exige estritamente a permissão administrativa global `requireAdminScope("billing_control", "admin")`.

**4. Endurecimento contra Fallback Silencioso de Credenciais do Mercado Pago (CWE-1188):**
- **Vulnerabilidade identificada:**
  - Em `lib/services/mercadopago/subscriptions.ts`, a função `getMpPlatformAccessToken` retornava a string estática `"build-time-placeholder-token"` se as variáveis de ambiente `MP_SUBSCRIPTION_CLIENT_ID` ou `MP_SUBSCRIPTION_CLIENT_SECRET` não estivessem definidas.
  - Em ambiente de produção, a ausência acidental dessas credenciais causava chamadas HTTP com token inválido e falhas obscuras na API do Mercado Pago em vez de alertar a falha de configuração imediatamente.
- **Correção aplicada:**
  - `getMpPlatformAccessToken` agora lança uma exceção imediata em ambiente de produção (`NODE_ENV === "production"`), prevenindo requisições degradadas e viabilizando diagnóstico imediato.

**5. Segurança no Processamento de Reembolsos de Assinatura (`app/actions/billing/refunds.ts`):**
- **Verificado:** Exigência de Step-Up Authentication com validação de senha do administrador, confirmação explícita da palavra "ESTORNAR", escopo administrativo `billing_control`, auditoria detalhada (`logBillingAdminAudit`) e anexos com URLs assinadas via R2.

### Painel de Administração Global, Moderação e Enforcement — 05/11/2026

**1. Auditoria da Arquitetura do Painel Administrativo (`app/ddt-admin/*` e `app/actions/admin/*`):**
- **Autenticação e Hierarquia de Papéis:**
  - O painel global opera sob a rota `/ddt-admin/*`, protegido pelo `AdminLayout` (`app/ddt-admin/layout.tsx`) com `await requireAdmin()`.
  - Modelo RBAC baseado no banco de dados (`admin_roles`), sem confiar em claims do cliente.
  - Papéis estruturados em hierarquia: `moderator` (1), `admin` (2), `super_admin` (3), combinados com controle granular de escopos (`moderation`, `user_enforcement`, `billing_control`, `audit_access`, `system_settings`).
  - Guards de autoproteção ativos: `assertNotSelf` (impede auto-banimento e auto-suspensão), `assertNotProtected` (protege contas de sistema e super_admins protegidos), `assertNotLastAdmin` (impede exclusão do último administrador do sistema).
  - Step-up re-authentication (`lib/admin/step-up-auth.ts`): consome atomicamente tokens de sessão de 5 minutos gerados por reautenticação de senha para ações destrutivas (banimentos, desativações de tenant, cancelamentos de faturamento).

**2. IDOR em Busca de Reembolsos de Assinatura (`app/actions/billing/refunds.ts` — CWE-639):**
- **Vulnerabilidade identificada:**
  - `getActiveRefundForPartnerAction` recebia `partnerId` e consultava a tabela `billing_refund_requests` verificando apenas se o usuário estava autenticado (`getCurrentUser()`), sem validar se pertencia à empresa indicada. Qualquer usuário logado podia consultar solicitações de estorno ativas, valores e motivos de outros parceiros.
- **Correção aplicada:**
  - Integrada a validação `resolveBillingPartnerScope(user, partnerId)`. Se `!scope.allowed`, a ação retorna `{ success: false, error: "Acesso não autorizado." }`.

**3. Corrupção de Sessão do Cliente Service-Role em Processamento de Estornos (`app/actions/billing/refunds.ts` — CWE-250):**
- **Vulnerabilidade identificada:**
  - Em `adminProcessRefundAction`, a reautenticação de senha (step-up) invocava `supabase.auth.signInWithPassword({ email, password })` diretamente na instância do cliente `createAdminClient()`.
  - Como o Supabase JS SDK muta os headers de autorização internos ao invocar mutações de autenticação, o token de serviço (`service_role`) era substituído pela sessão do usuário para as operações subsequentes naquele contexto de execução.
- **Correção aplicada:**
  - A verificação de senha foi desacoplada para um cliente Supabase temporário, não persistente (`createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })`), preservando a integridade da conexão do `service_role`.
  - Adicionado `await requireRateLimit(RateLimitCategory.ADMIN_ACTION)` em `adminProcessRefundAction` e `adminRejectRefundAction`.

**4. Comparação em Tempo Constante e Rate Limiting no Bypass de Manutenção (`app/actions/admin/system.ts` — CWE-208):**
- **Vulnerabilidade identificada:**
  - A ação `setBypassCookieAction` comparava a chave de bypass informada pelo administrador através do operador padrão `!==`, expondo o sistema a ataques de canal lateral baseados em tempo (timing attacks).
  - Não havia limitação de taxa (`requireRateLimit`) nas ações de controle de manutenção, anúncios globais e broadcast.
- **Correção aplicada:**
  - Substituída a comparação por `timingSafeStringEqual(token.trim(), config.bypass_token.trim())`.
  - Adicionado `await requireRateLimit(RateLimitCategory.ADMIN_ACTION)` em `setBypassCookieAction`, `updateMaintenanceModeAdminAction`, `updateGlobalAnnouncementAdminAction` e `sendMaintenanceBroadcastAdminAction`, e `RateLimitCategory.ADMIN_READ` em `getSystemSettingsAdminAction`.
  - Em `app/ddt-admin/system/page.tsx`, substituído `requireAdmin("admin")` por `requireAdminScope("system_settings", "admin")` para consistência em profundidade com as Server Actions.

**5. Proteção de Disparo em Lote de Notificações Administrativas (`app/actions/admin/notifications.ts` — CWE-770):**
- **Vulnerabilidade identificada:**
  - `sendAdminAnnouncementAction` executava o envio em massa de anúncios e notificações para toda a base da plataforma sem rate limiting.
- **Correção aplicada:**
  - Adicionado `await requireRateLimit(RateLimitCategory.ADMIN_ACTION)` para conter abusos automatizados.

**6. Rate Limiting e Sanitização de Identificadores no Portal do Entregador (`app/actions/admin/delivery-drivers.ts`):**
- **Vulnerabilidade identificada:**
  - As ações administrativas de entregadores (listagem, estatísticas, criação/reenvio de convites via SMTP2GO e revogações) operavam sem `requireRateLimit`. Além disso, identificadores (`driverId`, `invitationId`) não passavam por sanitização estrita de UUID.
- **Correção aplicada:**
  - Adicionado `requireRateLimit(RateLimitCategory.ADMIN_ACTION)` em mutações e envios de e-mail e `requireRateLimit(RateLimitCategory.ADMIN_READ)` nas consultas.
  - Aplicado `sanitizeUUID` em todos os parâmetros de identificadores recebidos.

**7. Desativação Completa de Catálogo na Moderação V2 e Clamping de Risk Score (`app/actions/admin/moderation-v2.ts`):**
- **Vulnerabilidade identificada:**
  - Em `deleteModerationTarget`, ao remover produtos ou serviços pela interface de moderação, apenas a coluna `deleted_at` era atualizada, deixando `is_active: true`, `status: "ativo"`, e omitindo `deleted_by` e `deleted_reason`. Consultas que filtrassem apenas por `is_active = true` continuavam localizando o item.
  - Em `updatePartnerRiskScore`, o novo valor era limitado apenas superiormente (`Math.min(newScore, 100)`), permitindo valores negativos ou não-numéricos (`NaN`).
- **Correção aplicada:**
  - `deleteModerationTarget` agora atualiza de forma consistente `is_active: false`, `status: "deleted"`, `deleted_by: admin.userId` e `deleted_reason`.
  - `updatePartnerRiskScore` agora normaliza o score com `Math.min(Math.max(Math.round(Number(newScore) || 0), 0), 100)`.

**Validação desta rodada:**
- `npx tsc --noEmit` executado com sucesso (código 0, zero erros de tipo).
- `vitest` executado com sucesso em 92 suítes (931 testes passando no total, incluindo 12 novos testes em `lib/admin/admin-security-hardening.test.ts` e 11 testes em `lib/services/credit.service.test.ts`).
- `git diff --check` verificado sem problemas de formatação.
- Nenhuma operação destrutiva nem alteração em produção realizada.
