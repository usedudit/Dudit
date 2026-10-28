import "server-only"
import { getAdminClient } from "@/lib/supabase/admin"

type OrderBuyerRefs = {
  buyer_id?: string | null
  customer_id?: string | null
  partner_id?: string | null
}

/**
 * Orders created by the seller inside the ERP (PDV, WhatsApp, manual) store the
 * linked customer id (`customers.id`) in `buyer_id`/`customer_id` instead of the
 * marketplace auth user id. When that customer is linked to a marketplace
 * account, the buyer must be able to manage the order exactly like an order
 * placed through the marketplace.
 *
 * Returns true when the authenticated user is the buyer of the order, either
 * directly (`buyer_id = auth user`) or through a linked ERP customer.
 */
export async function userOwnsBuyerOrder(
  order: OrderBuyerRefs | null | undefined,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!order || !userId) return false
  if (order.buyer_id && order.buyer_id === userId) return true

  const candidateIds = Array.from(
    new Set([order.buyer_id, order.customer_id].filter(Boolean) as string[]),
  )
  if (candidateIds.length === 0) return false

  try {
    const admin = getAdminClient()
    let query = admin
      .from("customers")
      .select("id")
      .or(`user_id.eq.${userId},marketplace_user_id.eq.${userId}`)

    if (order.partner_id) {
      query = query.eq("partner_id", order.partner_id)
    }

    const { data, error } = await query.limit(100)
    if (error) {
      console.error("[ORDER_ACCESS] failed to resolve linked erp customers", {
        userId,
        error: error.message,
      })
      return false
    }

    return (data || []).some((customer: any) => candidateIds.includes(String(customer?.id)))
  } catch (error: any) {
    console.error("[ORDER_ACCESS] unexpected error resolving linked erp customers", {
      userId,
      error: error?.message,
    })
    return false
  }
}

/**
 * Resolves the `customers.id` that represents the buyer for an order, even when
 * the order carries the marketplace auth user id in `buyer_id`. Returns null
 * when no linked customer exists for the partner.
 */
export async function resolveBuyerCustomerId(
  order: OrderBuyerRefs | null | undefined,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!order || !userId) return null

  try {
    const admin = getAdminClient()
    const candidateIds = Array.from(
      new Set([order.customer_id, order.buyer_id].filter(Boolean) as string[]),
    )

    if (candidateIds.length > 0) {
      let query = admin.from("customers").select("id").in("id", candidateIds)
      if (order.partner_id) query = query.eq("partner_id", order.partner_id)

      const { data, error } = await query.limit(5)
      if (!error && data && data.length > 0) {
        const ids = data.map((customer: any) => String(customer?.id))
        if (order.customer_id && ids.includes(String(order.customer_id))) {
          return String(order.customer_id)
        }
        return ids[0]
      }
    }

    let query = admin
      .from("customers")
      .select("id")
      .or(`user_id.eq.${userId},marketplace_user_id.eq.${userId}`)
    if (order.partner_id) query = query.eq("partner_id", order.partner_id)

    const { data, error } = await query.limit(1)
    if (error) {
      console.error("[ORDER_ACCESS] failed to resolve buyer customer id", {
        userId,
        error: error.message,
      })
      return null
    }
    return data?.[0]?.id ? String(data[0].id) : null
  } catch (error: any) {
    console.error("[ORDER_ACCESS] unexpected error resolving buyer customer id", {
      userId,
      error: error?.message,
    })
    return null
  }
}

