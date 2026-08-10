"use server"

import { requireUser } from "@/lib/auth/authorization"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"
import { computePaymentLine, type PaymentMethodFeeConfig } from "@/lib/payments/financial-engine"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { createAdminClient } from "@/lib/supabase/server"

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const toSafeMoney = (value: number) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, round2(n))
}

function distributeInstallments(total: number, installments: number): number[] {
  const count = Math.max(1, Math.floor(Number(installments || 1)))
  const cents = Math.round(toSafeMoney(total) * 100)
  const base = Math.floor(cents / count)
  const remainder = cents - base * count
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    out.push((base + (i < remainder ? 1 : 0)) / 100)
  }
  return out
}

type MarketplacePreviewResult = {
  finalAmount: number
  interestAmount: number
  installmentCostAmount: number
  feeAmount: number
  fixedFeeAmount: number
  paymentMethodDiscountAmount: number
  amountBeforeInterest: number
  amountBeforeFee: number
  installmentNumber: number
  installmentAmounts: number[]
  appliedDiscountPercent: number
  appliedFeePercent: number
  appliedInterestPercent: number
}

function marketplaceCalculateAmounts(input: {
  originalAmount: number
  installmentNumber?: number
  paymentMethod: PaymentMethodFeeConfig
}): MarketplacePreviewResult {
  const originalAmount = toSafeMoney(input.originalAmount)
  const installmentNumber = Math.max(1, Number(input.installmentNumber || 1))
  const maxInstallments = Math.max(1, Number(input.paymentMethod.maxInstallments || 24))
  const clampedInstallments = Math.min(installmentNumber, maxInstallments)
  const pm = input.paymentMethod
  const feePercent = Math.max(0, Number(pm.feePercent || 0))
  const feeFixed = Math.max(0, Number(pm.feeFixed || 0))
  const discountPercent = Math.min(100, Math.max(0, Number(pm.discountPercent || 0)))
  const fixedInterestPercent = Math.max(0, Number(pm.fixedInterestPercent || 0))

  const installmentFeePercent = (pm.installmentFees || []).find(
    (entry: { installmentNumber: number; feePercent: number }) => Number(entry.installmentNumber) === clampedInstallments,
  )?.feePercent || 0

  let currentTotal = originalAmount

  // Step 1: discount (reduces the amount)
  const discountCalc = computePaymentLine({
    amountReceived: currentTotal,
    paymentMethod: {
      discountPercent,
      feePercent: 0,
      feeFixed: 0,
      feeBearer: "merchant",
      maxInstallments,
      installmentFees: [],
    },
  })
  const paymentMethodDiscountAmount = discountCalc.adjustmentType === "discount" ? discountCalc.adjustmentAmount : 0
  currentTotal = toSafeMoney(currentTotal - paymentMethodDiscountAmount)
  const amountBeforeInterest = currentTotal

  // Step 2: installment interest (marketplace-specific chaining)
  // Juros fixos seguem feeBearer; o custo de parcelamento segue installmentFeeBearer.
  const totalInterestPercent = Math.max(0, fixedInterestPercent + Number(installmentFeePercent || 0))
  const interestAmount = round2(currentTotal * (totalInterestPercent / 100))
  const installmentFeeBearer = (pm.installmentFeeBearer || "merchant") as "merchant" | "customer"
  const fixedInterestAmount = round2(currentTotal * (fixedInterestPercent / 100))
  const installmentCostAmount = round2(currentTotal * (installmentFeePercent / 100))
  if (pm.feeBearer === "customer") {
    currentTotal = toSafeMoney(currentTotal + fixedInterestAmount)
  }
  if (installmentFeeBearer === "customer") {
    currentTotal = toSafeMoney(currentTotal + installmentCostAmount)
  }
  const amountBeforeFee = currentTotal

  // Step 3: administrative/fixed fee over the running total after interest.
  const percentageFeeAmount = round2((currentTotal * feePercent) / 100)
  const fixedFeeAmount = feeFixed
  const totalFeeAmount = round2(percentageFeeAmount + fixedFeeAmount)
  const finalAmount = pm.feeBearer === "customer"
    ? toSafeMoney(currentTotal + totalFeeAmount)
    : currentTotal

  return {
    finalAmount,
    interestAmount,
    installmentCostAmount,
    feeAmount: percentageFeeAmount,
    fixedFeeAmount,
    paymentMethodDiscountAmount,
    amountBeforeInterest,
    amountBeforeFee,
    installmentNumber: clampedInstallments,
    installmentAmounts: distributeInstallments(finalAmount, clampedInstallments),
    appliedDiscountPercent: discountPercent,
    appliedFeePercent: feePercent,
    appliedInterestPercent: totalInterestPercent,
  }
}

