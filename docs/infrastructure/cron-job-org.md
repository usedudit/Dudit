# Cron jobs no cron-job.org - operação e checklist

Runbook dos jobs agendados no **cron-job.org** para o Dudit: o que existe, como
criar do zero, como rotacionar os segredos, o que cada rota devolve e o que fazer
quando um job falha.

- **Zona:** `dudit.com.br` (produção no Railway)
- **Conta:** cron-job.org (plano free)
- **Automação:** [`scripts/setup-cron-job-org.ps1`](../../scripts/setup-cron-job-org.ps1)
- **Última revisão:** 28/10/2026

---

## 1. Inventário atual

Todos os jobs chamam a aplicação em produção com `Authorization: Bearer <secret>`,
têm `requestTimeout = 30` segundos e notificam em caso de falha, recuperação e
desativação automática.

| jobId | Título | Rota | Método | Agenda | Fuso | Segredo | Para que serve |
|---|---|---|---|---|---|---|---|
| `8735758` | Dudit - SuperFrete reconcile | `/api/cron/superfrete-reconcile` | GET | `*/15` | `America/Sao_Paulo` | `CRON_SECRET` | Relê etiquetas abertas na SuperFrete e recupera webhooks perdidos |
| `8735937` | Dudit - Expirar pedidos | `/api/cron/expire-orders` | GET | `*/10` | `UTC` | `CRON_SECRET` | Cancela pedidos Mercado Pago vencidos e libera estoque |
| `8735938` | Dudit - Lembretes e notificações | `/api/cron/notification-reminders` | GET | `*/5` | `UTC` | `CRON_SECRET` | Envia notificações agendadas (lote de até 100) |
| `8735940` | Dudit - Carrinho abandonado | `/api/cron/cart-abandonment-sweep` | GET | `*/30` | `UTC` | `CRON_SECRET` | Detecta carrinho parado há 4h e cria notificação |
| `8735941` | Dudit - Assinaturas recorrentes | `/api/cron/recurring-subscriptions` | GET | 1x/hora (`minuto 0`) | `UTC` | `CRON_SECRET` | Cobra execuções vencidas e congela janelas de mudança de preço |
| `8735942` | Dudit - Conciliar assinaturas (MP) | `/api/cron/reconcile-subscriptions` | GET | diário `06:00` | `UTC` | `CRON_SECRET` | Relê o status das assinaturas no Mercado Pago |
| `8735943` | Dudit - Backup do banco | `/api/internal/jobs/backup-database` | POST | diário `06:30` | `UTC` | `BACKUP_CRON_SECRET` | `pg_dump` + criptografia + upload para o R2 |

`06:00 UTC = 03:00 BRT` e `06:30 UTC = 03:30 BRT` (o Brasil não tem mais horário
de verão). O job do SuperFrete é o único fora de UTC: ele foi criado manualmente
em `America/Sao_Paulo`, mas a cadência de 15 min não muda nada. Se quiser
padronizar, edite o fuso para `UTC` e mantenha os minutos `0, 15, 30, 45`.

### Expiração de pedidos tem um único agendador

`Dudit - Expirar pedidos` no cron-job.org é o único agendador da expiração
automática. A rota `/api/cron/expire-orders` aplica as regras do Mercado Pago e
também cuida dos efeitos relacionados ao cancelamento, como liberação de
estoque, etiquetas, sincronizações e auditoria. O job antigo de `pg_cron`
(`dudit-expire-orders-every-minute`) foi removido porque alterava o pedido
diretamente no banco e concorria com essa rota, sem executar todos esses efeitos.
Os demais jobs de manutenção e limpeza do banco continuam no `pg_cron`; eles
não substituem nem duplicam os jobs HTTP deste inventário.

### O que **não** está agendado (de propósito)

