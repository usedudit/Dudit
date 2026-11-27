"use server"

import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import {
  getCustomerDeliveryOtp,
  getOrderDeliveryOtpStatus,
  type DeliveryOtpResult,
} from "@/lib/services/delivery-otp.service"
import { getAdminClient } from "@/lib/supabase/admin"

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

/**
 * Checks whether any order linked to a delivery requires an unconfirmed OTP code.
 */
export async function checkDeliveryOtpRequirementAction(params: {
  deliveryId: string
}): Promise<{
  success: boolean
  requiresOtp: boolean
  otpOrderCount: number
  orderNumber?: string | null
  customerName?: string | null
  error?: string
}> {
  try {
    await requireUser()
    const admin = getAdminClient()
    const { data: links, error } = await admin
      .from("delivery_orders")
      .select("order_id, orders(id, order_number, customer_name)")
      .eq("delivery_id", params.deliveryId)

    if (error || !links || links.length === 0) {
      return { success: true, requiresOtp: false, otpOrderCount: 0 }
    }

    const checks = await Promise.all(
      links.map(async (link: any) => {
        const orderId = String(link?.order_id || "")
        if (!orderId) return null
        const status = await getOrderDeliveryOtpStatus(orderId)
        if (status.requiresOtp && !status.isConfirmed) {
          const order = Array.isArray(link.orders) ? link.orders[0] : link.orders
          return {
            orderId,
            orderNumber: order?.order_number || null,
            customerName: order?.customer_name || null,
          }
        }
        return null
      }),
    )

    const pendingOtpOrders = checks.filter(Boolean) as Array<{
      orderId: string
      orderNumber: string | null
      customerName: string | null
    }>

    return {
      success: true,
      requiresOtp: pendingOtpOrders.length > 0,
      otpOrderCount: pendingOtpOrders.length,
      orderNumber: pendingOtpOrders[0]?.orderNumber || null,
      customerName: pendingOtpOrders[0]?.customerName || null,
    }
  } catch (err: any) {
    return {
      success: false,
      requiresOtp: false,
      otpOrderCount: 0,
      error: err?.message || "Erro ao consultar regras de entrega.",
    }
  }
}
