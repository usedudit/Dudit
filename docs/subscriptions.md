# Dudit - Sistema de Assinaturas e Planos

Este documento detalha o funcionamento técnico do sistema de assinaturas SaaS da Dudit, incluindo a estrutura de planos, limites de uso e integração com o Mercado Pago.

## Estrutura de Planos

Atualmente existem 4 níveis de planos configurados na tabela `public.plans`:

1.  **Começar (Grátis)**: Ideal para validação inicial.
2.  **Vender**: Para negócios em crescimento.
3.  **Crescer**: Para empresas estabelecidas que precisam de automação completa.
4.  **Profissional**: Todas as funcionalidades liberadas e limites ilimitados em pedidos.

### Limites e Contadores

Os limites são armazenados em `plans.limits_json` e as contagens atuais em `usage_counters`.

| Limite (limits_json) | Contador (usage_counters) | Reset Mensal? |
| :--- | :--- | :--- |
| `products` | `products_count` | Não |
| `images_per_product` | N/A (validado no ato) | Não |
| `total_images` | `images_count` | Não |
| `users` | `users_count` | Não |
| `orders_per_month` | `orders_month_count` | Sim |
| `appointments_per_month` | `appointments_month_count` | Sim |
| `quotes_per_month` | `quotes_month_count` | Sim |

## Fiscalização de Limites (Enforcement)

A fiscalização ocorre no **Server-Side** através do `subscription.service.ts`.

### Como verificar um limite:
```typescript
import { checkLimit } from "@/lib/services/subscription.service"

const res = await checkLimit(partnerId, "orders_per_month")
if (!res.allowed) {
  return { error: res.message }
}
```

### Como incrementar um contador:
```typescript
import { increment_usage_counter } from "@/lib/services/subscription.service"

await increment_usage_counter(partnerId, "orders_month_count")
```

## Feature Flags

Funcionalidades específicas são bloqueadas via `canUseFeature(partnerId, featureName)`.

**Principais Flags:**
- `supplier_management`: Cadastro de fornecedores.
- `product_variants`: Uso de variações/grades de produtos.
- `cash_flow`: Acesso ao fluxo de caixa.
- `dre_report`: Relatórios de DRE.

## Reset de Mensalidade

O reset dos contadores mensais (pedidos, agendamentos, orçamentos) é feito via função SQL `reset_monthly_counters()`, que deve ser chamada periodicamente (ex: via pg_cron ou trigger de login).

## Integração Mercado Pago

A integração usa as credenciais de plataforma (`MP_SUBSCRIPTION_CLIENT_ID` e `MP_SUBSCRIPTION_CLIENT_SECRET`).

- **Webhooks**: Recebidos em `/api/mercadopago/webhook/subscription`.
- **PreApproval**: Usado para assinaturas recorrentes.
