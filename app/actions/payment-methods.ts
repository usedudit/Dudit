"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { PaymentMethodSchema } from "@/lib/validation/schemas"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { calculatePaymentAmounts } from "@/lib/payments/calculation"
import { toCanonicalPaymentType, toLegacyPaymentType } from "@/lib/payments/payment-method"
import { decryptCPF, encryptCPF } from "@/lib/crypto"

type InstallmentFeeInput = { installmentNumber: number; feePercent: number }

type UpsertPaymentMethodInput = {
  partnerId: string
  name: string
  paymentType: string
  isActive?: boolean
  feePercent?: number | null
  feeFixed?: number | null
  receivingDays?: number | null
  discountPercent?: number | null
  feeBearer?: "merchant" | "customer"
  supportsInstallments?: boolean
  maxInstallments?: number | null
  installmentFees?: InstallmentFeeInput[]
  pixKeyType?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
  pixKey?: string | null
  usePartnerPixData?: boolean
}

async function resolvePixKeyFromPartner(
  partnerId: string,
  pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null | undefined,
) {
  if (!pixKeyType || pixKeyType === "random") return null
  const supabase = await getSupabaseServerClient()
  const { data: partner } = await supabase
    .from("partners")
    .select("cpf, cpf_encrypted, cnpj, email, phone")
    .eq("id", partnerId)
    .single()

  if (!partner) return null
  if (pixKeyType === "cpf") {
    if (partner.cpf_encrypted) {
      try {
        return await decryptCPF(partner.cpf_encrypted)
      } catch {
        return null
      }
    }
    return partner.cpf || null
  }
  if (pixKeyType === "cnpj") return partner.cnpj || null
  if (pixKeyType === "email") return partner.email || null
  return partner.phone || null
}

async function encryptPixKeyIfNeeded(
  pixKeyType: UpsertPaymentMethodInput["pixKeyType"],
  pixKey: string | null | undefined,
) {
  const normalized = String(pixKey || "").trim()
  if (!normalized) return null
  if (pixKeyType !== "cpf") return normalized
  try {
    return await encryptCPF(normalized)
  } catch {
    throw new Error("Erro ao criptografar CPF da chave PIX")
  }
}

async function decryptPixKeyIfNeeded(
  pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null | undefined,
  pixKey: string | null | undefined,
) {
  if (!pixKey) return null
  if (pixKeyType !== "cpf") return pixKey
  if (!String(pixKey).startsWith("v")) return pixKey
  try {
    return await decryptCPF(pixKey)
  } catch {
    return null
  }
}

function sanitizeInstallmentFees(input: InstallmentFeeInput[] | undefined, maxInstallments: number) {
  const rows = (input || []).map((row) => ({
    installmentNumber: Number(row.installmentNumber || 0),
    feePercent: Number(row.feePercent || 0),
  }))

  const dedupe = new Map<number, number>()
  for (const row of rows) {
    if (!Number.isInteger(row.installmentNumber) || row.installmentNumber < 1 || row.installmentNumber > maxInstallments) {
      throw new Error(`Parcela inválida: ${row.installmentNumber}`)
    }
    if (row.feePercent < 0 || row.feePercent > 100) {
      throw new Error(`Taxa inválida na parcela ${row.installmentNumber}`)
    }
    if (dedupe.has(row.installmentNumber)) {
      throw new Error(`Parcela ${row.installmentNumber} configurada em duplicidade`)
    }
    dedupe.set(row.installmentNumber, row.feePercent)
  }

  return Array.from(dedupe.entries()).map(([installment_number, fee_percent]) => ({ installment_number, fee_percent }))
}

export async function getPaymentMethodsAction(partnerId: string) {
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

  return {
    methods: (methods || []).map((method: any) => ({
      ...method,
      type: method.type || toCanonicalPaymentType(method.payment_type),
      fee_percent: method.fee_percent ?? method.percentage_rate ?? null,
      fee_fixed: method.fee_fixed ?? method.fixed_amount ?? null,
      fee_bearer: method.fee_bearer || "merchant",
      supports_installments: Boolean(method.supports_installments ?? ((method.max_installments || 1) > 1)),
    })),
  }
}

