# Cloudflare WAF, Rate Limiting e Turnstile - dudit.com.br

Documento operacional das proteções de borda do domínio `dudit.com.br`, do
incidente de bot de 16/10/2026 e da correção do Cloudflare Turnstile.

- **Plano Cloudflare:** Free
- **Zona:** `dudit.com.br` (inclui `www.dudit.com.br`, `img.dudit.com.br`)
- **Última revisão:** 18/10/2026

---

## 1. Contexto / Incidente (16/10/2026, pico 20h–21h)

Pico de tráfego (~9k req/h) **não distribuído - concentrado em 1 cliente**:

| Métrica | Valor | Observação |
|---|---|---|
| Total de requests (janela) | 15,24k | |
| Pico horário | ~9k (16/10 20h–21h) | resto do dia < 1k/h |
| `403 Forbidden` | 6,44k | páginas de **Managed Challenge** (bate com o pico de 4xx) |
| `5xx` | 0,02% | **origem não foi atingida** |
| `2xx` no pico | ~0 | quase nada passou |

**Top cliente do pico:**

| Campo | Valor |
|---|---|
| IP | `185.177.72.205` - **9,02k req** |
| ASN / dono | AS211590 / **Alpha Internet Limited (Bucklog SARL)**, Vélizy-Villacoublay, França |
| User-Agent | `curl/8.71` (9,02k) |
| Datacenter Cloudflare | Paris (CDG) |
| Reputação | Listado em AbuseIPDB, greensnow.co, blocklist.de, IPsum (threat score 348/100) |

**Segundo IP:** `45.231.138.240` (Brasil, AS267203 Cabonnet/TVC, Lucélia-SP) -
2,38k req. **Possível cliente/parceiro → não bloquear.**

### Conclusão do incidente

A regra de país com Managed Challenge **segurou a origem** (5xx ~0%, zero 2xx no
pico): os ~6k viraram `403` (challenge) e **não chegaram ao servidor**.

Porém **Managed Challenge ≠ Block**: o request ainda chega ao edge, conta na
analytics e o Cloudflare ainda **gera a página de challenge** (mais trabalho que
um block). O `curl` não resolve o desafio, então fica em loop de `403`. Ou seja:
protegeu a origem, mas não reduziu o volume/custo de forma ótima.

---

## 2. Estratégia

**Suspeito confirmado (IP/UA/ASN) = Block. País/genérico = Managed Challenge.**

Limitações do plano **Free** que definem o desenho:
- **5 regras customizadas** (custom rules).
- **1 regra de rate limiting**, janela/duração de **10s**, característica = IP,
  ação = Block, expressão limitada a **Path** e **Verified Bot**.
- **Bot Fight Mode** (on/off), **sem** Skip e **sem** Super Bot Fight Mode.
- **IP Access Rules** não consomem slot de custom rule.

### Ordem de execução (custom rules - topo para baixo)

```
1) Webhook MercadoPago (whitelist)      -> Skip
2) Skip bots bons (verified + monitores) -> Skip "All remaining custom rules"
3) Scanners                              -> Block
4) Automação / UA vazio                  -> Block
5) Países de risco                       -> Managed Challenge
```

> O antigo "Bots Burros (No User-Agent)" **deixa de existir** como regra
> separada: foi absorvido pela regra **4** (que inclui `len(http.user_agent) eq 0`).

---

## 3. Regras customizadas (copiar/colar)

### Regra 1 - Webhook MercadoPago (posição: **First**) - `Skip`

```
starts_with(http.request.uri.path, "/api/mercadopago/webhook")
```

**Componentes de WAF a ignorar:**
- [x] All remaining custom rules in this phase
- [x] All Rate Limiting rules
- [x] All Managed rules *(se disponível no plano)*
- [x] All Super Bot Fight Mode rules *(se disponível no plano)*

> Objetivo: o webhook do MercadoPago **nunca** pode cair em challenge/block.
>
> **Por que `starts_with` e não `eq`:** as rotas registradas em `notification_url`
> são só `/api/mercadopago/webhook` (`create-preference`, `process-payment`,
> `process-erp-payment`, `retry-payment`, `recover-payment`), mas também existe
> `/api/mercadopago/webhook/subscription`. Com `eq` a subscrição ficaria de fora.
>
> **Sobre o "sempre zerada" no Security Events:** é esperado. As Regras **4 e 5
> já excluem `/api/`** e a Regra 3 não mira esses paths → o webhook nunca é
> candidato a block/challenge. O Skip é **seguro/à prova de regressão**, não uma
> proteção ativa: só passa a carregar de fato se algo futuro pegar `/api/` amplo
> (Managed rules no Pro, rate limit em `/api/`, etc.). Manter custa 1 de 5 slots
> e preserva o caminho de receita - recomendado **manter**.
>
> **Gap conhecido:** por causa da exclusão de `/api/` nas Regras 4/5, um bot
> `curl` batendo em `/api/*` **não** é barrado por elas. Hoje a mitigação é a
> assinatura HMAC + `checkRateLimitForAPI` no próprio handler (o rate limit de
> borda cobre só `/`). Ver §10.

