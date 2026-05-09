"use server"

import { requireUser } from "@/lib/auth/authorization"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"
import { calculatePaymentAmounts } from "@/lib/payments/calculation"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"

export async function previewMarketplacePaymentAction(input: {
  partnerId: string
  paymentMethodId: string
  originalAmount: number
  installmentNumber?: number
}) {
  await requireUser()

  const supabase = await getSupabaseServerClient()
  
  const { data: method, error } = await supabase
    .from("payment_methods")
    .select("id, partner_id, type, payment_type, is_active, discount_percent, fee_percent, fee_fixed, priority, is_default, name, default_finance_account_id, max_installments, fee_bearer")
    .eq("id", input.paymentMethodId)
    .single()

  if (error || !method) {
    return { success: false as const, error: "Nenhum método de pagamento ativo foi encontrado para o método selecionado." }
  }
  
  const chosenType = toCanonicalPaymentType(method.type || method.payment_type)

  const adminSupabase = createAdminClient()
  const { data: fees } = await adminSupabase
    .from("payment_method_installment_fees")
    .select("installment_number, fee_percent")
    .eq("payment_method_id", method.id)

  const result = calculatePaymentAmounts({
    originalAmount: Math.max(0, Number(input.originalAmount || 0)),
    installmentNumber: Math.max(1, Number(input.installmentNumber || 1)),
    paymentMethod: {
      feePercent: Number(method.fee_percent || 0),
      feeFixed: Number(method.fee_fixed || 0),
      feeBearer: (method.fee_bearer || "merchant") as "merchant" | "customer",
      discountPercent: Number(method.discount_percent || 0),
      maxInstallments: Number(method.max_installments || 1),
      installmentFees: (fees || []).map((row: any) => ({
        installmentNumber: Number(row.installment_number || 1),
        feePercent: Number(row.fee_percent || 0),
      })),
    },
  })

  const maxInst = Math.max(1, Number(method.max_installments || 1))
  const installmentOptions = []
  
  if (chosenType === "credit_card" && maxInst > 1) {
    for (let i = 1; i <= maxInst; i++) {
      const calc = calculatePaymentAmounts({
        originalAmount: Math.max(0, Number(input.originalAmount || 0)),
        installmentNumber: i,
        paymentMethod: {
          feePercent: Number(method.fee_percent || 0),
          feeFixed: Number(method.fee_fixed || 0),
          feeBearer: (method.fee_bearer || "merchant") as "merchant" | "customer",
          discountPercent: Number(method.discount_percent || 0),
          maxInstallments: Number(method.max_installments || 1),
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
    methodId: String(method.id),
    methodName: String(method.name || ""),
    methodType: chosenType,
    maxInstallments: Math.max(1, Number(method.max_installments || 1)),
    installmentOptions,
    ...result,
  }
}