| Rota | Motivo |
|---|---|
| `/api/cron/recurring-transactions` | A RPC `process_due_recurring_transactions` é um stub desde a migração `20260419_recurring_refactor_status_engine.sql`; agendar só geraria execução vazia |
| `/api/internal/jobs/process-pending-webhooks` | O outbox de webhook do Mercado Pago não é usado hoje |
| `/api/cron/sync-redis` | Quase no-op; rode manualmente se precisar reindexar a busca |
| `/api/moderation/process` | A fila de moderação não está em uso |
| `/api/internal/jobs/process-whatsapp-*` | O WhatsApp usa Trigger.dev; esses jobs são de outra arquitetura (ver `cron-architecture.md`) |

Para os três jobs opcionais (outbox de webhooks, sync-redis e moderação), rode o
script com `-IncludeOptional`. Para os demais, crie manualmente seguindo a tabela
— e **não** agende o `recurring-transactions` enquanto a RPC for stub.

---

## 2. Variáveis de ambiente

### No Railway (produção)

| Variável | Usada por |
|---|---|
| `CRON_SECRET` | Todos os endpoints `/api/cron/*` |
| `INTERNAL_CRON_SECRET` | `/api/internal/jobs/*` (exceto backup) |
| `BACKUP_CRON_SECRET` | `/api/internal/jobs/backup-database` |
| `BACKUP_DATABASE_URL` ou `DATABASE_URL`/`POSTGRES_URL_NON_POOLING` | `pg_dump` |
| `CLOUDFLARE_ACCOUNT_ID` | R2 |
| `CLOUDFLARE_BACKUP_R2_ACCESS_KEY_ID` / `CLOUDFLARE_BACKUP_R2_SECRET_ACCESS_KEY` | R2 |
| `CLOUDFLARE_BACKUP_BUCKET` | R2 |
| `BACKUP_ENCRYPTION_KEY_BASE64` | AES-256-GCM do dump |

Detalhes do backup em [`database-backups.md`](./database-backups.md).

### Só na sua máquina (nunca no Railway nem no repositório)

| Variável | Usada por |
|---|---|
| `CRONJOB_API_KEY` | API do cron-job.org (Console → Settings → API key) |
| `APP_URL` | Opcional; o script assume `https://dudit.com.br` |

O script lê `CRON_SECRET`, `INTERNAL_CRON_SECRET` e `BACKUP_CRON_SECRET` do
ambiente para montar/atualizar o header `Authorization`. Ele **não contém
segredo** e pode ir para o repositório.

> Se a API key tiver **restrição por IP** no Console do cron-job.org, rodar o
> script de outra rede devolve `403`. Libere o IP ou desligue a restrição
> temporariamente.

---

## 3. Criar os jobs do zero

Pré-requisitos: app deployado, variáveis do Railway configuradas e API key em mãos.

### 3.1 Gerar os segredos (se ainda não existirem)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Rode três vezes: um valor para `CRON_SECRET`, um para `INTERNAL_CRON_SECRET` e
um para `BACKUP_CRON_SECRET`. Use 64 caracteres hex (256 bits).

```powershell
# Windows PowerShell
$env:CRON_SECRET          = "<64 hex>"
$env:INTERNAL_CRON_SECRET = "<64 hex>"
$env:BACKUP_CRON_SECRET   = "<64 hex>"
```

### 3.2 Configurar no Railway e deployar

1. Railway → serviço da aplicação → Variables.
2. Salve os três segredos.
3. Faça o deploy e espere o serviço ficar saudável.
4. Confirme que a rota responde `401` sem header (auth ativa) e `200` com o
   Bearer correto:

   ```bash
   curl -i https://dudit.com.br/api/cron/expire-orders
   # HTTP/1.1 401 Unauthorized

   curl -i -H "Authorization: Bearer $CRON_SECRET" \
     https://dudit.com.br/api/cron/expire-orders
   # HTTP/1.1 200 OK
   ```

### 3.3 Rodar o script

```powershell
$env:CRONJOB_API_KEY = "<api key>"
$env:APP_URL         = "https://dudit.com.br"

# 1) confere o JSON sem chamar a API (não precisa de API key)
.\scripts\setup-cron-job-org.ps1 -DryRun

# 2) cria os 6 jobs gerenciados pelo script
.\scripts\setup-cron-job-org.ps1

# 3) opcional: cria também os jobs não usados hoje
.\scripts\setup-cron-job-org.ps1 -IncludeOptional
```