export async function getPaymentMethodDetailsAction(methodId: string) {
  await requireUser()
  const supabase = await getSupabaseServerClient()
  const { data: method } = await supabase.from("payment_methods").select("id, partner_id").eq("id", methodId).single()
  if (!method) return { error: "Método de pagamento não encontrado" }

  await requirePartnerAccessWithPermission(method.partner_id, "financial", "view")

  const [methodRes, feesRes] = await Promise.all([
    supabase.from("payment_methods").select("*").eq("id", methodId).single(),
    supabase
      .from("payment_method_installment_fees")
      .select("installment_number, fee_percent")
      .eq("payment_method_id", methodId)
      .order("installment_number", { ascending: true }),
  ])

  if (methodRes.error) return { error: methodRes.error.message }
  if (feesRes.error) return { error: feesRes.error.message }
  const decryptedPixKey = await decryptPixKeyIfNeeded(methodRes.data.pix_key_type, methodRes.data.pix_key)

  return {
    success: true,
    method: {
      ...methodRes.data,
      type: methodRes.data.type || toCanonicalPaymentType(methodRes.data.payment_type),
      pix_key: decryptedPixKey,
      installment_fees: feesRes.data || [],
    },
  }
}

export async function calculatePaymentMethodAmountsAction(input: {
  originalAmount: number
  paymentMethodId: string
  installmentNumber?: number
}) {
  await requireUser()
  const supabase = await getSupabaseServerClient()

  const { data: method } = await supabase
    .from("payment_methods")
    .select("id, partner_id, fee_percent, fee_fixed, fee_bearer")
    .eq("id", input.paymentMethodId)
    .single()

  if (!method) return { error: "Método de pagamento não encontrado" }
  await requirePartnerAccessWithPermission(method.partner_id, "financial", "view")

  const { data: fees } = await supabase
    .from("payment_method_installment_fees")
    .select("installment_number, fee_percent")
    .eq("payment_method_id", input.paymentMethodId)

  const result = calculatePaymentAmounts({
    originalAmount: input.originalAmount,
    installmentNumber: input.installmentNumber,
    paymentMethod: {
      feePercent: Number(method.fee_percent || 0),
      feeFixed: Number(method.fee_fixed || 0),
      feeBearer: (method.fee_bearer || "merchant") as "merchant" | "customer",
      installmentFees: (fees || []).map((row: any) => ({
        installmentNumber: row.installment_number,
        feePercent: Number(row.fee_percent || 0),
      })),
    },
  })

  return { success: true, ...result }
}

export async function createPaymentMethodAction(data: UpsertPaymentMethodInput) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  await requirePartnerAccessWithPermission(data.partnerId, "financial", "create")

  const canonicalType = toCanonicalPaymentType(data.paymentType)
  const maxInstallments = Math.max(1, Math.min(24, Number(data.maxInstallments || 1)))
  const supportsInstallments = canonicalType === "credit_card" && Boolean(data.supportsInstallments)
  const validatedInstallmentFees = sanitizeInstallmentFees(data.installmentFees, maxInstallments)
  const isPix = canonicalType === "pix"
  const resolvedPixKey = data.usePartnerPixData ? await resolvePixKeyFromPartner(data.partnerId, data.pixKeyType) : data.pixKey
  const persistedPixKey = isPix ? await encryptPixKeyIfNeeded(data.pixKeyType, resolvedPixKey || null) : null

  const validation = PaymentMethodSchema.safeParse({
    partnerId: data.partnerId,
    name: data.name,
    paymentType: canonicalType,
    pixKeyType: isPix ? data.pixKeyType : null,
    pixKey: isPix ? persistedPixKey : null,
    usePartnerPixData: isPix ? Boolean(data.usePartnerPixData) : false,
    isActive: true,
    feePercent: data.feePercent ?? 0,
    feeFixed: data.feeFixed ?? 0,
    receivingDays: data.receivingDays ?? 0,
    feeBearer: data.feeBearer || "merchant",
    supportsInstallments,
    maxInstallments,
    discountPercent: data.discountPercent,
    installmentFees: supportsInstallments ? (data.installmentFees || []) : [],
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
      payment_type: toLegacyPaymentType(canonicalType),
      type: canonicalType,
      is_active: true,
      max_installments: supportsInstallments ? maxInstallments : 1,
      fee_percent: data.feePercent ?? null,
      fee_fixed: data.feeFixed ?? null,
      percentage_rate: data.feePercent ?? 0,
      fixed_amount: data.feeFixed ?? 0,
      receiving_days: data.receivingDays ?? 0,
      discount_percent: data.discountPercent ?? 0,
      fee_bearer: data.feeBearer || "merchant",
      supports_installments: supportsInstallments,
      pix_key_type: isPix ? (data.pixKeyType || null) : null,
      pix_key: isPix ? persistedPixKey : null,
      use_partner_pix_data: isPix ? Boolean(data.usePartnerPixData) : false,
    })
    .select()
    .single()

  if (methodError) {
    return { error: methodError.message }
  }

  if (supportsInstallments && validatedInstallmentFees.length > 0) {
    const { error: feesError } = await supabase.from("payment_method_installment_fees").insert(
      validatedInstallmentFees.map((row) => ({ ...row, payment_method_id: method.id })),
    )
    if (feesError) return { error: feesError.message }
  }

  revalidatePath("/erp/settings")

  return { success: true, method }
}

