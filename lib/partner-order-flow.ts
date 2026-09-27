import "server-only"
import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { normalizeBusinessInfo } from "@/lib/business-info"

export type OrderFlow = "whatsapp" | "dudit"

/**
 * Resolves the effective order_flow for a partner.
 *
 * Uses the explicit `order_flow` column on `partners` when set, otherwise
 * falls back to a mode-based default (quick/showcase → whatsapp, else dudit),
 * matching the resolution logic in `checkout-context.ts`.
 *
 * Cached via React `cache()` for request-level deduplication.
 */
export const getPartnerOrderFlow = cache(async (partnerId: string): Promise<OrderFlow> => {
  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("order_flow, business_info")
    .eq("id", partnerId)
    .maybeSingle()

  const explicitFlow = (partner as any)?.order_flow
  if (explicitFlow === "whatsapp" || explicitFlow === "dudit") return explicitFlow as OrderFlow

  const bizInfo = normalizeBusinessInfo((partner as any)?.business_info)
  const mode = bizInfo.mode
  return mode === "quick" || mode === "showcase" ? "whatsapp" : "dudit"
})

/**
 * Returns true when the partner has configured their order flow to go through
 * WhatsApp. When this is true, marketplace interactions (quotes, returns,
 * exchanges, orders) should be routed to WhatsApp regardless of the plan or
 * active resources, because the vendor has explicitly opted into WhatsApp flow.
 */
export const isPartnerWhatsappFlow = cache(async (partnerId: string): Promise<boolean> => {
  const flow = await getPartnerOrderFlow(partnerId)
  return flow === "whatsapp"
})
