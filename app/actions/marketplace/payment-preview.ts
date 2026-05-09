"use server"

import { requireUser } from "@/lib/auth/authorization"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"
import { calculatePaymentAmounts } from "@/lib/payments/calculation"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

export async function previewMarketplacePaymentAction(input: {
  partnerId: string
  paymentMethod: string
  originalAmount: number
  installmentNumber?: number
}) {
  await requireUser()

  const supabase = await getSupabaseServerClient()
  const chosenType = toCanonicalPaymentType(input.paymentMethod)
  const bestMethod = await pickBestPaymentMethod(
    supabase as any,
    chosenType,
    input.partnerId,
    { preferDefault: true },
  )

  if (!bestMethod?.id) {
    return { success: false as const, error: "Nenhum método de pagamento ativo foi encontrado para o tipo selecionado." }
  }

  const { data: fees } = await supabase
    .from("payment_method_installment_fees")
    .select("installment_number, fee_percent")
    .eq("payment_method_id", bestMethod.id)

  const result = calculatePaymentAmounts({
    originalAmount: Math.max(0, Number(input.originalAmount || 0)),
    installmentNumber: Math.max(1, Number(input.installmentNumber || 1)),
    paymentMethod: {
      feePercent: Number(bestMethod.fee_percent || bestMethod.percentage_rate || 0),
      feeFixed: Number(bestMethod.fee_fixed || bestMethod.fixed_amount || 0),
      feeBearer: (bestMethod.fee_bearer || "merchant") as "merchant" | "customer",
      discountPercent: Number(bestMethod.discount_percent || 0),
      maxInstallments: Number(bestMethod.max_installments || 1),
      installmentFees: (fees || []).map((row: any) => ({
        installmentNumber: Number(row.installment_number || 1),
        feePercent: Number(row.fee_percent || 0),
      })),
    },
  })

  const maxInst = Math.max(1, Number(bestMethod.max_installments || 1))
  const installmentOptions = []
  
  if (chosenType === "credit_card" && maxInst > 1) {
    for (let i = 1; i <= maxInst; i++) {
      const calc = calculatePaymentAmounts({
        originalAmount: Math.max(0, Number(input.originalAmount || 0)),
        installmentNumber: i,
        paymentMethod: {
          feePercent: Number(bestMethod.fee_percent || bestMethod.percentage_rate || 0),
          feeFixed: Number(bestMethod.fee_fixed || bestMethod.fixed_amount || 0),
          feeBearer: (bestMethod.fee_bearer || "merchant") as "merchant" | "customer",
          discountPercent: Number(bestMethod.discount_percent || 0),
          maxInstallments: Number(bestMethod.max_installments || 1),
          installmentFees: (fees || []).map((row: any) => ({
            installmentNumber: Number(row.installment_number || 1),
            feePercent: Number(row.fee_percent || 0),
          })),
        },
      })
      installmentOptions.push({
        installments: i,
        installmentValue: calc.installmentAmounts[0] || 0,
        hasInterest: calc.interestAmount > 0,
        totalInterest: calc.interestAmount,
        finalAmount: calc.finalAmount
      })
    }
  }

  return {
    success: true as const,
    methodId: String(bestMethod.id),
    methodName: String(bestMethod.name || ""),
    methodType: chosenType,
    maxInstallments: Math.max(1, Number(bestMethod.max_installments || 1)),
    installmentOptions,
    ...result,
  }
}