O script:

- **Não duplica**: compara pelo `title` e mostra `SKIP (ja existe)`.
- **Não cria** o job do SuperFrete (`8735758`), que já existe manualmente; o
  `-UpdateSecret` atualiza o header dele como o dos outros.
- **Valida a resposta**: exige `jobId` no retorno; sem isso marca `FAIL`.
- Respeita o limite de criação da API: **13 s entre jobs** (1 req/s e no máximo
  5 criações em qualquer janela de 60 s).
- Cria com `saveResponses = true` (guarda header/body por 2 dias) e
  `notification.onFailure = true`, `onSuccess = true` (avisa quando volta a
  funcionar depois de falhar) e `onDisable = true`.

### 3.4 Validar

No painel do cron-job.org, abra cada job e use **TEST RUN**. O esperado é
**HTTP 200** e um corpo JSON curto. Depois confira o **History** (as últimas 50
execuções ficam disponíveis; headers/body por 2 dias).

---

## 4. Rotacionar os segredos

Faça nessa ordem — a janela entre o deploy e o PATCH do cron-job.org gera `401`
por alguns minutos. O job de 5 min é o mais sensível, mas isso dá poucas
execuções, bem longe das 25 falhas que desativam o job.

1. **Gerar** os três valores novos (comando da seção 3.1).
2. **Atualizar no Railway** e fazer deploy. Espere o serviço ficar saudável.
3. **Conferir o mapeamento** (não altera nada):

   ```powershell
   $env:CRONJOB_API_KEY      = "<api key>"
   $env:CRON_SECRET          = "<novo>"
   $env:INTERNAL_CRON_SECRET = "<novo>"
   $env:BACKUP_CRON_SECRET   = "<novo>"

   .\scripts\setup-cron-job-org.ps1 -UpdateSecret -DryRun
   ```

   A saída mostra `WOULD PATCH <jobId> | <segredo> | <atual> -> <novo> | <url>`,
   com os tokens mascarados.

4. **Aplicar**:

   ```powershell
   .\scripts\setup-cron-job-org.ps1 -UpdateSecret
   ```

5. **Validar**: `TEST RUN` em um job de cada família (`/api/cron/*` e backup) e
   confira `HTTP 200` no History.

O `-UpdateSecret`:

- **Não cria nem apaga** jobs; só faz `PATCH` do header `Authorization`.
- Decide o segredo **pela URL**, não pelo título:
  - `/api/cron/*` e `/api/moderation/*` → `CRON_SECRET`
  - `/api/internal/jobs/backup-database` → `BACKUP_CRON_SECRET`
  - demais `/api/internal/*` → `INTERNAL_CRON_SECRET`
- Atualiza inclusive jobs criados manualmente (como o do SuperFrete).
- É **idempotente**: se o header já é o valor atual, mostra
  `OK (ja atualizado)` e não faz `PATCH`.
- **Relê** cada job depois do `PATCH` e marca `FAIL` se o header não conferir.
- Pula com aviso quando a variável correspondente não está definida.

### API key do cron-job.org

A rotação da API key é independente dos segredos da aplicação:

1. Console → **Settings** → regenerar a API key.
2. Trocar apenas o `$env:CRONJOB_API_KEY` na sua máquina.
3. Os jobs **não** são afetados (a key autentica você na API, não as execuções).

> Se você colou a API key ou os segredos em chat/e-mail, rotacione. É barato.

---

## 5. O que as rotas devolvem

### Orçamento de execução (deadline)

O cron-job.org **corta a conexão em 30 s** e marca a execução como timeout. Para
não perder o lote inteiro nem acumular falhas, três rotas param de iniciar
trabalho novo aos **22 s** e devolvem o que sobrou em `deferred`:

