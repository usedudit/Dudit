import type { RecurringShippingMode, RecurringShippingSource } from "@/lib/types/recurring"

export type ResolveSubscriptionShippingInput = {
  /** delivery_type da assinatura/checkout */
  deliveryType?: string | null
  /** shipping_mode configurado no plano */
  shippingMode?: RecurringShippingMode | null
  /** usado somente quando shippingMode = "flat" */
  shippingFlatAmount?: number | null
  /** orders.delivery_fee resolvido no momento do cadastro */
  deliveryFee?: number | null
  /** orders.delivery_breakdown resolvido no momento do cadastro */
  deliveryBreakdown?: Record<string, unknown> | null
}

export type ResolvedSubscriptionShipping = {
  /** valor congelado, replicado em todos os ciclos */
  amount: number
  source: RecurringShippingSource
  /** servico da transportadora quando a cotacao veio de carrier */
  carrierServiceId: string | null
  /**
   * false quando o modo "quote" foi escolhido mas nao ha cotação valida para
   * o endereco. O cadastro deve ser bloqueado nesse caso.
   */
  resolved: boolean
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Resolve o frete de uma assinatura UMA unica vez, no cadastro.
 *
 * O valor retornado e gravado em recurring_subscriptions.shipping_amount e
 * usado identico em todos os ciclos - a cobranca nunca re-cota.
 *
 * Regras:
 *   pickup    -> 0
 *   included  -> 0 (frete embutido no preco dos itens)
 *   flat      -> shipping_flat_amount do plano
 *   quote     -> o valor ja cotado no checkout, com dois ajustes:
 *                  1. cupom de frete gratis e one-off, entao congela o
 *                     originalFee (o valor real), nao o 0 do ciclo 1;
 *                  2. threshold e frete por conta do lojista nao sao one-off,
 *                     entao congela o 0 que ja foi calculado.
 */
export function resolveSubscriptionShipping(
  input: ResolveSubscriptionShippingInput,
): ResolvedSubscriptionShipping {
  const deliveryType = input.deliveryType || "pickup"
  const shippingMode: RecurringShippingMode = input.shippingMode || "included"

  if (deliveryType !== "delivery") {
    return { amount: 0, source: "pickup", carrierServiceId: null, resolved: true }
  }

  if (shippingMode === "included") {
    return { amount: 0, source: "included", carrierServiceId: null, resolved: true }
  }

  if (shippingMode === "flat") {
    return {
      amount: toNumber(input.shippingFlatAmount),
      source: "flat",
      carrierServiceId: null,
      resolved: true,
    }
  }

  // shippingMode === "quote"
  const breakdown = input.deliveryBreakdown || null
  const quoted = input.deliveryFee != null || breakdown != null

  if (!quoted) {
    return { amount: 0, source: "quote_own", carrierServiceId: null, resolved: false }
  }

  const isFreeByCoupon = breakdown?.freeDeliveryReason === "coupon"
  const amount = isFreeByCoupon
    ? toNumber(breakdown?.originalFee)
    : toNumber(input.deliveryFee)

  const fromCarrier = String(breakdown?.source || "") === "superfrete"
  const rawServiceId = breakdown?.serviceId

  return {
    amount,
    source: fromCarrier ? "quote_carrier" : "quote_own",
    carrierServiceId: rawServiceId != null ? String(rawServiceId) : null,
    resolved: true,
  }
}