---

### Regra 2 - Skip bots bons - `Skip` → *All remaining custom rules*

```
(cf.client.bot)
```

> Protege GoogleBot/SEO e os monitores de uptime (UptimeRobot, SentryUptimeBot)
> de tomarem challenge. `cf.client.bot` está disponível no plano **Free** e é
> confiável (o Cloudflare valida bot por IP/reverse-DNS/assinatura, não por texto).
>
> ⚠️ **Não** use `http.user_agent contains "UptimeRobot"`/`"SentryUptimeBot"`:
> User-Agent é **trivialmente falsificável**. Qualquer bot pode mandar
> `User-Agent: UptimeRobot` e entrar no **Skip → All remaining custom rules**,
> furando na prática a regra de país, os scanners e o bloqueio de automação.
> Os dois monitores já são **verified bots**, então `cf.client.bot` os cobre.
>
> Variante mais restrita (opcional), se quiser limitar a superfície do bypass:
> `(cf.client.bot and (http.request.uri.path eq "/" or starts_with(http.request.uri.path, "/api/health")))`

---

### Regra 3 - Scanners - `Block`

```
(http.request.uri.path contains "/.git") or
(http.request.uri.path contains "/.env") or
(http.request.uri.path contains "/wp-admin") or
(http.request.uri.path contains "/wp-login.php") or
(http.request.uri.path contains "/xmlrpc.php") or
(http.request.uri.path contains "/phpmyadmin") or
(http.request.uri.path contains "/vendor/phpunit") or
(http.request.uri.path contains "/composer.json") or
(http.request.uri.path contains "/package.json") or
(http.request.uri.path contains "/latest/meta-data") or
(http.request.uri.path contains "/tfstate") or
(http.request.uri.path contains "/swagger") or
(http.request.uri.path contains "/credentials") or
(http.request.uri.path contains "/token") or
(http.request.uri.path contains "/docker-compose") or
(http.request.uri.path contains "/.well-known") or
(http.request.uri.path contains "/terraform") or
(http.request.uri.path contains "/service_account") or
(http.request.uri.path contains "/.config.php")
```

> **Revisar (possíveis falsos positivos):** `/.well-known` (ACME / Apple Pay
> `apple-developer-merchantid-domain-association`), `/token` (OAuth) e
> `/package.json`. Se algo legítimo usar esses caminhos, remover da lista.

---

### Regra 4 - Automação / UA vazio - `Block`

```
not starts_with(http.request.uri.path, "/api/") and (
  http.user_agent contains "curl" or
  http.user_agent contains "python" or
  http.user_agent contains "Go-http-client" or
  http.user_agent contains "Java/" or
  http.user_agent contains "Wget" or
  len(http.user_agent) eq 0
)
```

> É a regra que **mata o pico do `curl/8.71`**. `/api/` fica de fora para não
> quebrar integrações internas. Navegador real não é afetado.
> Alternativa conservadora: iniciar com **Managed Challenge** por 1 dia,
> conferir Security Events e depois trocar para **Block**.

---

### Regra 5 - Países de risco - `Managed Challenge`

```
(ip.src.country in {"BY" "BA" "IO" "BG" "CN" "FI" "FR" "DE" "IN" "ID" "IR" "IQ" "IT" "JP" "KP" "LT" "NL" "AN" "PK" "RO" "RU" "SI" "TN" "TR" "AE" "GB" "UZ" "MA"} and not http.request.uri.path contains "/api/")
```

> Mantida como **Managed Challenge** (não Block): é a camada genérica.
> O bloqueio duro fica para os suspeitos confirmados (IP/UA/ASN).
> Se um dia reduzir a lista de países, melhor; hoje ela inclui FR/DE/GB/NL/IT.

---

## 4. IP Access Rules (não consomem slot de custom rule)

**Onde fica:** Dashboard → zona `dudit.com.br` → **Security → Security rules** →
**Create rule → IP access rules**.
Atalho: `https://dash.cloudflare.com/?to=/:account/:zone/security/security-rules`
(se o item "IP access rules" não aparecer no *Create rule*, crie a primeira e ele passa a listar).

