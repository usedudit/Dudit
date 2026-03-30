"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { PaymentMethodSchema } from "@/lib/validation/schemas"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export async function getPaymentMethodsAction(partnerId: string) {
  const user = await requireUser()

  await requirePartnerAccessWithPermission(partnerId, "financial", "view")

  const supabase = await getSupabaseServerClient()

  const { data: methods, error } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { methods: methods || [] }
}

export async function createPaymentMethodAction(data: {
  partnerId: string
  name: string
  paymentType: string
  cardBrand?: string | null
  maxInstallments?: number | null
  feeType: string
  percentageRate: number
  fixedAmount: number
  receivingDays: number
  discountPercent: number
}) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()

  await requirePartnerAccessWithPermission(data.partnerId, "financial", "create")

  const validation = PaymentMethodSchema.safeParse({
    partnerId: data.partnerId,
    name: data.name,
    paymentType: data.paymentType,
    cardBrand: data.cardBrand,
    isActive: true,
    feeType: data.feeType,
    percentageRate: data.percentageRate,
    fixedAmount: data.fixedAmount,
    receivingDays: data.receivingDays,
    maxInstallments: data.maxInstallments,
    discountPercent: data.discountPercent,
  })

  if (!validation.success) {
    const errorDetails = validation.error.issues.map(i => i.message).join(", ")
    return { error: errorDetails }
  }

  const supabase = await getSupabaseServerClient()

  const { data: method, error: methodError } = await supabase
    .from("payment_methods")
    .insert({
      partner_id: data.partnerId,
      name: data.name,
      payment_type: data.paymentType,
      card_brand: data.cardBrand,
      is_active: true,
      max_installments: data.maxInstallments,
      fee_type: data.feeType,
      percentage_rate: data.percentageRate,
      fixed_amount: data.fixedAmount,
      receiving_days: data.receivingDays,
      discount_percent: data.discountPercent,
    })
    .select()
    .single()

  if (methodError) {
    return { error: methodError.message }
  }

  revalidatePath("/erp/settings")

  return { success: true, method }
}

export async function updatePaymentMethodAction(
  methodId: string,
  data: {
    name?: string
    isActive?: boolean
    cardBrand?: string | null
    maxInstallments?: number | null
    feeType?: string
    percentageRate?: number
    fixedAmount?: number
    receivingDays?: number
    discountPercent?: number
  },
) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()

  const supabase = await getSupabaseServerClient()
  const { data: method } = await supabase
    .from("payment_methods")
    .select("partner_id")
    .eq("id", methodId)
    .single()

  if (!method) {
    return { error: "Método de pagamento não encontrado" }
  }

  await requirePartnerAccessWithPermission(method.partner_id, "financial", "edit")

  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.isActive !== undefined) updateData.is_active = data.isActive
  if (data.cardBrand !== undefined) updateData.card_brand = data.cardBrand
  if (data.maxInstallments !== undefined) updateData.max_installments = data.maxInstallments
  if (data.feeType !== undefined) updateData.fee_type = data.feeType
  if (data.percentageRate !== undefined) updateData.percentage_rate = data.percentageRate
  if (data.fixedAmount !== undefined) updateData.fixed_amount = data.fixedAmount
  if (data.receivingDays !== undefined) updateData.receiving_days = data.receivingDays
  if (data.discountPercent !== undefined) updateData.discount_percent = data.discountPercent

  const { error: methodError } = await supabase
    .from("payment_methods")
    .update(updateData)
    .eq("id", methodId)
    .eq("partner_id", method.partner_id)

  if (methodError) {
    return { error: methodError.message }
  }

  revalidatePath("/erp/settings")

  return { success: true }
}

export async function deletePaymentMethodAction(methodId: string) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()

  const supabase = await getSupabaseServerClient()
  const { data: method } = await supabase
    .from("payment_methods")
    .select("partner_id")
    .eq("id", methodId)
    .single()

  if (!method) {
    return { error: "Método de pagamento não encontrado" }
  }

  await requirePartnerAccessWithPermission(method.partner_id, "financial", "delete")

  const { error } = await supabase.from("payment_methods").delete().eq("id", methodId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/settings")

  return { success: true }
}