export async function updatePaymentMethodAction(
  methodId: string,
  data: {
    name?: string
    isActive?: boolean
    paymentType?: string
    maxInstallments?: number | null
    feePercent?: number | null
    feeFixed?: number | null
    receivingDays?: number
    discountPercent?: number
    feeBearer?: "merchant" | "customer"
    supportsInstallments?: boolean
    installmentFees?: InstallmentFeeInput[]
    pixKeyType?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
    pixKey?: string | null
    usePartnerPixData?: boolean
  },
) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const supabase = await getSupabaseServerClient()
  const { data: method } = await supabase
    .from("payment_methods")
    .select("partner_id, type, payment_type")
    .eq("id", methodId)
    .single()

  if (!method) {
    return { error: "Método de pagamento não encontrado" }
  }

  await requirePartnerAccessWithPermission(method.partner_id, "financial", "edit")

  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.isActive !== undefined) updateData.is_active = data.isActive
  if (data.paymentType !== undefined) {
    const canonicalType = toCanonicalPaymentType(data.paymentType)
    updateData.type = canonicalType
    updateData.payment_type = toLegacyPaymentType(canonicalType)
    if (canonicalType !== "pix") {
      updateData.pix_key_type = null
      updateData.pix_key = null
      updateData.use_partner_pix_data = false
    }
    if (canonicalType !== "credit_card") {
      updateData.supports_installments = false
      updateData.max_installments = 1
    }
  }
  if (data.maxInstallments !== undefined) updateData.max_installments = Math.max(1, Math.min(24, Number(data.maxInstallments || 1)))
  if (data.feePercent !== undefined) {
    updateData.fee_percent = data.feePercent
    updateData.percentage_rate = data.feePercent ?? 0
  }
  if (data.feeFixed !== undefined) {
    updateData.fee_fixed = data.feeFixed
    updateData.fixed_amount = data.feeFixed ?? 0
  }
  if (data.receivingDays !== undefined) updateData.receiving_days = data.receivingDays
  if (data.discountPercent !== undefined) updateData.discount_percent = data.discountPercent
  if (data.feeBearer !== undefined) updateData.fee_bearer = data.feeBearer
  if (data.supportsInstallments !== undefined) updateData.supports_installments = data.supportsInstallments
  if (data.pixKeyType !== undefined) updateData.pix_key_type = data.pixKeyType
  if (data.usePartnerPixData !== undefined) updateData.use_partner_pix_data = data.usePartnerPixData
  const effectiveType = toCanonicalPaymentType(data.paymentType || method.type || method.payment_type)
  if (effectiveType === "pix" && data.usePartnerPixData) {
    const keyFromPartner = await resolvePixKeyFromPartner(method.partner_id, data.pixKeyType || null)
    updateData.pix_key = await encryptPixKeyIfNeeded(data.pixKeyType || null, keyFromPartner)
  } else if (data.pixKey !== undefined) {
    updateData.pix_key = await encryptPixKeyIfNeeded(data.pixKeyType || null, data.pixKey)
  }

  const { error: methodError } = await supabase
    .from("payment_methods")
    .update(updateData)
    .eq("id", methodId)
    .eq("partner_id", method.partner_id)

  if (methodError) {
    return { error: methodError.message }
  }

  if (data.supportsInstallments === false) {
    const { error: clearFeesError } = await supabase
      .from("payment_method_installment_fees")
      .delete()
      .eq("payment_method_id", methodId)
    if (clearFeesError) return { error: clearFeesError.message }
  } else if (Array.isArray(data.installmentFees)) {
    const currentMax = Number(updateData.max_installments || data.maxInstallments || 24)
    const validatedInstallmentFees = sanitizeInstallmentFees(data.installmentFees, currentMax)
    const { error: deleteError } = await supabase
      .from("payment_method_installment_fees")
      .delete()
      .eq("payment_method_id", methodId)
    if (deleteError) return { error: deleteError.message }

    if (validatedInstallmentFees.length > 0) {
      const { error: insertError } = await supabase.from("payment_method_installment_fees").insert(
        validatedInstallmentFees.map((row) => ({ ...row, payment_method_id: methodId })),
      )
      if (insertError) return { error: insertError.message }
    }
  }

  revalidatePath("/erp/settings")

  return { success: true }
}

export async function deletePaymentMethodAction(methodId: string) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

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