| Rota | Comportamento |
|---|---|
| `/api/cron/superfrete-reconcile` | Para de abrir novos lotes de 5 etiquetas quando faltam < 3 s; cada chamada à SuperFrete tem timeout de no máximo 20 s e nunca passa do orçamento |
| `/api/cron/expire-orders` | Checa o deadline antes de cada pedido; o cancelamento de etiqueta usa `min(20 s, tempo restante)` |
| `/api/cron/recurring-subscriptions` | O sweep de janelas de preço entra no mesmo orçamento; se sobrar < 3 s, devolve `skipped` sem reivindicar execuções. Para entre um claim e outro (nunca no meio) |

O que ficou de fora entra na próxima rodada: as consultas são sempre "vencido
até agora" (pedidos/etiquetas) ou o claim continua `pending` em
`recurring_executions`, então não há perda.

`notification-reminders`, `cart-abandonment-sweep` e `reconcile-subscriptions`
ainda não têm deadline: são lotes pequenos ou rodam 1x por dia. Se crescerem,
aplique o mesmo padrão (`RUN_BUDGET_MS` + `deferred` + `elapsedMs`).

### Respostas esperadas

| Rota | Corpo em sucesso |
|---|---|
| `expire-orders` | `{ success, expiredCount, deferred, elapsedMs }` |
| `superfrete-reconcile` | `{ success, checked, processed, failed, total, deferred, elapsedMs }` |
| `notification-reminders` | `{ success, processed }` |
| `cart-abandonment-sweep` | `{ success, processed, notified, skippedCooldown, skippedNoToken, errors }` |
| `recurring-subscriptions` | `{ success, frozenPriceChanges, claimed, completed, failed, deferred, elapsedMs }` ou `{ success, skipped: true, reason: "deadline", frozenPriceChanges, elapsedMs }` |
| `reconcile-subscriptions` | `{ success, totalProcessed, updated, errors, details }` |
| `backup-database` | `202 { success: true, accepted: true, status: "started" }` |

### Backup é assíncrono

O dump pode levar mais que 30 s, então o endpoint responde **`202` imediatamente**
e continua em background via `after()`. O lock do Redis é liberado quando o dump
termina, não quando a resposta sai.

- **Cron:** POST sem query string → `202`.
- **Manual (esperando o resultado):** `POST /api/internal/jobs/backup-database?sync=1`
  com o mesmo Bearer → `200 { success, fileName, sizeBytes, ... }`.
- **Já existe execução em andamento:** `200 { success: true, skipped: true, reason: "lock_active" }`.
- **Redis indisponível:** `503` (fail-closed, para não iniciar `pg_dump` sem
  limite).

Nunca coloque `?sync=1` na URL do cron: a conexão passaria de 30 s e o job
apareceria como timeout.

---

## 6. Segurança

- Os endpoints são **fail-closed**: sem o segredo configurado, `/api/cron/*`
  responde `401` em vez de liberar. O backup responde `500`
  (`Server misconfiguration`) quando `BACKUP_CRON_SECRET` não existe. O mesmo
  vale para `sync-redis`.
- A comparação do Bearer é exata (`Authorization: Bearer <secret>`); espaço extra
  ou `Bearer` duplicado resultam em `401`. No backup a comparação usa
  `timingSafeEqual`.
- Segredos ficam **só** no Railway e no cron-job.org. Não vão para
  `NEXT_PUBLIC_*`, para o repositório nem para o `.env` versionado.
- O cron-job.org guarda o header e o corpo da resposta por **2 dias** (por causa
  de `saveResponses`). As respostas atuais não têm PII, mas evite devolver dados
  sensíveis em rotas de cron.
- A **API key** do cron-job.org dá controle total da conta. Restrinja por IP no
  Console quando possível e rotacione se vazar.
- `TRUSTED_PROXY_HEADERS=true` **só** é seguro com um proxy confiável na frente
  (Cloudflare). Hoje o DNS está sem proxy, então `cf-connecting-ip` chega do
  cliente e é falsificável — o rate limit por IP pode ser burlado. Não é crítico
  para os crons (eles usam Bearer), mas é um motivo para ligar o proxy quando
  for mexer na infra.

