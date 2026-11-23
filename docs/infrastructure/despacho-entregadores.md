# Despacho de entregadores — diagnóstico e plano (Fase 0 → 3)

> **Status:** Fases 0, 1, 2 e 3 implementadas e aplicadas no banco em 2026-11-23.
> **Escopo:** rede de entregadores Dudit (`delivery_drivers`, `delivery_assignments`,
> `get_available_delivery_offers`, portal `/entregadores`).
> **Decisões travadas (2026-11-23):** **board-first** — quadro aberto em todos os tiers,
> com escada de raio; oferta dirigida (`mode='directed'`) fica no schema, desligada, até a
> densidade justificar (§4.4). **GPS em background** com heartbeat. Decisão em
> **minutos**, não em metros. Ver §12 para o racional de cada decisão.
> **Fora de escopo:** frete nacional / transportadoras (`carrier-shipping.ts`), serviços
> com deslocamento (`service_attendance`), cálculo de taxa ao cliente.
>
> **Sobre o SQL deste documento:** os blocos são **esboço ilustrativo**, não migrations
> prontas. Ao implementar, seguir as convenções do repositório já usadas em
> `migrations/`: `SECURITY DEFINER` + `SET search_path`, `ENABLE`/`FORCE ROW LEVEL SECURITY`,
> `REVOKE`/`GRANT` explícitos, guarda de `pg_cron` por `pg_extension`, e `*_rollback.sql`
> correspondente.

---

## 1. Sumário executivo

Hoje o Dudit decide "quem entrega" com **um único filtro geográfico binário**:
distância em linha reta entre o **endereço residencial** do entregador e a loja,
comparada com um `20.0` fixo no SQL. Não há tempo, não há veículo, não há ocupação,
não há ranking e não há escalada. Quando ninguém pega, a oferta simplesmente expira.

Plataformas de delivery não decidem por raio. Decidem por **orçamento de tempo**
combinado com **filtros rígidos de elegibilidade** e **ranking por score**. O raio é
apenas a projeção desse orçamento no mapa — e a forma geométrica correta é uma
**isócrona** (alcance pela malha viária), não um círculo.

Este plano substitui o filtro binário por essa cadeia, em quatro fases incrementais,
reaproveitando a infraestrutura que já existe (Postgres + RPC `SECURITY DEFINER` +
`pg_cron`). Nenhuma dependência nova de serviço.

**Ganho esperado:** tempo pedido→aceite de ~15 min (TTL atual) para ≤ 3 min, e
visibilidade completa de *por que* um pedido não foi aceito.

---

## 2. Como o mercado resolve de verdade

### 2.1 iFood (fonte oficial — é o caso mais próximo do nosso)

Do portal institucional e do portal do entregador:

- **Raio inicial de 5 km** a partir da **loja** para selecionar entregadores disponíveis.
- Reconhecimento explícito da escalada: _"muitas vezes o pedido pode cair para um
  entregador que está longe do restaurante. Isso ocorre quando o estabelecimento recebe
  um grande volume de pedidos."_
- **Separação por veículo** (regra de negócio, não de distância):
  - rotas **curtas e leves** → **bike**
  - rotas **mais longas** que cabem na bag → **moto**
  - **pesados/volumosos** (mercado) → **carro**
- **Ocupação**: _"se o parceiro já tiver outras entregas programadas, o app procurará
  outros entregadores."_
- **Cinco critérios declarados de distribuição:** dedicação a região (frota dedicada tem
  prioridade) · planejamento · **Score** · proximidade de regiões de alta demanda ·
  necessidade especial do pedido.
- **Cooldown**: 3 recusas consecutivas → entregador sai da fila por **15 min**.
- Produto "entrega rápida": **raio de até 3 km** para comida — porque o gargalo é o tempo
  do alimento, não a distância.

### 2.2 Uber

O `DeepETA` (blog de engenharia) define o padrão de ETA:

- `ETA = motor de roteamento` (grafo de vias + tráfego em tempo real) `+ modelo de ML`
  que prediz o **resíduo** — _"o mapa não é o terreno"_.
- Features: origem, destino, hora, tráfego e **tipo de viagem** (entrega vs. corrida), com
  viés separado por segmento.
- Latência de **milissegundos**; features contínuas **bucketizadas**; localização vira
  **embedding geoespacial em múltiplas resoluções**.
- Loss **Huber assimétrico**: "1 minuto atrasado dói mais que 1 minuto adiantado" —
  decisão de produto embutida no modelo.

### 2.3 DoorDash

- Dispatch **não** é "entregador mais próximo": é um **problema de atribuição**
  (aparece nas fontes públicas como **DeepRed**). Relatos técnicos citam **Flink** para
  stream de localização e **Redis + células S2** para consulta de proximidade.
- **Batching** (2–3 pedidos por viagem) é otimização central.
- Prioridade declarada: entregar **mais rápido**, considerando tempo até a loja, tempo
  até o pedido ficar pronto e **confiabilidade** do entregador.

### 2.4 Deliveroo ("FRANK")

Caso público mais antigo e didático: **atribuição dirigida** automática, com redução
divulgada de ~20% no tempo de entrega — não um quadro de ofertas aberto.

### 2.5 Rabbit (quick commerce) — o melhor resumo técnico do problema

1. **"Entregador mais próximo" é uma armadilha.** O mais perto pode estar terminando
   outra entrega na direção oposta; e o pedido pode não estar pronto — mandar alguém
   esperar na loja queima o recurso mais caro do sistema: **tempo do entregador**.
2. **Distância ≠ tempo.** _"400 m cruzando um cruzamento congestionado pode ser mais
   lento que 1 km em via livre."_ → _"dispatch tem que raciocinar em minutos, não em metros."_
