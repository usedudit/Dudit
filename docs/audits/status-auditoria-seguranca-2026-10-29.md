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
- A migration não foi aplicada a banco algum. Políticas RLS, fluxos restantes e superfícies importantes ainda precisam de revisão.

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

**Limitação:** a migration está apenas versionada; não foi aplicada nem validada contra um banco de homologação. Testes unitários/mock não substituem teste de integração de RLS.

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

O endpoint de processamento verifica autenticação, CSRF, limite de requisições, assinatura/quote de pagamento com usuário, parceiro e valor máximo, além do vínculo do pedido com o parceiro. Também consulta associação ativa em `team_members`, mas não ficou confirmado no código revisado se essa tabela é a fonte atual de associação nem quais papéis/permissões ela representa. **Não classificar como vulnerabilidade confirmada ainda.** Retomar verificando origem dos registros, permissões de criar/cobrar pedidos e os efeitos da confirmação do pagamento.

## Pendências para retomar

### Prioridade alta — autorização, pagamentos e isolamento

- [ ] Concluir a análise de Mercado Pago: identificar quem pode emitir quote, processar cobrança, selecionar pedido/valor e quais efeitos são persistidos; confirmar se a checagem de `team_members` é atual e suficiente.
- [ ] Revisar todas as Server Actions e Route Handlers de ERP para autorização em cada mutação e escopo por parceiro/loja, priorizando pedidos, clientes, produtos, estoque, agendamentos e financeiro.
- [ ] Revisar ações de lote, IDs relacionados e casos de mass assignment; confirmar que o escopo também é aplicado nas gravações e exclusões.
- [ ] Revisar as demais regras de papéis e permissões por módulo, incluindo operações administrativas e convites.
- [ ] Revisar migrations/policies RLS existentes e comparar com a nova migration; verificar conflitos, tabelas sem RLS, views, RPCs, triggers, grants, Storage e Realtime conforme presentes no projeto.
- [ ] Executar a migration em ambiente de homologação isolado e adicionar/rodar testes de integração que provem leitura e escrita legítimas, bloqueio entre parceiros/lojas e ausência de efeitos colaterais. Não aplicar em produção nesta auditoria.

### Demais áreas de segurança ainda não concluídas

- [ ] Autenticação e contas: login, cadastro, recuperação, OTP, sessão, cookies, redirecionamentos, convites, alteração de credenciais e exclusão de conta.
- [ ] Webhooks e jobs: assinatura, repetição/idempotência, autorização de tarefas internas, limites e proteção contra chamadas forjadas.
- [ ] Uploads e arquivos: validação, tamanho/tipo, nomes/caminhos, escopo de acesso e políticas do Storage.
- [ ] XSS e conteúdo: sanitização/escape, conteúdo armazenado, HTML/Markdown e URLs externas.
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

- `app/actions/erp/team.ts`
- `app/actions/erp/store-members.ts`
- `app/actions/erp/order-financial-breakdown.ts`
- `components/erp/orders/OrderDetailView.tsx`
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

A migration foi criada, mas não aplicada. Antes de aplicá-la em homologação, revisar as policies antigas e confirmar os papéis e relações reais do schema. Como a migration substitui policies para fechar acesso cruzado, um rollback que restaure policies permissivas pode reabrir a falha; se houver incompatibilidade, prefira uma migration corretiva/forward-fix. Não executar em produção sem validação própria e plano operacional.

**Conclusão deste registro:** há correções localizadas implementadas e testes focados aprovados, mas a auditoria permanece incompleta. Não usar este documento como declaração de que o Dudit está seguro ou pronto para lançamento.