---

## 7. Limites do cron-job.org (plano free)

| Limite | Valor | Impacto |
|---|---|---|
| Timeout por execução | **30 s** (conexão fechada) | Rotas longas precisam do padrão `202` + background ou deadline |
| Resposta lida | 64 KB | Respostas maiores abortam a execução |
| Falhas consecutivas | **25** desativam o job | O job de 5 min cai em ~2 h; os avisos de falha/desativação estão ligados |
| Histórico | 50 execuções; headers/body por 2 dias | Diagnóstico é curto — use Sentry/logs para histórico |
| Intervalo mínimo | 1 min | Suficiente para todos os jobs atuais |
| Nº de jobs | Sem limite formal (fair use) | — |
| API | **100 requisições/dia** (5.000 para supporting members) | `-UpdateSecret` gasta ~1 listagem + 3 por job (detalhes + PATCH + verificação); `-UpdateSecret -DryRun` gasta 1 listagem + 1 por job. Não rode em loop |
| Rate limit da API | Criação: 1 req/s e 5/min; demais: 5 req/s | O script já respeita |

O `lastStatus` do job usa estes códigos: `0` nunca executou, `1` OK, `2` DNS,
`3` conexão, `4` HTTP, `5` timeout, `6` resposta grande, `7` URL inválida,
`8` erro interno, `9` desconhecido, `10` página de challenge (WAF).

---

## 8. Troubleshooting

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `401 Unauthorized` | Secret diferente entre Railway e cron-job.org; deploy antigo; header com espaço; `CRON_SECRET` ausente | Confira o header no job, rode `-UpdateSecret -DryRun`, confirme a variável no Railway e redeploye |
| `403 Forbidden` | WAF/Cloudflare na frente (se o proxy for ligado); API key restrita por IP; conta bloqueada | Veja Security Events; libere o IP do cron-job.org ou ajuste a regra; na API, confira a restrição de IP |
| `405 Method Not Allowed` | Job com método errado | `/api/cron/*` é **GET**; backup é **POST** |
| `500 Internal Server Error` | Erro na aplicação (banco, SuperFrete, MP etc.) | Logs do Railway + Sentry; o History guarda o corpo por 2 dias. Rode o `TEST RUN` de novo depois do fix |
| `429 Rate limited` | Rate limit interno (backup) | Aguarde a próxima execução; não dispare em rajada |
| `503` no backup | Redis indisponível (lock/rate limit fail-closed) | Verifique Upstash/Redis; o job volta sozinho na próxima rodada |
| Timeout (`lastStatus = 5`) | Rota passou de 30 s | Veja `deferred`/`elapsedMs`; reduza lote ou aplique deadline. No backup, confirme que a URL **não** tem `?sync=1` |
| Job desativado sozinho | 25 falhas consecutivas | Corrija a causa, reative no painel e use `TEST RUN` |
| `lastStatus = 10` | Página de challenge (WAF) | O cron-job.org não resolve challenge; libere o path/IP ou não use Managed Challenge em `/api/` |
| `deferred > 0` sempre | Lote maior que o orçamento de 22 s | Normal se esporádico; se for toda rodada, aumente o intervalo (rode menos vezes) ou otimize as chamadas externas |
| Backup "passa" mas não gera arquivo | Falha no dump/R2 depois do `202` | O erro vai para Sentry/logs (`cronLogger`), não para o History. Rode com `?sync=1` para ver o erro na hora |

### Testes manuais úteis

```bash
# 401 esperado (prova que o auth está ativo)
curl -i https://dudit.com.br/api/cron/expire-orders

# 200 com o secret correto
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://dudit.com.br/api/cron/expire-orders

# backup síncrono (só manual; pode demorar)
curl -i -X POST -H "Authorization: Bearer $BACKUP_CRON_SECRET" \
  "https://dudit.com.br/api/internal/jobs/backup-database?sync=1"
```

---