export async function previewMarketplacePaymentAction(input: {
  partnerId: string
  paymentMethodId: string
  originalAmount: number
  installmentNumber?: number
}) {
  await requireUser()

  const adminSupabase = createAdminClient()
  
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.paymentMethodId)
  
  let method: any = null

  if (isUuid) {
    const { data, error } = await adminSupabase
      .from("payment_methods")
      .select("id, partner_id, type, payment_type, is_active, discount_percent, fee_percent, fee_fixed, priority, is_default, name, default_finance_account_id, max_installments, fee_bearer, installment_fee_bearer")
      .eq("id", input.paymentMethodId)
      .eq("partner_id", input.partnerId)
      .eq("is_active", true)
      .single()
  
    if (error || !data) {
      return { success: false as const, error: "Nenhum método de pagamento ativo foi encontrado para o método selecionado." }
    }
    method = data
  } else {
    const { pickBestPaymentMethod } = await import("@/lib/services/payment-method.service")
    const best = await pickBestPaymentMethod(adminSupabase as any, input.paymentMethodId as any, input.partnerId, { preferDefault: true })
    if (!best) {
      return { success: false as const, error: "Nenhum método de pagamento ativo foi encontrado para o método selecionado." }
    }
    method = best
  }
  
  const chosenType = toCanonicalPaymentType(method.type || method.payment_type)

  const { data: fees } = await adminSupabase
    .from("payment_method_installment_fees")
    .select("installment_number, fee_percent")
    .eq("payment_method_id", method.id)

  const feeConfig: PaymentMethodFeeConfig = {
    feePercent: Number(method.fee_percent || 0),
    feeFixed: Number(method.fee_fixed || 0),
    feeBearer: (method.fee_bearer || "merchant") as "merchant" | "customer",
    installmentFeeBearer: (method.installment_fee_bearer || "merchant") as "merchant" | "customer",
    discountPercent: Number(method.discount_percent || 0),
    maxInstallments: Number(method.max_installments || 1),
    installmentFees: (fees || []).map((row: any) => ({
      installmentNumber: Number(row.installment_number || 1),
      feePercent: Number(row.fee_percent || 0),
    })),
  }

  const result = marketplaceCalculateAmounts({
    originalAmount: Math.max(0, Number(input.originalAmount || 0)),
    installmentNumber: Math.max(1, Number(input.installmentNumber || 1)),
    paymentMethod: feeConfig,
  })

  const maxInst = Math.max(1, Number(method.max_installments || 1))
  const installmentOptions = []
  
  if (chosenType === "credit_card" && maxInst > 1) {
    for (let i = 1; i <= maxInst; i++) {
      const calc = marketplaceCalculateAmounts({
        originalAmount: Math.max(0, Number(input.originalAmount || 0)),
        installmentNumber: i,
        paymentMethod: feeConfig,
      })
      installmentOptions.push({
        installments: i,
        installmentValue: calc.installmentAmounts[0] || 0,
        hasInterest: calc.interestAmount > 0 && (feeConfig.feeBearer === "customer" || feeConfig.installmentFeeBearer === "customer"),
        totalInterest: calc.interestAmount,
        totalFee: calc.feeAmount,
        fixedFee: calc.fixedFeeAmount,
        feeBearer: feeConfig.feeBearer,
        installmentFeeBearer: feeConfig.installmentFeeBearer,
        finalAmount: calc.finalAmount,
      })
    }
  }

  return {
    success: true as const,
    methodId: String(method.id),
    methodName: String(method.name || ""),
    methodType: chosenType,
    maxInstallments: Math.max(1, Number(method.max_installments || 1)),
    feeBearer: feeConfig.feeBearer,
    installmentFeeBearer: feeConfig.installmentFeeBearer,
    installmentOptions,
    ...result,
  }
}
