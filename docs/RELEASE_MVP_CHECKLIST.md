# Checklist final de release — Dudit MVP

Data da revisão: 2026-08-14

## Gate de release

- [x] `npm test -- --run`: 23 arquivos, 299 testes aprovados.
- [x] `npx tsc --noEmit`: aprovado.
- [x] `npm run build`: aprovado.
- [x] `npx supabase db lint`: sem erros de schema.
- [x] `npx supabase db advisors`: sem findings.
- [x] Banco efetivo: todas as tabelas públicas têm RLS.
- [x] Banco efetivo: RLS/RBAC de `customers` aplicado, com `FORCE RLS` e policies de membership.
- [ ] **Resolver o fluxo oficial da migration de hardening antes do deploy.**

### Blocker operacional atual

O repositório usa `migrations/`, mas não possui `supabase/config.toml`,
`supabase/migrations/` ou workflow versionado que execute `supabase db push`.
Existe histórico em `supabase_migrations.schema_migrations`, porém
`20260813_mvp_launch_blockers_security_hardening.sql` não está registrado nele.

O hardening já está refletido no banco efetivo. Portanto, não reexecutar a SQL
às cegas nem inserir manualmente uma linha no histórico. Antes do release, o
responsável pelo deploy deve escolher e documentar um único caminho:

1. incluir a migration em um fluxo oficial reproduzível e validá-la em staging;
2. executar dry-run e aplicar em janela controlada;
3. confirmar no histórico remoto que a migration foi aplicada;
4. só então promover a aplicação.

Enquanto isso não estiver resolvido, o estado do banco depende de uma aplicação
manual anterior e não é reproduzível em um novo ambiente.

## Migrations e pendências

- [x] `20260807_proposed_customers_rbac_rls.sql`: aplicada no banco efetivo; os
  documentos de auditoria de 09/08 são registros históricos da etapa anterior,
  não uma pendência atual.
- [ ] Reconciliar as migrations recentes com o histórico oficial, especialmente
  `20260813_mvp_launch_blockers_security_hardening.sql`.
- [ ] Após o primeiro deploy, guardar o resultado de `migration list`/histórico
  remoto como evidência da versão liberada.
- [ ] Não aplicar agora `customers` novamente; a validação live já confirma RLS,
  FORCE RLS, policies RBAC e views seguras.

### TODOs encontrados

- `lib/email.tsx`: envio de e-mail de exportação é um stub sem consumidores
  encontrados; não bloqueia o checkout/ERP MVP atual, mas não deve ser anunciado
  como entrega automática por e-mail.
- `components/erp/payment-methods-manager.tsx`: botão de exclusão ainda é TODO;
  tratar como pendência funcional separada, sem liberar o botão como se estivesse
  operacional.
- `lib/dashboard-engine/rules.ts`: indicador de configuração logística é
  incompleto, mas não afeta autorização, checkout ou persistência.

## Variáveis de ambiente

### Obrigatórias para o núcleo MVP