## 9. WAF / allowlist de IP (decisão: adiado)

**Decisão atual: não fazer agora.** O ganho é pequeno e o custo/risco é real:

- O Bearer de 256 bits já torna a adivinhação inviável. A allowlist só ajudaria
  no cenário de **vazamento do secret** — e nesse caso o atacante
  provavelmente já tem acesso ao ambiente.
- Ligar o proxy da Cloudflare muda **todo** o tráfego: SSL mode, cache, uploads
  de 100 MB, webhooks e latência. Exige testes em tudo.
- As regras de país atuais **incluem `DE`**, e todos os nós do cron-job.org são
  alemães (Hetzner). Se o proxy for ligado sem ajustar as regras, os 7 jobs
  tomam challenge e são desativados após 25 falhas.
- Os IPs do cron-job.org mudam quando eles adicionam nós. Você criaria um modo
  de falha que hoje não existe.

### Quando/se fizer

Se um dia ligar o Cloudflare por outro motivo (CDN, cache, DDoS), a regra vira
brinde. Ordem segura:

1. Ajuste as regras **antes** de ligar o proxy:
   - Regra 4 (automação/UA) e Regra 5 (países) já precisam excluir `/api/`.
   - Crie/ajuste uma regra de **Block** para `/api/cron/*`,
     `/api/internal/jobs/*` e `/api/moderation/*` fora dos IPs permitidos, no
     topo da lista. No plano free são só 5 custom rules — veja
     [`cloudflare-waf.md`](./cloudflare-waf.md) para o desenho completo.
2. Fonte oficial dos IPs (melhor que o FAQ):

   ```bash
   curl -s https://api.cron-job.org/executor-nodes.json
   ```

   Valores em 28/10/2026:

   ```
   116.203.129.16
   116.203.134.67
   23.88.105.37
   128.140.8.200
   91.99.23.109
   ```

3. Inclua o **seu IP** na lista para conseguir testar manualmente.
4. Certifique-se de que as regras 4 e 5 **não** alcançam `/api/`.
5. Ligue o proxy no CNAME do `dudit.com.br` (hoje aponta para o Railway,
   **Somente DNS**) e deixe o SSL/TLS em **Full** (nunca Flexible).
6. Teste: `TEST RUN` nos 7 jobs, webhooks do Mercado Pago/SuperFrete e um upload.
7. Mantenha uma **IP List** da Cloudflare (ex.: `$cron_job_org`) para atualizar
   em um lugar só quando a lista mudar.

> Alternativa sem WAF: usar **IP Access Rules** (não consomem slot de custom
> rule) para bloquear IPs abusivos, mas elas também não são uma allowlist de
> cron.

---

## 10. Checklist de deploy

- [ ] Variáveis `CRON_SECRET`, `INTERNAL_CRON_SECRET`, `BACKUP_CRON_SECRET` no Railway
- [ ] Deploy concluído e serviço saudável
- [ ] `curl` sem header retorna `401`
- [ ] `.\scripts\setup-cron-job-org.ps1 -DryRun` mostra os 6 jobs esperados
- [ ] `.\scripts\setup-cron-job-org.ps1` cria/ignora sem duplicar
- [ ] `TEST RUN` nos 7 jobs → `200`
- [ ] History sem `401`, `403`, `405` ou timeout
- [ ] Backup: `?sync=1` manual gera arquivo no R2 (uma vez, para validar credenciais)
- [ ] Primeiros dias: conferir History e e-mails de falha

---

## 11. Referências

- Painel: <https://cron-job.org/en/members/jobs/>
- API: <https://docs.cron-job.org/rest-api.html>
- IPs dos executores: <https://api.cron-job.org/executor-nodes.json>
- Backup: [`database-backups.md`](./database-backups.md)
- SuperFrete: [`superfrete-shipping.md`](./superfrete-shipping.md)
- WhatsApp/Trigger.dev: [`cron-architecture.md`](./cron-architecture.md)
- WAF: [`cloudflare-waf.md`](./cloudflare-waf.md)
