"use server"

import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import {
  getCustomerDeliveryOtp,
  getOrderDeliveryOtpStatus,
  type DeliveryOtpResult,
} from "@/lib/services/delivery-otp.service"

/**
 * Returns the active OTP delivery confirmation code for the authenticated customer/buyer.
 * Strictly verifies ownership; never returns code to couriers or unauthorized users.
 */
export async function getCustomerOrderDeliveryOtpAction(params: {
  orderId: string
}): Promise<{ success: boolean; data?: DeliveryOtpResult; error?: string }> {
  try {
    const user = await requireUser()
    await requireRateLimit(RateLimitCategory.DELIVERY_OTP_REQUEST)

    const result = await getCustomerDeliveryOtp({
      orderId: params.orderId,
      userId: user.id,
    })

    return result
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Não foi possível carregar o código de entrega.",
    }
  }
}

/**
 * Safe status check for couriers and ERP to determine if a delivery code is required for an order.
 * Never returns the plain text or encrypted code.
 */
export async function checkOrderDeliveryOtpRequirementAction(params: {
  orderId: string
}): Promise<{
  success: boolean
  requiresOtp: boolean
  isConfirmed: boolean
  confirmedAt?: string | null
  isLocked?: boolean
  error?: string
}> {
  try {
    const status = await getOrderDeliveryOtpStatus(params.orderId)
    return {
      success: true,
      requiresOtp: status.requiresOtp,
      isConfirmed: status.isConfirmed,
      confirmedAt: status.confirmedAt,
      isLocked: status.isLocked,
    }
  } catch (err: any) {
    return {
      success: false,
      requiresOtp: false,
      isConfirmed: false,
      error: err?.message || "Erro ao consultar regras de entrega.",
    }
  }
}