**Como preencher:** em *IP, IP range, country name, or ASN* informe o valor;
em *Action* escolha a ação; em *Zone* selecione *This website*; salve.

| Ação | Valor | Motivo |
|---|---|---|
| Block | `185.177.72.0/24` | cobre `.205` e outros maliciosos do mesmo /24 (bot `curl`, ASN Bucklog) |
| Block (opcional) | `185.177.72.205/32` | só o IP principal, se preferir granularidade |
| **não** bloquear | `45.231.138.240` | possível cliente/parceiro (BR) |
| Managed Challenge (se reincidir) | `45.231.138.240/32` | só se voltar a abusar |

> No plano **Free**, IP Access rules bloqueiam por **IP / range / ASN**, mas
> **Block por país é só Enterprise** - por isso o bloqueio por país fica na
> Custom Rule #5, não aqui.

---

## 5. Rate Limiting (Free: 1 regra, 10s, IP, Block)

**Expressão (Free aceita somente Path):**

```
http.request.uri.path eq "/"
```

- Característica: **IP**
- Rate: **60 requests / 10s**
- Ação: **Block** por 10s

> Backstop para o **próximo** IP desconhecido. Não aplicar limite baixo a tudo
> (pegaria carregamento de assets de visitante real).
>
> ⚠️ **Não** inclua `/monitoring` aqui: esse path é o `tunnelRoute` do Sentry
> (`next.config.mjs`), por onde o SDK do browser entrega eventos. Limitar
> 60/10s nesse endpoint pode atrapalhar a entrega de eventos do Sentry em
> usuários atrás de NAT. Se quiser cobrir `/monitoring`, use um limite bem
> mais alto (ex.: 300/10s).

---

## 6. Monitores de uptime - UptimeRobot x SentryUptimeBot

São **dois serviços diferentes** (não confundir):

| | UptimeRobot | SentryUptimeBot |
|---|---|---|
| Quem é | **UptimeRobot** (uptimerobot.com), serviço externo | **Sentry** - o produto *Uptime Monitoring* |
| User-Agent | `Mozilla/5.0 (compatible; UptimeRobot/2.0; …)` | `SentryUptimeBot/1.0 (+https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/)` |
| Cloudflare | Verified bot | Verified bot |

- **Sentry não é só error tracking**: a conta tem (também) o **Uptime Monitoring**,
  que **se autoconfigura** monitorando o **hostname raiz mais frequente dos erros**.
  Começa com checks horários (onboarding de 3 dias) e depois passa a **1 check/min**
  de várias regiões. Foi isso que gerou `SentryUptimeBot ≈ 1,44k`/dia (≈ 1/min no `/`).
- Ambos são **verified bots** → já cobertos por `cf.client.bot` na Regra 2
  (não usar Skip por string de User-Agent; ver aviso na Regra 2).
- Para desligar o check automático do Sentry: no painel Sentry, **Monitors →
  delete/disable** o monitor de uptime. Bloquear por firewall **não** desliga o monitor.

---

## 7. Bot Fight Mode

Recomendação: **ligar com cuidado / testar**.

- **Prós:** baseline contra bot conhecido em qualquer país.
- **Contras (Free):** não pode ser “skipado” nem customizado, e pode
  **desafiar UptimeRobot / SentryUptimeBot**, quebrando o monitoramento.
- A regra **2** já protege os monitores; ainda assim, **após ligar, valide o uptime**.
- Se quebrar monitoramento → desligar (ou migrar para Pro / Super Bot Fight Mode).

---

## 8. Turnstile - diagnóstico e correção

### 8.1 Sintoma
Nenhum dado no painel do Turnstile nos últimos 7 dias.

### 8.2 Causas encontradas

**(A) CSP bloqueava o iframe do widget** - `lib/supabase/middleware.ts`
- `script-src` já tinha `https://*.cloudflare.com` → script carregava.
- `connect-src` já tinha `https://*.cloudflare.com` → ok.
- **`frame-src` NÃO tinha `challenges.cloudflare.com`** → o iframe onde o
  widget renderiza era bloqueado pelo browser → **widget não aparecia** →
  **zero eventos** no analytics.

**Correção aplicada** (adicionado `https://challenges.cloudflare.com`):
- `frame-src` (o que faltava e causava o bloqueio)
- `child-src` (fallback legado)
- `script-src` (explícito, além do wildcard)

> Ref. oficial: CSP do Turnstile exige `script-src` **e** `frame-src` **e**
> `connect-src` com `https://challenges.cloudflare.com`.