- [x] `NEXT_PUBLIC_SUPABASE_URL`
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] `SUPABASE_SERVICE_ROLE_KEY` — somente servidor.
- [x] `NEXT_PUBLIC_APP_URL` — usar a URL canônica de produção.
- [x] `MASTER_KEY_V2` — chave ativa de criptografia; manter no secret manager.
- [x] `OAUTH_STATE_SECRET`
- [x] `MP_CLIENT_ID` e `MP_CLIENT_SECRET`
- [x] `MP_SUBSCRIPTION_CLIENT_ID` e `MP_SUBSCRIPTION_CLIENT_SECRET`
- [x] `MP_WEBHOOK_SECRET` e `MP_SUBSCRIPTION_WEBHOOK_SECRET`
- [x] Credenciais R2: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_BUCKET`,
  `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`.
- [x] `NEXT_PUBLIC_R2_CDN_URL`
- [x] `KV_REST_API_URL` e `KV_REST_API_TOKEN`
- [x] `CRON_SECRET` e `TRIGGER_SECRET_KEY`
- [x] `SIGHTENGINE_API_USER` e `SIGHTENGINE_API_SECRET` se upload/moderação
  estiverem habilitados no MVP.

### Confirmar conforme o escopo de produção

- [ ] `SUPABASE_WEBHOOK_SECRET`: obrigatório se o webhook Supabase → aplicação
  estiver ativo para sincronização do marketplace/Redis. Está ausente no `.env`
  local; conferir o ambiente de produção e o segredo configurado no provedor.
- [ ] `INTERNAL_CRON_SECRET`: obrigatório para os três jobs internos de WhatsApp.
  Está ausente no `.env` local; se WhatsApp entrar no MVP, configurar também o
  cron-job.org e testar os três endpoints.
- [ ] `NEXT_PUBLIC_SITE_URL`: definir explicitamente se o fluxo de assinatura
  marketplace usar callback diferente da URL padrão.
- [ ] `MASTER_KEY_V1`: não é necessário para os dados observados no banco efetivo
  (não há payloads `v1`), mas manter durante o lançamento se houver backups ou
  dados históricos fora dessa amostra.

Nunca colocar `SUPABASE_SERVICE_ROLE_KEY`, segredos Mercado Pago, chaves R2,
`MASTER_KEY_*`, `OAUTH_STATE_SECRET` ou `TRIGGER_SECRET_KEY` em variáveis
`NEXT_PUBLIC_*` ou no cliente.

## Smoke test imediatamente antes do lançamento

- [ ] Login, refresh de sessão, logout e recuperação de acesso.
- [ ] Marketplace: vitrine pública, detalhe, carrinho, cotação de frete e
  checkout com Pix/cartão/boleto quando habilitados.
- [ ] ERP: criar pedido, reservar/baixar estoque, devolução e lançamento
  financeiro no mesmo parceiro; repetir com outro parceiro para confirmar
  isolamento.
- [ ] Mercado Pago: preferência, payment quote, pagamento aprovado/pending/
  rejeitado, webhook assinado e reconciliação de assinatura.
- [ ] Upload: produto, banner/logo e upload sensível; verificar moderação,
  ownership e publicação esperada.
- [ ] Jobs: `CRON_SECRET`, Trigger.dev e, se aplicável, `INTERNAL_CRON_SECRET`.
- [ ] Verificar que `audit_logs` e `marketplace_metrics_events` só recebem
  eventos server-side.
- [ ] Confirmar rollback da aplicação e procedimento de rollback de migration;
  não fazer rollback de schema sem revisar dependências da versão.

## Logs, erros e monitoramento pós-release

### Acompanhar nas primeiras 24 horas

- Mercado Pago: rejeições de assinatura/webhook, falhas de token refresh,
  ausência de `payment_id`, pagamentos sem pedido correspondente e divergências
  de `payment quote`.
- Pedidos/estoque: falhas de reserva/finalização, estoque insuficiente inesperado,
  devoluções que não avançam e transações sem vínculo ao pedido.
- Webhooks e jobs: HTTP 401/429/5xx, retries do Trigger.dev, mensagens em
  dead-letter e falhas de sincronização Supabase → Redis.
- Upload: falhas R2, moderação indisponível, bloqueios inesperados e tentativas
  de ownership inválido.
- Banco: picos de `42501`/RLS, erros de RPC, falhas de gravação em auditoria e
  métricas.

### Regras de logging

- [x] Logs de Mercado Pago usam IDs/status/erro resumido e dados mascarados.
- [x] Não registrar token, CPF, payload bruto do pagador ou payload financeiro
  completo.
- [ ] Confirmar no provedor de logs retenção, acesso restrito e alertas para os
  eventos acima.
- [ ] Confirmar que logs de produção não exibem stack/payload completo enviado
  por cliente no endpoint genérico de erro.

### Avisos conhecidos, sem bloquear este MVP

- Next 16 sinaliza a migração futura de `middleware` para `proxy`.
- O build informa que o service worker do Serwist não é registrado
  automaticamente.
- Webpack avisa serialização de strings grandes no cache.
- A ausência de integração efetiva com Sentry/observabilidade externa significa
  que, no momento, a operação depende dos logs do provedor; isso deve ser
  acompanhado, mas não abre uma nova frente de hardening nesta janela.

## Comandos de evidência da versão liberada

```bash
npx supabase --version
npx supabase db lint
npx supabase db advisors
npm test -- --run
npx tsc --noEmit
npm run build
```

Registrar os outputs junto ao release, além do commit/tag promovido e da
confirmação de migration no banco remoto.
