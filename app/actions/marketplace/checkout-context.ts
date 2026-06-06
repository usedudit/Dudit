"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { aggregateCheckoutRequirements } from "@/lib/commerce/checkout-requirements"
import {
  buildCheckoutLineContextsFromResolved,
  mapDisplayLinesFromResolved,
  type MarketplaceCheckoutDisplayLine,
} from "@/lib/commerce/marketplace-checkout-lines"
import type { CheckoutRequirements } from "@/lib/commerce/checkout-requirements"
import { resolveCheckoutCartLines } from "@/lib/services/marketplace-cart-resolver"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerDeliveryConfigAction } from "@/app/actions/shared/delivery"

export type MarketplaceCheckoutDepositConfig = {
  available: boolean
  percent: number
  previewAmount: number
  manualOnly: boolean
  manualEnabled: boolean
  mpEnabled: boolean
}

export type MarketplaceCheckoutContextResult =
  | {
      success: true
      requirements: CheckoutRequirements
      lines: MarketplaceCheckoutDisplayLine[]
      productsSubtotal: number
      servicesSubtotal: number
      subscriptionsSubtotal: number
      deposit: MarketplaceCheckoutDepositConfig
      partner: {
        id: string
        slug: string | null
        address: Record<string, unknown> | null
        storeName: string | null
        store_name: string | null
        mpConnected: boolean
        phone: string | null
        pixKey: string | null
        pixKeyType: string | null
      }
      delivery: {
        planEnabled: boolean
        partnerEnabled: boolean
        pickupEnabled: boolean
      }
    }
  | { success: false; error: string }

export async function getMarketplaceCheckoutContextAction(input: {
  partnerId: string
  cartItemIds: string[]
  mpConnected?: boolean
}): Promise<MarketplaceCheckoutContextResult> {
  const user = await requireUser()
  if (!user) return { success: false, error: "Não autenticado" }

  if (!input.cartItemIds?.length) {
    return { success: false, error: "Nenhum item no checkout." }
  }

  const admin = getAdminClient()
  const resolved = await resolveCheckoutCartLines(admin, user.id, input.cartItemIds)
  if (!resolved.success) return { success: false, error: resolved.error }

  const lineContexts = buildCheckoutLineContextsFromResolved(resolved.lines)
  const requirements = aggregateCheckoutRequirements(lineContexts)
  const displayLines = mapDisplayLinesFromResolved(resolved.lines)

  let productsSubtotal = 0
  let servicesSubtotal = 0
  let subscriptionsSubtotal = 0
  let depositPreviewBase = 0

  for (const line of resolved.lines) {
    const total = line.unitPrice * line.quantity
    if (line.itemType === "product") productsSubtotal += total
    else if (line.itemType === "service_booking") {
      servicesSubtotal += total
      depositPreviewBase += line.fullPrice ?? line.unitPrice * line.quantity
    } else subscriptionsSubtotal += total
  }

  const [{ data: partnerRow }, plan, deliveryConfig, pixMethodResult] = await Promise.all([
    admin
      .from("partners")
      .select(
        "id, slug, store_name, service_deposit_enabled, service_deposit_percentage, service_deposit_manual_enabled, service_deposit_mp_enabled, mp_user_id, phone, addresses(id, street, number, neighborhood, city, state, zip_code)",
      )
      .eq("id", resolved.partnerId)
      .maybeSingle(),
    getPartnerPlan(resolved.partnerId),
    getPartnerDeliveryConfigAction(resolved.partnerId),
    admin
      .from("payment_methods")
      .select("pix_key, pix_key_type")
      .eq("partner_id", resolved.partnerId)
      .eq("type", "pix")
      .eq("is_active", true)
      .maybeSingle(),
  ])

  const depositAllowed = hasMinimumPlan(plan?.slug || "free", "crescer")
  const depositPercent = Number(partnerRow?.service_deposit_percentage || 50)
  const depositEnabled = Boolean(partnerRow?.service_deposit_enabled)
  const serviceDepositManualEnabled = Boolean(partnerRow?.service_deposit_manual_enabled)
  const serviceDepositMpEnabled = Boolean(partnerRow?.service_deposit_mp_enabled)
  const mpConnected = Boolean(input.mpConnected ?? partnerRow?.mp_user_id)

  const depositAvailable =
    requirements.hasServiceLines &&
    depositAllowed &&
    depositEnabled &&
    depositPreviewBase > 0 &&
    (serviceDepositManualEnabled || (serviceDepositMpEnabled && mpConnected))

  const previewAmount =
    depositAvailable ? Math.round(depositPreviewBase * (depositPercent / 100) * 100) / 100 : 0

  const addresses = partnerRow?.addresses
  const partnerAddress = Array.isArray(addresses) ? addresses[0] : addresses

  return {
    success: true,
    requirements,
    lines: displayLines,
    productsSubtotal,
    servicesSubtotal,
    subscriptionsSubtotal,
    deposit: {
      available: depositAvailable,
      percent: depositPercent,
      previewAmount,
      manualOnly: depositAvailable && (!mpConnected || !serviceDepositMpEnabled),
      manualEnabled: serviceDepositManualEnabled,
      mpEnabled: serviceDepositMpEnabled,
    },
    partner: {
      id: resolved.partnerId,
      slug: partnerRow?.slug || null,
      address: (partnerAddress as Record<string, unknown>) || null,
      storeName: partnerRow?.store_name || null,
      store_name: partnerRow?.store_name || null,
      mpConnected,
      phone: partnerRow?.phone || null,
      pixKey: pixMethodResult?.data?.pix_key || null,
      pixKeyType: pixMethodResult?.data?.pix_key_type || null,
    },
    delivery: {
      planEnabled: deliveryConfig.success ? deliveryConfig.capability.deliveryEnabled : false,
      partnerEnabled: deliveryConfig.success
        ? Boolean(deliveryConfig.settings.isDeliveryEnabled)
        : false,
      pickupEnabled: deliveryConfig.success
        ? Boolean(deliveryConfig.settings.isPickupEnabled ?? true)
        : true,
    },
  }
}
