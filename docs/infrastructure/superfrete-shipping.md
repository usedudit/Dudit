# SuperFrete - status de envio (webhook + reconciliação)

## Visão geral

O status das etiquetas SuperFrete chega por dois caminhos:

1. **Webhook em tempo real** — `POST /api/shipping/superfrete/webhook`
2. **Cron de reconciliação** — `GET /api/cron/superfrete-reconcile` (recupera eventos perdidos)

O webhook é registrado automaticamente na conta SuperFrete do parceiro quando ele
conecta a integração (ou clica em **Ativar agora** na tela de integrações).

## Eventos suportados pela SuperFrete

| Evento | Efeito na Dudit |
|---|---|
| `order.created` | etiqueta `pending` → pedido `not_sent` |
| `order.released` | pedido pago → etiqueta `released` → pedido `preparing` |
| `order.generated` | etiqueta gerada (traz `tracking`/`tracking_url`) → `released`/`preparing` |
| `order.posted` | etiqueta `posted` → pedido `sent` + `delivery_departure_at` |
| `order.delivered` | etiqueta `delivered` → pedido `delivered` + `delivery_arrived_at`/`delivery_completed_at` |
| `order.cancelled` | etiqueta/pedido `cancelled` |

> **Limitação da SuperFrete:** não existe evento `order.in_transit` (nem status
> `in_transit` em `GET /order/info`). O pedido fica em `sent`/“Postado” até
> `order.delivered`. O status “Em trânsito” continua sendo manual.

## Secret do webhook

A SuperFrete gera o `secret_token` **na criação** do webhook e assina cada
requisição com `X-ME-Signature` (HMAC-SHA256 do corpo cru). Não existe endpoint
para consultar o secret depois.

Por isso o Dudit **recria** o webhook a cada conexão/reativação:

1. lista os webhooks da conta (`GET /api/v0/webhook`);
2. remove os que apontam para `/api/shipping/superfrete/webhook`;
3. cria um novo (`POST /api/v0/webhook`);
4. salva `id` + `secret_token` em `partner_integrations`
   (`webhook_id`, `webhook_secret_encrypted`) e marca
   `config.webhook_version = 2`.

Conexões antigas que salvaram um UUID local aparecem com
`webhookConfigured: false` e podem ser corrigidas pelo botão **Ativar agora**.
Ao desconectar, o webhook também é removido da conta SuperFrete.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_APP_URL` ou `NEXT_PUBLIC_SITE_URL` | URL pública usada no cadastro do webhook. Precisa ser HTTPS e acessível pela SuperFrete. |
| `CRON_SECRET` | Bearer token do cron de reconciliação. |

## Cron de reconciliação

A SuperFrete reenvia cada evento até 5 vezes (intervalo de 15 min) e depois
descarta. O cron relê as etiquetas abertas via `GET /api/v0/order/info/{id}` e
aplica o status com a mesma lógica do webhook.

- Rota: `GET /api/cron/superfrete-reconcile`
- Auth: `Authorization: Bearer $CRON_SECRET`
- Agenda atual: a cada 15 minutos (`*/15`), cadastrada em
  `America/Sao_Paulo` (a cadência não muda)
- Limite: 60 etiquetas por execução (concorrência 5), apenas etiquetas abertas
  (`pending`, `released`, `posted`, `in_transit`) criadas nos últimos 45 dias.
- Orçamento: 22 s por execução (o cron-job.org corta em 30 s); o que não couber
  volta em `deferred` e entra na próxima rodada.
- Resposta: `{ success, checked, processed, failed, total, deferred, elapsedMs }`

Cadastro no cron-job.org (detalhes e rotação de segredo em
[`cron-job-org.md`](./cron-job-org.md)):

```
URL:    https://SEU_DOMINIO/api/cron/superfrete-reconcile
Método: GET
Header: Authorization: Bearer SEU_CRON_SECRET
Agenda: */15 * * * *
```

Cada execução grava `last_event`/`last_event_at` no `payload` da etiqueta, o que
faz a fila girar (ordenada por `updated_at`). Falhas também são registradas
(`last_reconcile_error`) para não prender a etiqueta no início da fila.

## Diagnóstico

| Sintoma | Causa provável |
|---|---|
| Status não muda e logs mostram 401 no webhook | secret salvo não é o `secret_token` da SuperFrete (conexão antiga) → **Ativar agora** |
| `webhookConfigured: false` | webhook não registrado / `NEXT_PUBLIC_APP_URL` inválida / API da SuperFrete indisponível |
| Evento perdido após indisponibilidade | cron de reconciliação não configurado ou atrasado |
| Pedido parado em “Postado” | normal: a SuperFrete não envia `in_transit`; só `delivered` |

O script `scripts/test-superfrete-webhook.mjs` simula um evento assinado com o
secret salvo no banco e ajuda a validar a rota localmente.
