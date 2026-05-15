"use server"

import { requireUser } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { toCanonicalPaymentType, type CanonicalPaymentType } from "@/lib/payments/payment-method"

export interface StorefrontPaymentMethod {
  id: string
  type: CanonicalPaymentType
  discountPercent: number
  feePercent: number
  feeFixed: number
  maxInstallments: number
  supportsInstallments: boolean
  cardBrand: string | null
}

/**
 * Busca os métodos de pagamento ativos do vendedor para exibir na vitrine/checkout.
 * Agrupa por tipo canônico e retorna o "melhor" de cada tipo (maior desconto, menor taxa).
 * Não requer permissão de partner - qualquer usuário logado pode consultar (é dado público da vitrine).
 */
export async function getStorefrontPaymentMethodsAction(partnerId: string) {
  await requireUser()

  const supabase = await getSupabaseServerClient()

  const { data: methods, error } = await supabase
    .from("payment_methods")
    .select(
      "id, type, payment_type, is_active, is_default, " +
      "discount_percent, fee_percent, fee_fixed, " +
      "max_installments, supports_installments, priority, card_brand"
    )
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("priority", { ascending: false })
    .order("discount_percent", { ascending: false })

  if (error) {
    return { success: false as const, error: error.message, methods: [] as StorefrontPaymentMethod[] }
  }

  if (!methods || methods.length === 0) {
    return { success: true as const, methods: [] as StorefrontPaymentMethod[] }
  }

  // Agrupa por tipo canônico e pega o melhor de cada tipo (o primeiro, já ordenado por prioridade/desconto)
  const bestByType = new Map<CanonicalPaymentType, StorefrontPaymentMethod>()

  for (const m of methods) {
    const canonicalType = toCanonicalPaymentType(m.type || m.payment_type)

    if (bestByType.has(canonicalType)) continue // já temos o melhor desse tipo

    bestByType.set(canonicalType, {
      id: String(m.id),
      type: canonicalType,
      discountPercent: Math.max(0, Number(m.discount_percent || 0)),
      feePercent: Math.max(0, Number(m.fee_percent || 0)),
      feeFixed: Math.max(0, Number(m.fee_fixed || 0)),
      maxInstallments: Math.max(1, Number(m.max_installments || 1)),
      supportsInstallments: Boolean(m.supports_installments ?? ((m.max_installments || 1) > 1)),
      cardBrand: m.card_brand || null,
    })
  }

  // Ordena: pix primeiro (geralmente tem desconto), depois credit_card, debit_card, cash, other
  const typeOrder: CanonicalPaymentType[] = ["pix", "credit_card", "debit_card", "cash", "other"]
  const sorted = typeOrder
    .filter((t) => bestByType.has(t))
    .map((t) => bestByType.get(t)!)

  return { success: true as const, methods: sorted }
}