3. Duas predições sustentam tudo: **order-ready time** e **travel time** (incluindo os
   "últimos 50 metros": prédio, andar, portaria).
4. Objetivos em conflito: **velocidade** × **eficiência (batching)** × **justiça com o
   entregador** × **agora vs. daqui a 5 min** (não mandar o entregador para longe se vem
   uma onda de pedidos naquela região).
5. **Densidade melhora o despacho** — mais pedidos por loja = mais batching e melhor predição.

### 2.6 Base acadêmica e números de apoio

- O problema geral é **VRP** (Vehicle Routing Problem), NP-hard. Variantes presentes no
  nosso caso: **VRPTW** (janelas de tempo), **CVRP** (capacidade), **VRPPD**
  (pickup & delivery), **multi-trip**. Na prática ninguém resolve ótimo: heurística com
  orçamento de milissegundos.
- **Fator de circuidade** (rota real ÷ linha reta): **~1,3–1,5 em centro urbano denso**,
  **1,1–1,2 em rodovia**. É o número que legitima usar Haversine como *estimativa*.
- **Isócrona ≠ raio**: a documentação do Google Isochrones API define raio como linha
  reta e isócrona como alcance real pela malha viária. Para comida quente, zona de
  entrega é dimensionada por **15–25 min**, não por km.

---

## 3. Estado atual do Dudit (auditoria do código)

Referências: `migrations/20261107_smart_delivery_radius_and_address_sync.sql`,
`migrations/20260817_delivery_drivers_mvp.sql`,
`migrations/20260820_fix_delivery_driver_flow_and_available_offers.sql`,
`migrations/20260825_fix_delivery_driver_offers_multi_orders_and_expiration.sql`,
`migrations/20260427_delivery_fee_system.sql`.

| Item | Como está hoje | Problema |
|---|---|---|
| Distância | `haversine_distance_km(entregador → loja) <= 20.0` | Linha reta + número fixo no SQL; ignora `delivery_settings.max_delivery_km` (que é por loja) |
| Fallback | Sem coordenadas: mesmo `city` **ou** cidade contida no `delivery_address` | Na prática libera a cidade inteira (pode ser 80 km) |
| Posição do entregador | Endereço **residencial** do perfil, sincronizado por trigger em `addresses` | Não é posição atual; entregador a 12 km de casa aparece a 12 km da loja |
| Veículo | `delivery_drivers.vehicle_type ('moto','carro')` existe | **Nunca é usado no matching** |
| Ocupação | Ofertas aparecem mesmo com entregador lotado | Bloqueio só no aceite (`>= 2` ativas → `delivery_driver_busy`); UX ruim |
| Ranking | `ORDER BY assigned_at DESC` | "Mais recente primeiro", não "melhor primeiro" |
| Tempo | Nada | Sem `pickup_minutes`, sem `delivery_minutes`, sem ETA |
| Escalada | Não existe | Oferta morre em `15 min` e o pedido fica parado |
| Falta de entregador | Silenciosa | Ninguém é notificado; não há `outcome` registrado |
| Recusa | Inexistente | Entregador só ignora; impossível aplicar score ou cooldown |
| Modelo | **Quadro aberto** (todos veem tudo) | Disputa/race; injustiça; sem exclusividade |

### 3.1 Ciclo de vida atual (para referência)

```
ERP: requestDuditDeliveryAction()
  → INSERT delivery_assignments (status='available', driver_id=NULL, assigned_at=now())
Entregador: get_available_delivery_offers()   ← RPC lista tudo que passa no filtro
  → accept_delivery_offer(assignment_id)      ← RPC (checa busy >= 2, sem exclusividade)
  → transition_delivery_assignment(...)       ← picked_up → out_for_delivery → delivered
```

Consequência: `delivery_assignments` acumula o papel de "estado do pedido" **e** de
"estado da abordagem ao entregador". Este plano separa os dois com `delivery_offers`.

---

## 4. Modelo alvo

```
┌─────────────────────────────────────────────────────────────────────┐
│ pg_cron  (15s)                                                      │
│   └─ dispatch_tick()                                                │
│        1. expira ofertas vencidas                                   │
│        2. calcula tier pela idade do pedido                         │
│        3. candidatos  = presença ∩ filtros rígidos ∩ raio do tier   │
│        4. eligible    = score(candidato)                            │
│        5. emite ofertas (dirigida top_n | quadro aberto)            │
│        6. registra delivery_dispatch_events                         │
└─────────────────────────────────────────────────────────────────────┘
             │
             ▼
   delivery_offers  ──►  app do entregador (convite com TTL)
             │
             ├─ accept  → delivery_assignments.status='accepted'
             └─ decline → reject_streak++ → cooldown após N recusas
```

**Princípio:** `delivery_assignments` continua sendo a **verdade do pedido**;
`delivery_offers` é a **verdade da abordagem**. Isso mantém compatibilidade com todo o
código existente (`accept_delivery_offer`, `transition_delivery_assignment`,
`get_my_delivery_assignments`) e permite ligar o motor novo em modo passivo.

### 4.1 Cadeia de decisão

| Etapa | O que faz | Onde |
|---|---|---|
| 1. Pré-filtro | candidatos por bbox (`lat/lng ± delta`) | índice em `delivery_driver_locations` |
| 2. Haversine × circuidade | estimativa de km de rua | `estimate_road_km()` |
| 3. Filtros rígidos | quem **pode** | `delivery_driver_presence` + regras |
| 4. Predição | ready_time da loja + travel_time | `estimate_travel_min()` |
| 5. Ranking | quem **deve** | `dispatch_score()` |
| 6. Oferta | convite + TTL + escalada | `delivery_offers` + `dispatch_tick()` |
| 7. Aprendizado | telemetria e A/B | `delivery_dispatch_events` |

