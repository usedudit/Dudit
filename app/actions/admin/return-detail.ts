"use server"

import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"

export async function getAdminReturnRequestDetail(returnRequestId: string) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  await requireAdmin()

  const admin = getAdminClient()

  const { data: request, error } = await admin
    .from("return_requests")
    .select(`
      *,
      partners(id, store_name, business_type, risk_score, is_active, user_id),
      orders!order_id(
        id, order_number, situation, delivery_status, total_amount, amount_paid,
        paid_amount, payment_method, payment_provider, created_at, return_policy_snapshot,
        order_items(id, product_name, product_price, quantity, subtotal, net_item_value)
      ),
      return_items!return_items_return_request_id_fkey(
        id, product_name_snapshot, sku_snapshot, quantity, ordered_quantity,
        net_item_value_snapshot, reason, condition, unit_price_snapshot
      ),
      return_evidence(id, file_url, file_type, file_name, created_at),
      return_events(id, event_type, from_status, to_status, message, metadata, source, created_at),
      return_messages(id, sender_role, message, created_at)
    `)
    .eq("id", returnRequestId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throw error
  if (!request) return null

  const partnerId = request.partner_id as string

  const [{ data: riskEvents }, { data: moderationActions }, { data: relatedReports }] = await Promise.all([
    admin
      .from("partner_risk_events")
      .select("id, source_type, points, metadata, created_at, reverted_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("partner_moderation_actions")
      .select("id, action_type, notes, risk_score_increment, created_at, admin_user_id")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("reports")
      .select("*")
      .eq("target_type", "return_request")
      .eq("target_id", returnRequestId)
      .order("created_at", { ascending: false }),
  ])

  return {
    request,
    riskEvents: riskEvents || [],
    moderationActions: moderationActions || [],
    relatedReports: relatedReports || [],
  }
}