**(B) A validação server-side do app nunca rodava**
`verifyTurnstileToken` em `lib/turnstile/verify.ts` **não é chamado em lugar
nenhum**. O `captchaToken` é enviado apenas ao **Supabase Auth**, em
`components/auth/AuthView.tsx` (`signUp`, `signInWithPassword`,
`resetPasswordForEmail`). Portanto a proteção real depende do CAPTCHA do
Supabase - que **estava desativado** e foi **ativado em 17/10/2026**.

**(C) Hostname do widget** - o widget precisa autorizar `dudit.com.br`
(e `www.dudit.com.br`). Sem isso → erro `110200` (domain not authorized).

### 8.3 Correções

1. **Código (feito):** `lib/supabase/middleware.ts` - `challenges.cloudflare.com`
   em `frame-src`, `child-src`, `script-src`.
2. **Supabase (feito pelo time):** Settings → Authentication →
   *Bot and Abuse Protection* → **Enable CAPTCHA protection** = Turnstile +
   Secret Key.
   > ⚠️ Com o CAPTCHA ligado, **todos** os fluxos exigem token:
   > `signUp`, `signInWithPassword`, `resetPasswordForEmail` (o app já cobre os 3).
   > Por isso o item 1 é pré-requisito: sem o CSP, o widget não renderiza e o
   > login passa a falhar (`captcha_failed`).
3. **Cloudflare Turnstile:** conferir em **Turnstile → widget → Settings →
   Hostname Management** que estão autorizados:
   - `dudit.com.br` (cobre subdomínios, ex.: `www`)
   - se necessário também `www.dudit.com.br`
   > Sem hostname autorizado o widget retorna `110200`.
4. **Cloudflare Turnstile - Widget Mode = `Invisible`:**
   **Turnstile → widget → Settings → Widget Mode = Invisible**.
   > O modo padrão (`Managed`) **mostra o checkbox/badge** - o "cardzinho" que
   > aparecia no login. `Non-Interactive` some o checkbox mas mantém o badge.
   > Só `Invisible` some tudo.
   >
   > ⚠️ **Invisible NÃO roda sozinho:** o token só é gerado via `turnstile.execute()`.
   > Por isso o código foi ajustado (`components/reusable/Turnstile.tsx`):
   > - `appearance = "interaction-only"` + `execution = "execute"` no `render`;
   > - **auto-`execute()` no mount** (token pronto antes do submit);
   > - re-`execute()` no `reset()` e no `onExpire` (deferido 1 tick pra evitar corrida `reset`→`execute`);
   > - container sem o antigo `min-h-[65px]` (não deixa mais buraco invisível).
   >
   > ⚠️ **Ordem:** faça o **deploy do código** antes/junto do toggle no painel.
   > Se virar `Invisible` no painel sem o código, o token fica `null` →
   > Supabase rejeita com `captcha_failed`.
   >
   > Se trocar de widget (novo criado em Invisible), atualizar
   > `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e o fallback hardcoded em
   > `Turnstile.tsx` (`DEFAULT_SITE_KEY`).
   >
   > ⚖️ **Exigência legal do modo Invisible:** a Cloudflare condiciona o modo
   > Invisible a você **referenciar o Adendo de Privacidade do Turnstile** na sua
   > própria política de privacidade. Já incluído em
   > `app/institucional/privacidade/page.tsx` (§3.1, com link para
   > `https://www.cloudflare.com/pt-br/turnstile-privacy-policy/`). Precisa estar
   > **no ar** (deploy) para valer.
   >
   > ⚠️ **Correção de 18/10/2026 - `execution: "execute"` causava `captcha_failed`:**
   > a doc da Cloudflare diz que `render` (default) *"runs the challenge
   > automatically after calling the render() function... ensuring the token is
   > ready when the visitor submits data"*. Usar `execution: "execute"` **desliga**
   > a auto-execução, e um `execute()` manual disparado no mesmo tick do `render()`
   > roda antes do widget ficar pronto → o token não chega no 1º submit → erro no
   > login ("preciso esperar e tentar de novo"). **Corrigido:** volta para
   > `execution = "render"` (auto) + **rede de segurança**:
   > - `TurnstileRef.getToken(): Promise<string | null>` - devolve o token atual
   >   ou **aguarda** o desafio terminar (fallback: força `execute()` em 4s,
   >   timeout em 15s);
   > - `AuthView` / `PartnerWizard` chamam `ensureCaptchaToken()` **antes** de
   >   qualquer `signIn`/`signUp`/`resetPasswordForEmail` → se não houver token,
   >   mostra erro amigável em vez de disparar uma request fadada.
   >
   > **Modos de widget (doc Cloudflare):**
   > | Modo | Comportamento |
   > |---|---|
   > | `Managed` (default) | Escolhe automaticamente entre non-interativo ou checkbox, conforme o risco do visitante. |
   > | `Non-Interactive` | Mostra o widget com spinner; **nunca** pede interação. |
   > | `Invisible` | Roda 100% em background, **sem** widget e **sem** indicador. Exige referenciar o Adendo de Privacidade. |
   >
   > `appearance: "interaction-only"` só afeta os modos **visíveis** (Managed /
   > Non-Interactive) - "o widget só aparece quando for necessária interação".
   > Em `Invisible` o widget nunca aparece, qualquer que seja o `appearance`.
   >
   > ⚠️ **Trade-off do modo `Invisible`:** como o visitante nunca pode interagir,
   > se a Cloudflare decidir que precisa de interação o desafio falha e o
   > login dá `captcha_failed` (sem botão pra clicar). O modo **Managed** (com
   > `appearance: "interaction-only"`) é o melhor equilíbrio: invisível para ~99%
   > dos visitantes, mas com **fallback de checkbox** se ela suspeitar do bot.