### 4.2 Filtros rígidos (se falhar um, nem entra no ranking)

1. `is_active` e `availability_status = 'available'`
2. `cooldown_until` nulo ou no passado
3. `active_count < capacity_orders` (1 moto / 2–3 carro)
4. Posição conhecida (`position_quality <> 'unknown'`)
5. Distância até a loja ≤ km do tier corrente
6. Veículo compatível com peso/volume do pedido (**quando o dado existir**)
7. Vínculo ativo em `delivery_driver_partners` (rede daquele parceiro)
8. Pedido dentro de `delivery_settings.max_delivery_km` da loja

### 4.3 Score (pesos em tabela, nunca no corpo da função)

```
score = 0.40 * (1 - min(pickup_minutes, 30)/30)          -- chegar rápido na loja
      + 0.20 * (1 - min(detour_minutes, 20)/20)           -- batching
      + 0.15 * acceptance_rate                            -- confiabilidade
      + 0.10 * (1 - min(deliveries_today, 12)/12)         -- justiça
      + 0.10 * (1 - min(active_count/capacity, 1))        -- ocioso primeiro
      + 0.05 * (1 - min(min_since_last_offer, 60)/60)     -- anti-starvation
```

### 4.4 Escalada em tiers — **board-first** (decisão de 2026-11-23)

A rede tem **poucos entregadores hoje**. Com 2–3 por região, oferta dirigida (convite
para um único entregador com TTL) é **pior** que quadro aberto: gasta 45 s esperando
alguém que pode estar offline, para só depois tentar o próximo. Por isso a escalada
começa sendo **somente de raio**: o pedido é anunciado para **todos** os elegíveis desde
o tier 0, e cada tier apenas **adiciona** candidatos.

| Tier | Raio | Espera | Modo | Por que |
|---:|---:|---:|---|---|
| 0 | 2 km | 30 s | board | quem está do lado vê primeiro e decide rápido |
| 1 | 4 km | 45 s | board | + candidatos |
| 2 | 7 km | 60 s | board | + candidatos |
| 3 | 12 km | 75 s | board | + candidatos |
| 4 | teto econômico (§4.5) | 90 s | board | último recurso antes de "sem entregador" |

**Bônus = R$ 0 em todos os tiers.** Não existe orçamento para bancar escalada (ver §4.5):
a taxa é fixa no pedido e nem a Dudit nem o vendedor pagam a mais por padrão. O campo
`bonus` só é preenchido quando o parceiro **autoriza manualmente** (ver §7.5).

**Critério para ligar a oferta dirigida** — `mode='directed'` já existe no schema, basta
virar config: quando, por **2 semanas seguidas**, ≥ 80% dos pedidos tiverem **≥ 4
entregadores elegíveis dentro de 4 km** no momento do despacho. Esse número sai de
`delivery_dispatch_events` — mais um motivo para a telemetria vir antes da regra.

**Densidade baixa muda a prioridade:** o gargalo não é matching, é **oferta de
entregador**. Nessa fase o ganho real vem de notificar quem está offline, sugerir taxa
viável e dar ETA honesto ao cliente — não de otimizar score entre 2 candidatos.

### 4.5 Raio economicamente viável (a armadilha do raio fixo)

```
taxa do pedido: R$ 8,00 (fixa, já calculada no pedido)
  →  3 km = R$ 2,67/km   ← entregador aceita
  → 12 km = R$ 0,67/km   ← entregador recusa
  → 20 km = R$ 0,40/km   ← ninguém aceita
```

