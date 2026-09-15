/**
 * Pure, side-effect-free helper for building deposit checkout metadata.
 *
 * Extracted into its own module so client components can import it without
 * transitively pulling in server-only dependencies (Redis, Supabase server
 * client, etc.) from `marketplace-checkout-amounts.ts`.
 */
export function buildDepositCheckoutMeta(params: {
  payDepositOnly: boolean
  depositPercent: number
  serviceDepositAmount: number
  fullOrderTotal: number
  initialChargeAmount: number
  paymentProvider?: string
}) {
  const remainingAfterDeposit = Math.max(0, params.fullOrderTotal - params.initialChargeAmount)
  return {
    usesDeposit: params.payDepositOnly,
    payDepositOnly: params.payDepositOnly,
    depositPercent: params.depositPercent,
    depositAmount: params.serviceDepositAmount,
    serviceDepositAmount: params.serviceDepositAmount,
    fullOrderTotal: params.fullOrderTotal,
    initialChargeAmount: params.initialChargeAmount,
    remainingAfterDeposit,
    remainingBalance: remainingAfterDeposit,
    depositStatus: "pending" as const,
    paymentProvider: params.paymentProvider || "Mercado Pago",
    mpInitialPayment: true,
  }
}
