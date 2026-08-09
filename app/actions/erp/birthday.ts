"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requireCustomerOwnership, ForbiddenError } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { createNotification, resolveCustomerUserId } from "@/lib/services/notification.service"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireAuthorizedCustomerRecord } from "@/lib/services/authorized-customer-access"

export async function getBirthdayCouponCodeAction(partnerId: string): Promise<string> {
  await requireUser()
  const context = await getCurrentPartnerContext()
  if (!context?.partnerId || context.partnerId !== partnerId) {
    throw new ForbiddenError("O parceiro informado não corresponde ao contexto ativo")
  }
  await requirePermission(context.partnerId, "coupons", "view")

  const supabase = await getSupabaseServerClient()

  // Find active birthday coupons for this partner
  const { data: coupons } = await supabase
    .from("coupons")
    .select("code")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .ilike("code", "ANIVER%")
    .order("created_at", { ascending: false })
    .limit(1)

  if (coupons && coupons.length > 0) {
    return coupons[0].code
  }

  return "ANIVERSARIO10"
}

export async function canCustomerReceiveNotificationAction(
  customerId: string,
): Promise<{ canReceive: boolean; error?: string }> {
  try {
    await requireUser()
    await requireCustomerOwnership(customerId)
    const userId = await resolveCustomerUserId({ customerId })
    return { canReceive: !!userId }
  } catch {
    return { canReceive: false, error: "Erro ao verificar permissão" }
  }
}

export async function sendBirthdayNotificationAction(
  customerId: string,
  partnerId: string,
): Promise<{ success: boolean; error?: string; notified?: boolean }> {
  const customerAccess = await requireAuthorizedCustomerRecord(customerId, "edit")
  const canonicalPartnerId = customerAccess.partnerId
  const supabase = customerAccess.admin

  // Fetch store name
  const { data: store } = await supabase
    .from("stores")
    .select("name")
    .eq("partner_id", canonicalPartnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  const partnerName = store?.name || "Nosso parceiro"

  // Fetch customer details
  const { data: customer } = await supabase
    .from("customers")
    .select("name")
    .eq("id", customerId)
    .maybeSingle()

  if (!customer) {
    return { success: false, error: "Cliente não encontrado" }
  }

  // Get active coupon code
  const couponCode = await getBirthdayCouponCodeAction(canonicalPartnerId)

  // Resolve customer user_id
  const customerUserId = await resolveCustomerUserId({ customerId })

  if (!customerUserId) {
    return {
      success: false,
      error: "O cliente não possui um usuário do marketplace vinculado para receber notificações in-app.",
    }
  }

  const currentYear = new Date().getFullYear()
  const idempotencyKey = `birthday:${customerId}:${currentYear}`

  // Create notification
  const { notification, created } = await createNotification({
    userId: customerUserId,
    type: "admin_announcement", // admin_announcement is supported by the CHECK constraint
    title: "🎉 Feliz aniversário!",
    message: `${partnerName} preparou um presente para você! Use o cupom ${couponCode} especial de aniversário.`,
    data: {
      url: "/cupons",
      audience: "customer",
    },
    idempotencyKey,
  })

  if (!notification) {
    return { success: false, error: "Falha ao criar notificação no banco de dados." }
  }

  return { success: true, notified: created }
}