Como `delivery_fee` é o **repasse do entregador** (é assim que o DRE trata: _"Fretes e
Entregas (Repasse a Entregadores)"_), expandir raio com taxa fixa **não resolve** "sem
entregador": só gera ofertas que ninguém aceita e queima os 3 minutos do ladder.

Regra:

```
max_pickup_km = min(store_max_km, taxa_disponivel / piso_rs_por_km)
piso_rs_por_km: moto 1,20 · carro 1,60 · bike 1,00   (configurável em dispatch_settings)
```

Se o piso cortar o raio abaixo do necessário, o sistema **para de expandir** e entra em
`no_economically_viable_courier`, mostrando ao parceiro algo acionável:

- "Sem entregador a 6 km. A taxa de R$ 8,00 cobre até 6,7 km (piso R$ 1,20/km)."
- **Sugestão de taxa:** `ceil(piso × rota_km)` — um número, não um beco sem saída
- alternativas: retirada no balcão ou transportadora

E o card do entregador passa a mostrar **R$/km**, que é o número que ele de fato usa para
decidir — mais útil que os minutos.

### 4.6 Parâmetros iniciais (para calibrar, não são verdade revelada)

| Parâmetro | Valor inicial |
|---|---|
| Fator de circuidade (urbano / rodovia) | 1,35 / 1,15 |
| Velocidade média moto / carro / bike | 24 / 20 / 13 km/h |
| Tempo de coleta (handoff na loja) | 5 min |
| "Últimos 50 metros" | +2 min (embutido no handoff do cliente) |
| Desvio máximo de batching | 5 min **ou** +15% de rota |
| Piso de R$/km (moto / carro / bike) | 1,20 / 1,60 / 1,00 |
| Recusas para cooldown / duração | 3 / 15 min |
| Heartbeat de GPS | 20 s (stale > 2 min = não elegível) |

---

## 5. Fase 0 — Parar de errar (estimativa: 2 dias)

Objetivo: eliminar os três erros que produzem resultado visivelmente errado, **sem
schema novo relevante**.

### 5.1 `migrations/20261123_1000_dispatch_fase0_radius_and_eligibility.sql`

| # | Correção | Implementação |
|---|---|---|
| 0.1 | Matar o `20.0` hardcoded | `<= COALESCE(ds.max_delivery_km, dsp.max_pickup_km, 20)` com `LEFT JOIN delivery_settings ds ON (ds.store_id = o.store_id) OR (ds.store_id IS NULL AND ds.partner_id = da.partner_id)` |
| 0.2 | Fechar o buraco do fallback por cidade | Só vale com **ambos** os lados sem coordenada **E** `state` igual **E** bbox ≤ `max_pickup_km`. Senão, não aparece |
| 0.3 | Ocultar oferta de entregador lotado | `active_count < dd.capacity_orders` (mesma contagem de `get_my_delivery_dashboard`) |
| 0.4 | Cooldown por recusa | `delivery_drivers.reject_streak int DEFAULT 0`, `cooldown_until timestamptz` |
| 0.5 | Oferta não morre mais em 15 min | Trocar `da.assigned_at >= now() - interval '15 minutes'` por `da.status = 'available' AND o.delivery_status NOT IN ('sent','delivered','cancelled')` |
| 0.6 | Preparar veículo/carga | `delivery_drivers`: `capacity_orders smallint DEFAULT 1`, `has_thermal_bag boolean DEFAULT false`, `max_pickup_km numeric`. `orders`: `package_weight_kg numeric`, `package_volume_l numeric` (**nullable**) |
| 0.7 | Dimensões desconhecidas (§12.3) | `delivery_assignments.dimensions_unknown boolean` calculado no `requestDuditDeliveryAction`; aviso com "preencher agora" ou "continuar mesmo assim" (auditado); badge no card do entregador |
| 0.8 | **R$/km** no card do entregador | `round(delivery_fee / NULLIF(rota_km,0), 2)` na oferta — o número que ele usa para decidir |

> **Sobre 0.6/0.7:** `products` **já tem** `weight_gross`, `weight_net`, `width`, `height`
> e `length` (criados em `add_product_fiscal_fields.sql` para o SuperFrete), mas com
> `DEFAULT 0`. Não é preciso migration nova na tabela de produtos — o volume da linha é
> `(width × height × length) / 1000` litros. O problema é **preenchimento**, não schema.
> Enquanto `weight_gross = 0` em tudo, `vehicle_compatible()` retorna `true` e o veículo
> apenas ordena, nunca bloqueia.

### 5.2 Critério de aceite

- [x] Pedido a 25 km da loja não aparece para nenhum entregador
- [x] Entregador com `capacity_orders` entregas ativas não vê oferta
- [x] Entregador em `cooldown_until` futuro não vê oferta
- [x] `delivery_settings.max_delivery_km = 8` faz o teto ser 8 km, não 20
- [x] Pedido com produto sem dimensão mostra o aviso e exige escolha explícita
- [x] Card do entregador exibe R$/km e o badge de dimensão pendente
- [x] `tsc --noEmit` e `git diff --check` limpos

---

## 6. Fase 1 — Raciocinar em minutos (estimativa: 1 semana)

### 6.1 `migrations/20261123_1100_driver_live_location.sql`

```sql
CREATE TABLE IF NOT EXISTS public.delivery_driver_locations (
  driver_id    uuid PRIMARY KEY REFERENCES public.delivery_drivers(user_id) ON DELETE CASCADE,
  latitude     numeric(10,7) NOT NULL,
  longitude    numeric(10,7) NOT NULL,
  accuracy_m   numeric(8,2),
  heading_deg  numeric(6,2),
  speed_kmh    numeric(6,2),
  source       text NOT NULL DEFAULT 'gps'
                 CHECK (source IN ('gps','network','address_fallback')),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_driver_locations_fresh_idx
  ON public.delivery_driver_locations (updated_at DESC);

ALTER TABLE public.delivery_driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_locations FORCE ROW LEVEL SECURITY;
-- leitura: próprio entregador e parceiros vinculados (via delivery_driver_partners)
-- escrita: somente via RPC SECURITY DEFINER
```

**View única de verdade** (hoje a lógica de "occupied" só existe dentro de
`get_my_delivery_dashboard`; precisa ser reaproveitável pelo dispatch):

```sql
CREATE OR REPLACE VIEW public.delivery_driver_presence AS
SELECT dd.user_id,
       dd.is_active, dd.availability_status, dd.vehicle_type,
       dd.capacity_orders, dd.max_pickup_km,
       dd.reject_streak, dd.cooldown_until,
       count(da.id) FILTER (
         WHERE da.status IN ('accepted','picked_up','out_for_delivery')
       ) AS active_count,
       COALESCE(l.latitude,  a.latitude)  AS lat,
       COALESCE(l.longitude, a.longitude) AS lng,
       CASE WHEN l.updated_at > now() - interval '2 minutes' THEN 'live'
            WHEN a.latitude IS NOT NULL                     THEN 'address'
            ELSE 'unknown' END AS position_quality,
       l.updated_at AS located_at
FROM public.delivery_drivers dd
LEFT JOIN public.delivery_driver_locations l ON l.driver_id = dd.user_id
LEFT JOIN LATERAL (
  SELECT latitude, longitude FROM public.addresses
  WHERE user_id = dd.user_id
  ORDER BY is_default DESC, updated_at DESC
  LIMIT 1
) a ON true
LEFT JOIN public.delivery_assignments da ON da.driver_id = dd.user_id
GROUP BY dd.user_id, dd.is_active, dd.availability_status, dd.vehicle_type,
         dd.capacity_orders, dd.max_pickup_km, dd.reject_streak, dd.cooldown_until,
         l.latitude, l.longitude, l.updated_at, a.latitude, a.longitude;
```

**RPC** `upsert_my_driver_location(p_lat, p_lng, p_accuracy, p_heading, p_speed)`:
`SECURITY DEFINER`, `SET search_path = public, pg_temp`, grava apenas se `auth.uid()`
tiver linha em `delivery_drivers`, valida faixas de lat/lng, e é `INSERT ... ON CONFLICT
(driver_id) DO UPDATE`.

**Cliente:** `components/delivery/DriverLocationBeacon.tsx`

- `navigator.geolocation.watchPosition`
- fila com envio a cada **20 s** (e envio imediato em mudança de status)
- permissão explícita na UI; se negada → `source='address_fallback'` e badge visível
- parar o watch ao ficar `offline` (bateria + LGPD)

### 6.2 `migrations/20261123_1200_offer_eta_and_vehicle_compat.sql`

```sql
-- linha reta → estimativa de rua
public.estimate_road_km(p_straight_km numeric, p_circuity numeric DEFAULT 1.35) RETURNS numeric
-- km → minutos por veículo e hora do dia (tabela `delivery_vehicle_speeds`)
public.estimate_travel_min(p_km numeric, p_vehicle text, p_hour int) RETURNS numeric
-- sem peso/volume → true (não bloqueia)
public.vehicle_compatible(p_vehicle text, p_weight numeric, p_volume numeric) RETURNS boolean
```

`get_available_delivery_offers` v2 passa a devolver, por oferta:

```jsonc
{
  "pickup_km": 3.2,
  "pickup_minutes": 9,
  "delivery_km": 5.8,
  "delivery_minutes": 16,
  "eta_total_minutes": 33,        // inclui handoff_min = 5
  "vehicle_compatible": true,
  "position_quality": "live"
}
```

**UI:**

- `components/delivery/AvailableDeliveryGridCard.tsx`
- `components/delivery/AvailableDeliveryListRow.tsx`
- `components/delivery/AvailableDeliveryDetail.tsx`

Passam a exibir `3,2 km · 9 min até a loja · 16 min até o cliente`, e faixa de aviso
quando `vehicle_compatible = false`. Em `components/delivery/DeliveryDashboard.tsx`,
badge de qualidade de posição (`live` / `endereço` / `sem sinal`).

### 6.3 Critério de aceite

- [x] Entregador aceita sabendo o tempo real até loja e até cliente
- [x] GPS negado não quebra nada: cai para endereço com badge explícito
- [x] `position_quality = 'address'` aparece no card (transparência, não punição)
- [x] Heartbeat para de rodar com status `offline`

---

## 7. Fase 2 — Despacho com escalada (board-first) (estimativa: 1–2 semanas)

### 7.1 `migrations/20261123_1300_dispatch_settings_and_offers.sql`

```sql
CREATE TABLE IF NOT EXISTS public.dispatch_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  store_id   uuid REFERENCES public.stores(id)   ON DELETE CASCADE,
  max_pickup_km       numeric NOT NULL DEFAULT 20,
  circuity_factor     numeric NOT NULL DEFAULT 1.35,
  piso_rs_por_km      numeric NOT NULL DEFAULT 1.20,   -- §4.5
  tier_ladder         jsonb   NOT NULL DEFAULT '[
    {"tier":0,"km":2,   "wait_s":30,"mode":"board","top_n":0},
    {"tier":1,"km":4,   "wait_s":45,"mode":"board","top_n":0},
    {"tier":2,"km":7,   "wait_s":60,"mode":"board","top_n":0},
    {"tier":3,"km":12,  "wait_s":75,"mode":"board","top_n":0},
    {"tier":4,"km":null,"wait_s":90,"mode":"board","top_n":0}
  ]'::jsonb,
  batch_max_detour_min int NOT NULL DEFAULT 5,
  reject_threshold     int NOT NULL DEFAULT 3,
  reject_cooldown_min  int NOT NULL DEFAULT 15,
  handoff_min          int NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);

> `tier_ladder[].km = null` significa "teto econômico": `min(max_pickup_km, taxa / piso_rs_por_km)`,
> recalculado por pedido em `dispatch_tick()`. `mode` sai `board` e vira `directed` só
> quando o critério de densidade do §4.4 for atingido — é troca de config, não de código.

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_settings_partner_default_idx
  ON public.dispatch_settings (partner_id) WHERE store_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_settings_partner_store_idx
  ON public.dispatch_settings (partner_id, store_id) WHERE store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.delivery_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  driver_id     uuid NOT NULL REFERENCES public.delivery_drivers(user_id) ON DELETE CASCADE,
  tier smallint NOT NULL,
  score numeric(8,4) NOT NULL,
  score_breakdown jsonb,
  pickup_km numeric, pickup_minutes numeric,
  delivery_km numeric, delivery_minutes numeric,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','expired','superseded')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (assignment_id, driver_id, tier)   -- torna dispatch_tick idempotente
);

CREATE INDEX IF NOT EXISTS delivery_offers_driver_pending_idx
  ON public.delivery_offers (driver_id, expires_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.delivery_dispatch_events (
  id bigserial PRIMARY KEY,
  assignment_id uuid NOT NULL,
  tier smallint NOT NULL,
  candidates int, eligible int, offers_created int,
  outcome text,           -- offered | no_candidate | expired | exhausted
  took_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_assignments
  ADD COLUMN IF NOT EXISTS dispatch_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_tier         smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_exhausted_at timestamptz;
```

**RLS:** `ENABLE` + `FORCE` nas três tabelas. `delivery_offers` legível só pelo próprio
driver (`driver_id = auth.uid()`) e pelo parceiro da entrega; escrita **somente** via RPC
`SECURITY DEFINER` (seguir o padrão de `20261103120000_restrict_attachment_table_writes.sql`:
revogar `INSERT/UPDATE/DELETE` de `PUBLIC`, `anon`, `authenticated`; conceder a
`service_role`).

### 7.2 `migrations/20261123_1400_dispatch_tick_and_cron.sql`

Pseudo-fluxo do `dispatch_tick()`:

```
para cada assignment em (status='available' AND driver_id IS NULL):
  1. expirar ofertas pending com expires_at < now()        → status='expired'
  2. se dispatch_started_at IS NULL → dispatch_started_at = now(), dispatch_tier = 0
  3. idade = now() - dispatch_started_at
     tier_alvo = maior tier cuja soma acumulada de wait_s anteriores <= idade
  4. se tier_alvo > dispatch_tier:
        UPDATE delivery_offers SET status='superseded'
          WHERE assignment_id = ... AND status='pending'
        dispatch_tier = tier_alvo
  5. candidatos = delivery_driver_presence
        WHERE is_active AND availability_status='available'
          AND (cooldown_until IS NULL OR cooldown_until < now())
          AND active_count < capacity_orders
          AND position_quality <> 'unknown'
          AND haversine(lat, lng, loja.lat, loja.lng) <= tier.km
          AND vehicle_compatible(...)
          AND EXISTS (vínculo ativo em delivery_driver_partners)
  6. eligible = candidatos com dispatch_score(...); ordena desc; aplica top_n
                 (mode='board' → todos)
  7. INSERT delivery_offers (...) ON CONFLICT (assignment_id, driver_id, tier) DO NOTHING
  8. INSERT delivery_dispatch_events (candidates, eligible, offers_created, outcome, took_ms)
  9. se tier = último e nenhuma oferta pending → dispatch_exhausted_at = now()
     → notificar parceiro "sem entregador na rede"
```

Cron, no padrão de guarda que o projeto já usa
(`20260802_webhook_events_ttl_cleanup.sql`, `20260826_periodic_cleanup_and_audit_optimization.sql`):

```sql
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available - skip scheduling dispatch_tick';
    RETURN;
  END IF;
  PERFORM cron.schedule('dudit_dispatch_tick', '15 seconds', 'SELECT public.dispatch_tick();');
END
$cron$;
```

> **Fallback:** se a versão de `pg_cron` do ambiente não aceitar sub-minuto, usar
> `'* * * * *'` (1 min) e reescalonar `wait_s` para `[60, 60, 60, 60, 120]`.
> **Obrigatório:** adicionar o job em `docs/ops/restore-cron-jobs-2026-11-04.sql`,
> senão ele some no próximo restore.

### 7.3 `migrations/20261123_1500_tier_accept_decline.sql`

- **`accept_delivery_offer(p_assignment_id)`** reescrito: aceita se
  1. existe oferta `pending` do driver **e** `expires_at > now()`, **ou**
  2. o assignment está no tier de `mode='board'` (comportamento atual preservado).

  Mantém a checagem `delivery_driver_busy` como *backstop* — mas com o filtro da Fase 0
  ela praticamente não dispara mais. Usar `FOR UPDATE` na linha da oferta.
- **`decline_delivery_offer(p_offer_id)`**: `status='declined'`, `responded_at = now()`,
  `reject_streak = reject_streak + 1`; quando `reject_streak >= reject_threshold` →
  `cooldown_until = now() + reject_cooldown_min`.
- `accept` e `decline` **zeram** `reject_streak`.

**UI:** em `components/delivery/AvailableDeliveryDetail.tsx`, a oferta mostra o **tempo
restante do tier atual** (`fecha em 38 s`) e um botão **Recusar**. Hoje não existe recusa
— o entregador só ignora, o que torna score e cooldown impossíveis. Quando
`mode='directed'` for ligado no futuro (§4.4), o mesmo componente vira convite exclusivo
com contador; em `mode='board'` (o padrão agora), é o quadro atual com TTL visível.

### 7.4 Bônus autorizado pelo parceiro (nunca automático)

Como nenhum agente paga a mais por padrão (§4.5), bônus **não** é automático:

- Ação explícita no ERP: `authorize_delivery_bonus(p_assignment_id, p_amount, p_reason)`
- Grava `delivery_assignments.bonus_amount`, `bonus_authorized_by`, `bonus_reason`
- Entra em `orders.delivery_breakdown` como **linha própria** — não mexe no `delivery_fee`
- Auditado via `logAuditEvent` (mesmo padrão de `requestDuditDeliveryAction`, em
  `app/actions/erp/delivery-driver-assignments.ts`)
- Aparece no card do entregador como "bônus R$ X", separado da taxa

Sem autorização, `bonus = 0` e o ladder **não promete** dinheiro que não existe.

### 7.5 Critério de aceite

- [x] Pedido percorre os 5 tiers em ≤ 3 min no pior caso
- [x] Todo aceite é rastreável a um tier (`delivery_offers.tier`)
- [x] `delivery_dispatch_events` responde "por que ninguém pegou?" sem abrir o banco na mão
- [x] Rodar `dispatch_tick()` duas vezes seguidas não duplica oferta
- [x] Com `tier_ladder` reduzido a um único tier de 20 km em `mode='board'`, o
      comportamento é idêntico ao de hoje (rollback sem deploy)

---

## 8. Fase 3 — Inteligência (estimativa: 3–4 semanas)

### 8.1 `migrations/20261123_1600_ready_time_and_eta_calibration.sql`

- **`store_ready_estimates(store_id, weekday, hour_bucket, size_bucket, avg_ready_min,
  samples, updated_at)`** — média móvel exponencial alimentada por
  `picked_up_at - accepted_at` reais. Sem isso o ETA é sempre otimista e o entregador
  sempre espera no balcão (o problema nº 1 apontado pela literatura).
- **`eta_calibration(segment, factor)`** — mediana de `real/previsto` por
  `(loja, zona, hora)`, aplicada sobre `estimate_travel_min()`. Regressão simples antes de
  qualquer ML.
- `get_available_delivery_offers` passa a **segurar** a oferta até `T-8min` quando
  `ready_time` é longo, evitando entregador parado na loja.

### 8.2 `migrations/20261123_1700_batching_and_experiments.sql`

- **`find_batch_candidate(p_assignment_id)`**: aceita segundo drop se
  `detour <= batch_max_detour_min` **e** `+15%` de rota **e**
  `active_count < capacity_orders` **e** (mesma loja **ou** lojas a ≤ 1,5 km).
- **`dispatch_experiments(key, variant_a, variant_b, enabled)`** + hash de
  `assignment_id` → A/B de pesos do score, `wait_s` e `top_n` sem deploy.

### 8.3 Painel de saúde do despacho

Nova rota `app/ddt-admin/entregadores/saude/page.tsx` (ou subpágina de
`app/ddt-admin/entregadores/page.tsx`), funil por dia/cidade:

```
pedidos → tier alcançado → aceite → tempo até aceite (p50/p90)
       → cancelamento pós-aceite → km por entrega
```

Sem esse painel a calibração vira achismo.

---

## 9. KPIs (definir a meta antes de começar)

| KPI | Hoje (estimado) | Meta Fase 2 | Meta Fase 3 |
|---|---|---|---|
| % de aceite no tier 0 | ~0 (tier não existe) | ≥ 55% | ≥ 65% |
| Tempo pedido → aceite (p50) | ~15 min (TTL da oferta) | ≤ 3 min | ≤ 2 min |
| % de pedidos sem entregador | alto | ≤ 8% | ≤ 3% |
| Espera do entregador na loja (p50) | não medido | medido | ≤ 5 min |
| Km por entrega (com batching) | baseline | baseline | −12% |
| Cancelamento pós-aceite | não medido | medido | ≤ 3% |
| % de pedidos com peso/dimensão completos (§12.3) | ~0% | medido | ≥ 60% |
| % de pedidos barrados por teto econômico (§4.5) | n/a | medido | < 10% |

**Coletar o baseline na Fase 0**, antes de qualquer mudança de comportamento — senão não
há como provar ganho depois.

---

## 10. Riscos e mitigação

| Risco | Mitigação (já embutida no plano) |
|---|---|
| Bateria / GPS do entregador | `watchPosition` + envio a cada 20 s (não streaming); para ao ficar offline; degrada para endereço |
| LGPD | localização coletada só com `available` ou em rota; retenção 30–90 dias via `pg_cron` (padrão já existente no projeto); posição do entregador **nunca** exposta ao cliente |
| Custo de API de rotas | Fase 1 usa **estimativa** (haversine × circuidade); rota real só na Fase 3, com cache por origem/destino arredondado |
| Disputa/race no aceite | `UNIQUE(assignment_id, driver_id, tier)` + `SELECT ... FOR UPDATE` no accept |
| Ordem dos tiers quebrar | `dispatch_tick` idempotente; rodar 2× não duplica oferta |
| Cron sumir em restore | job registrado em `docs/ops/restore-cron-jobs-2026-11-04.sql` |
| Rollback de comportamento | `dispatch_settings.tier_ladder` reduzido a 1 tier `board` = comportamento atual |
| Migrations sem rollback | criar `*_rollback.sql` no padrão de `20261016_fulfillment_shipping_and_service_attendance_rollback.sql` |

---

## 11. Ordem de execução

```
1. Fase 0 (1 migration)        → mede baseline dos KPIs
2. Fase 1a (localização)       → infra + beacon + view de presença
3. Fase 1b (ETA nas ofertas)   → UI mostra minutos
4. Fase 2a (settings + offers) → tabelas criadas, nada muda ainda
5. Fase 2b (tick + cron)       → liga em modo "board only" (= comportamento atual, mas observável)
6. Fase 2c (tiers + recusa)    → ativa o ladder 0–4 em `board` + R$/km + decline/cooldown
                                  (oferta dirigida continua desligada — §4.4)
7. Fase 3                      → ready_time → calibração → batching → experimentos
```

**O passo 5 é o truque central:** o motor novo entra em **modo passivo** antes de mudar
comportamento. O sistema continua funcionando como hoje, mas `delivery_dispatch_events`
começa a encher com dados reais — e os tiers são calibrados com medição, não com chute.

### 11.1 Checklist de migrations

- [x] `20261123_1000_dispatch_fase0_radius_and_eligibility.sql`
- [x] `20261123_1100_driver_live_location.sql`
- [x] `20261123_1200_offer_eta_and_vehicle_compat.sql`
- [x] `20261123_1300_dispatch_settings_and_offers.sql`
- [x] `20261123_1400_dispatch_tick_and_cron.sql`
- [x] `20261123_1500_tier_accept_decline.sql`
- [x] `20261123_1600_ready_time_and_eta_calibration.sql`
- [x] `20261123_1700_batching_and_experiments.sql`
- [x] atualizar `docs/ops/restore-cron-jobs-2026-11-04.sql` com `dudit_dispatch_tick`
- [x] atualizar `lib/help-data.ts` (seção de entregadores) com as novas regras visíveis ao usuário

---

## 12. Decisões resolvidas em 2026-11-23

### 12.1 Densidade da rede → **board-first**

> _"quase não tem entregadores, seriam poucos mesmo por enquanto"_

**Consequência:** a Fase 2 entra com `mode='board'` em todos os tiers. O que muda em
relação a hoje é **raio por tempo** (ladder), **filtros rígidos**, **R$/km visível** e
**telemetria** — não a atribuição. `mode='directed'` fica no schema, desligado, para
quando o critério do §4.4 for atingido.

**Consequência secundária:** com pouca oferta, a prioridade de esforço migra para
**buscar entregador** (notificação de quem está offline, sugestão de taxa viável, ETA
honesto ao cliente) e não para otimizar score. Batching da Fase 3 também só rende quando
houver 2+ pedidos simultâneos na mesma região — medir antes de implementar.

### 12.2 Taxa fixa → **teto de raio derivado do preço**

> _"a taxa de entrega já vem calculada no pedido... eu não pago nada, a Dudit não paga nada"_

**Consequência:** bônus automático **não existe** no plano (§7.4). E o raio máximo deixa
de ser 20 km constante e passa a ser **`min(store_max_km, taxa / piso_rs_por_km)`**
(§4.5). Expandir raio sem subir ganho é matematicamente garantido de dar recusa.

Isso é a mudança mais importante das três, porque 20 km com taxa fixa é pior que não
oferecer: gasta o tempo do ladder, frustra o parceiro e ainda pode gerar aceite forçado
(entregador aceita sem ler e cancela depois — o que corrói o score dele e a operação).

**Trabalho novo que isso cria:** `dispatch_exhausted` precisa de estado próprio
(`no_economically_viable_courier`) com **sugestão de taxa**, e o ERP precisa de um botão
"autorizar bônus" para o caso em que o parceiro decide pagar (§7.4).

### 12.3 Dimensões → **gate suave com reconhecimento explícito**

> _"se não tiver dimensões salvas nos produtos não tem muito o que fazer... talvez um
> alerta quando for chamar entregador... ou continuar assim mesmo, mas com menos chance
> de aceitar"_

**Confirmado no código:** `products` já tem `weight_gross`, `weight_net`, `width`,
`height`, `length` (`migrations/add_product_fiscal_fields.sql`) — todas `DEFAULT 0`.
Então o bloqueio é de **preenchimento**, não de schema.

**Consequência:** nada de filtro rígido (bloquearia 100% dos pedidos hoje). Em vez disso:

1. No `requestDuditDeliveryAction`, calcular `dimensions_unknown` (soma de peso e volume
   dos itens; tudo zero → `true`)
2. Aviso no ERP: _"3 produtos sem peso/dimensão. O entregador verá este aviso e pode
   recusar."_ com **"Preencher agora"** (link para o produto) ou **"Continuar mesmo
   assim"** (checkbox obrigatório, registrado em `audit_logs`)
3. Card do entregador: badge _"⚠ Itens sem dimensão informada — confirme se cabe no seu
   veículo"` — ele decide, com informação
4. KPI de cobertura de dimensões no admin, subindo ao longo do tempo

A ideia original está correta e é exatamente o que o mercado faz na prática: transformar
dado faltante em **risco informado**, não em bloqueio invisível.

### 12.4 Ainda em aberto

1. **Notificação de entregador offline** na escalada: push, WhatsApp (já existe
   infraestrutura em `docs/infrastructure/cron-architecture.md`) ou só in-app?
2. **Sugestão de taxa** só informativa ou com botão que já atualiza o pedido?
3. **Batching** só faz sentido com ≥ 2 pedidos simultâneos por região — precisa medir a
   frequência real antes de investir nas 3–4 semanas da Fase 3.

---

## 13. Fontes

- iFood — [Como o iFood envia rotas para os entregadores](https://institucional.ifood.com.br/entregadores/distribuicao-de-rota-de-entrega/)
  (raio 5 km, veículo, ocupação, cooldown de 15 min)
- iFood — [Critérios de distribuição de pedidos](https://entregador.ifood.com.br/como-e-feita-a-distribuicao-de-pedidos-no-ifood-confira-aqui/)
  (5 critérios, incluindo Score)
- Uber — [DeepETA: How Uber Predicts Arrival Times Using Deep Learning](https://www.uber.com/blog/deepeta-how-uber-predicts-arrival-times/)
- Rabbit — [The Dispatch Problem: How Rabbit Matches Orders to Riders in Real Time](https://www.rabbitmart.com/blog/engineering-en/dispatch-matching-orders-to-riders/)
- Google Maps — [Isochrones API Overview](https://developers.google.com/maps/documentation/isochrones/overview)
- Circuidade — [Selected country circuity factors for road travel distance estimation](https://www.sciencedirect.com/science/article/pii/S0965856401000441)
  e [Haversine vs. routed distance](https://quilometragem.com/glossary/haversine-vs-routed)
- [Vehicle Routing Problem](https://en.wikipedia.org/wiki/Vehicle_routing_problem) — VRPTW, CVRP, VRPPD
- Deliveroo FRANK — cobertura pública de imprensa (redução divulgada de ~20% no tempo de entrega)

> **Nota de transparência:** não foi encontrada engenharia pública detalhada de 99Food,
> Keeta, aiqfome, Instacart ou Grubhub. O padrão descrito aqui é corroborado por iFood,
> Uber, DoorDash, Deliveroo e Rabbit — e é o mesmo problema em todas.