5. **Produção (Railway):** garantir `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e
   `TURNSTILE_SECRET`. (O site key tem fallback hardcoded no componente, mas
   conferir é recomendado.)

### 8.4 Como validar (após deploy)

- **Console do browser em `/auth`:**
  - Antes: erro `Refused to frame 'https://challenges.cloudflare.com'…`
  - Depois: deve sumir; inspecionar `iframe[src*="challenges.cloudflare.com"]` presente.
- **Visual (modo Invisible):** **nenhum** card/checkbox/badge deve aparecer no
  login/signup/reset. O `iframe` do Turnstile existe no DOM, mas oculto.
- **Teste negativo:** enviar login/signup sem token ou com token inválido deve
  retornar `captcha_failed`. Se **ainda** autenticar → CAPTCHA do Supabase não
  está ativo de fato.
- **Turnstile dashboard:** "challenges issued" e chamadas `siteverify` > 0.
- **Fluxos:** testar login, signup e "esqueci a senha".

> Nota de retenção: o analytics do Turnstile **guarda apenas 7 dias** e só conta
> quando o widget renderiza (e, idealmente, quando o token é validado via siteverify).

---

## 9. Validação geral (WAF)

- **Security → Events:** filtrar por `185.177.72.205`, por país e por `curl`;
  confirmar ação (Block/Managed Challenge) e que `/api/mercadopago/webhook` não
  cai em challenge.
- **Challenge solve rate** baixo ⇒ a regra está filtrando bot de fato.
- Conferir se `UptimeRobot`/`SentryUptimeBot` continuam recebendo 200 (ou Skip),
  sem challenge.

---

## 10. Próximos passos / quando escalar

- Se os picos crescerem: considerar **Pro** (Super Bot Fight Mode + Skip +
  janelas maiores de rate limit e ação por capture de bot score).
- **Cache Rules** para GET anônimo (hoje cache hit ~12,55%): absorve muito bot.
- **Rate limit por IP** nas rotas públicas anônimas (`/`, `/sacola`, busca) -
  hoje o `lib/rate-limiter.ts` só cobre ações por categoria/usuário.
- **Tapar o buraco de `/api/` (ver Regra 1):** um bot `curl` em `/api/*` não é
  barrado pelas Regras 4/5 (exclusão de `/api/`). Se virar problema, avaliar
  trocar o slot da Regra 1 por uma regra que **desafie automação em `/api/`**
  que espera navegador (ex.: `not starts_with(path,"/api/mercadopago/webhook")
  and not starts_with(path,"/api/channels") and <UA de bot> and not <secret>`),
  mantendo webhooks/integrações na whitelist. Só depois de mapear todos os
  chamadores máquina-a-máquina (MP, Supabase, cron, Sentry).
- **Under Attack Mode** temporário durante ataques maiores.
- Monitorar Turnstile via API/GraphQL (`turnstileAdaptiveGroups`) se quiser
  histórico além dos 7 dias.

---

## Apêndice - referências

- Docs Cloudflare: custom rules, rate limiting best practices, challenge bad bots,
  Turnstile CSP e hostname management.
- Reputação do IP principal: AbuseIPDB, greensnow.co, blocklist.de, IPsum,
  (relatório agregado abuse.mom/ip/185.177.72.205).
- Docs Supabase: Auth CAPTCHA (Turnstile).
