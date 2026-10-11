import { createAdminClient } from "@/lib/supabase/server"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { requireUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { MyOrdersListClient } from "@/components/marketplace/MyOrdersListClient"
import { withMpPartnerFields } from "@/lib/services/payments/mercadopago-integration"
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

const MAX_ORDERS = 200

export default async function MyOrdersPage({ searchParams }: { searchParams?: Promise<{ tab?: string; order_number?: string; order?: string; view?: string }> }) {
  const resolvedParams = await searchParams
  const user = await requireUser()
  const adminClient = await createAdminClient()
  const orderSelect = `
    id, order_number, situation, delivery_status, total_amount, amount_paid, paid_amount, subtotal_original, discount_total, shipping_total,
    delivery_fee, discount_amount, payment_method_discount_amount, payment_method_extra_amount, payment_breakdown, checkout_fulfillment, created_at, updated_at, payment_method,
    payment_provider, delivery_type, delivery_address, delivery_breakdown, customer_name,
    partner_id, store_id, buyer_id, mp_payment_id, return_policy_snapshot, payment_expires_at,
    mp_date_approved, notes, order_source, exchange_parent_order_id, exchange_return_request_id, recurring_subscription_id,
    partners(id, is_active, partner_integrations(provider_slug, status, account_id, connected_at, config, metadata), addresses(city, state)),
    stores!left(id, short_id, name, slug, logo_url, banner_url, description, phone, addresses!store_id!left(id, zip_code, street, number, complement, neighborhood, city, state)),
    return_requests!order_id(id, request_type, status, desired_resolution, approved_resolution, refund_amount, store_credit_amount, customer_message, seller_notes, eligibility_status, sla_status, sla_due_at, sla_expired_at, reported_to_dudit_at, dudit_report_id, policy_snapshot, created_at, updated_at, deleted_at, return_items!return_items_return_request_id_fkey(order_item_id, quantity)),
    order_shipments(id, status, tracking_number, tracking_url, kind, carrier, provider_slug, service_code, service_name, price, external_label_id, created_at, updated_at, paid_at, delivered_at, cancelled_at),
    order_items(id, product_id, product_name, product_price, quantity, subtotal, line_type, fulfillment_mode, service_id, recurring_plan_id,
      product_variants(variant_name, variant_options),
      products(id, short_id, name, images, video_thumbnail, unit),
      services(id, short_id, name, images),
      recurring_plans(id, short_id, name))
  `
  const fallbackOrderSelect = `
    id, order_number, situation, delivery_status, total_amount, amount_paid, paid_amount, subtotal_original, discount_total, shipping_total,
    delivery_fee, discount_amount, payment_method_discount_amount, payment_method_extra_amount, payment_breakdown, checkout_fulfillment, created_at, updated_at, payment_method,
    payment_provider, delivery_type, delivery_address, delivery_breakdown, customer_name,
    partner_id, store_id, buyer_id, mp_payment_id, return_policy_snapshot, payment_expires_at,
    mp_date_approved, notes, order_source, exchange_parent_order_id, exchange_return_request_id, recurring_subscription_id,
    partners(id, is_active, partner_integrations(provider_slug, status, account_id, connected_at, config, metadata), addresses(city, state)),
    stores!left(id, short_id, name, slug, logo_url, banner_url, description, phone, addresses!store_id!left(id, zip_code, street, number, complement, neighborhood, city, state)),
    return_requests!order_id(id, request_type, status, desired_resolution, approved_resolution, refund_amount, store_credit_amount, customer_message, seller_notes, eligibility_status, sla_status, sla_due_at, sla_expired_at, reported_to_dudit_at, dudit_report_id, policy_snapshot, created_at, updated_at, deleted_at, return_items!return_items_return_request_id_fkey(order_item_id, quantity)),
    order_shipments(id, status, tracking_number, tracking_url, kind, carrier, provider_slug, service_code, service_name, price, external_label_id, created_at, updated_at, paid_at, delivered_at, cancelled_at),
    order_items(id, product_id, product_name, product_price, quantity, subtotal, line_type, fulfillment_mode, service_id, recurring_plan_id,
      services(id, short_id, name, images),
      recurring_plans(id, short_id, name))
  `

  // Parallelize all independent data fetches
  const [ordersResult, reviewsResult, sessionData] = await Promise.all([
    adminClient
      .from("orders")
      .select(orderSelect)
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_ORDERS),
    adminClient.from("reviews").select("order_id, product_id, service_id").eq("user_id", user.id),
    getUserSessionData(user.id),
  ])

  let orders = ordersResult.data || []
  if (ordersResult.error) {
    console.error("[MY_ORDERS_PAGE] failed full orders query, retrying simpler query", {
      userId: user.id,
      error: ordersResult.error.message,
      code: ordersResult.error.code,
    })

    const fallbackResult = await adminClient
      .from("orders")
      .select(fallbackOrderSelect)
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_ORDERS)

    if (fallbackResult.error) {
      console.error("[MY_ORDERS_PAGE] fallback orders query failed", {
        userId: user.id,
        error: fallbackResult.error.message,
        code: fallbackResult.error.code,
      })
    } else {
      orders = fallbackResult.data || []
    }
  }

  // mp_* status fields are sourced from partner_integrations.
  for (const order of orders) {
    if (order?.partners) order.partners = withMpPartnerFields(order.partners)
  }

  if (orders.length > 0) {
    const orderIds = orders.map((o: any) => o.id).filter(Boolean)
    try {
      const [{ data: assignments }, { data: deliveryLinks }] = await Promise.all([
        adminClient
          .from("delivery_assignments")
          .select("id, order_id, driver_id, status, assigned_at, accepted_at, picked_up_at, out_for_delivery_at, completed_at, failure_reason")
          .in("order_id", orderIds)
          .in("status", ["assigned", "accepted", "picked_up", "out_for_delivery", "delivered"])
          .order("assigned_at", { ascending: false }),
        adminClient
            .from("delivery_orders")
            .select("order_id, delivery_id, deliveries(id, delivery_person_id, status, estimated_duration_minutes, distance_km)")
            .in("order_id", orderIds),
        ])

      const assignmentByOrderId = new Map<string, any>()
      for (const a of assignments || []) {
        if (!assignmentByOrderId.has(String(a.order_id))) {
          assignmentByOrderId.set(String(a.order_id), a)
        }
      }

      const deliveryByOrderId = new Map<string, any>()
      for (const dl of deliveryLinks || []) {
        if (!deliveryByOrderId.has(String(dl.order_id)) && dl.deliveries) {
          deliveryByOrderId.set(String(dl.order_id), dl.deliveries)
        }
      }

      const platformDriverIds = Array.from(new Set(
        (assignments || [])
          .map((a: any) => a.driver_id ? String(a.driver_id) : null)
          .filter(Boolean)
      )) as string[]

      const legacyDriverUserIds = Array.from(new Set(
        (deliveryLinks || [])
          .map((dl: any) => dl.deliveries?.delivery_person_id ? String(dl.deliveries.delivery_person_id) : null)
          .filter(Boolean)
      )) as string[]

      const allUserIds = Array.from(new Set([...platformDriverIds, ...legacyDriverUserIds]))

      let profileMap = new Map<string, any>()
      let driverDetailsMap = new Map<string, any>()
      let totalDeliveriesMap = new Map<string, number>()

      if (allUserIds.length > 0) {
        const [{ data: profiles }, { data: driversData }, { data: deliveredRows }] = await Promise.all([
          adminClient
            .from("user_profiles")
            .select("user_id, full_name, phone, avatar_url")
            .in("user_id", allUserIds),
          platformDriverIds.length > 0
            ? adminClient
                .from("delivery_drivers")
                .select("user_id, vehicle_type, city")
                .in("user_id", platformDriverIds)
            : Promise.resolve({ data: [] }),
          platformDriverIds.length > 0
            ? adminClient
                .from("delivery_assignments")
                .select("driver_id")
                .in("driver_id", platformDriverIds)
                .eq("status", "delivered")
            : Promise.resolve({ data: [] }),
        ])

        for (const p of profiles || []) {
          profileMap.set(String(p.user_id), p)
        }
        for (const d of driversData || []) {
          driverDetailsMap.set(String(d.user_id), d)
        }
        for (const row of deliveredRows || []) {
          const did = String(row.driver_id)
          totalDeliveriesMap.set(did, (totalDeliveriesMap.get(did) || 0) + 1)
        }
      }

      orders = orders.map((order: any) => {
        const assignment = assignmentByOrderId.get(String(order.id))
        const legacyDel = deliveryByOrderId.get(String(order.id))

                if (assignment && assignment.driver_id) {
          const driverId = String(assignment.driver_id)
          const profile = profileMap.get(driverId)
          const driverRow = driverDetailsMap.get(driverId)
          const vehicleType = driverRow?.vehicle_type === "moto" ? "Moto" : driverRow?.vehicle_type === "carro" ? "Carro" : null

          return {
            ...order,
            delivery_driver: {
              id: driverId,
              name: profile?.full_name || "Entregador Dudit",
              phone: profile?.phone || null,
              avatarUrl: profile?.avatar_url || null,
              vehicleType,
              totalDeliveries: totalDeliveriesMap.get(driverId) || 0,
              status: assignment.status,
              isPlatformDriver: true,
              assigned_at: assignment.assigned_at || null,
              accepted_at: assignment.accepted_at || null,
              picked_up_at: assignment.picked_up_at || null,
              out_for_delivery_at: assignment.out_for_delivery_at || null,
              completed_at: assignment.completed_at || null,
              failure_reason: assignment.failure_reason || null,
              estimatedHours: null,
              distanceKm: null,
            },
          }
        } else if (legacyDel && legacyDel.delivery_person_id) {
          const driverId = String(legacyDel.delivery_person_id)
          const profile = profileMap.get(driverId)

          let estimatedHours: number | null = null
          if (legacyDel?.deliveries?.estimated_duration_minutes != null) {
            const mins = Number(legacyDel.deliveries.estimated_duration_minutes)
            if (!Number.isNaN(mins)) {
              estimatedHours = Math.round((mins / 60) * 2) / 2
            }
          }
          const distanceKm = legacyDel?.deliveries?.distance_km != null
            ? Number(legacyDel.deliveries.distance_km)
            : null

          return {
            ...order,
            delivery_driver: {
              id: driverId,
              name: profile?.full_name || "Entregador da Loja",
              phone: profile?.phone || null,
              avatarUrl: profile?.avatar_url || null,
              vehicleType: null,
              totalDeliveries: 0,
              status: legacyDel.status,
              isPlatformDriver: false,
              assigned_at: null,
              accepted_at: null,
              picked_up_at: null,
              out_for_delivery_at: null,
              completed_at: null,
              failure_reason: null,
              estimatedHours,
              distanceKm,
            },
          }
        }
        return order
      })
    } catch (e) {
      console.error("[MY_ORDERS_PAGE] Error hydrating delivery drivers:", e)
    }
  }

  const reviewedItemsArray = reviewsResult.data || []

  const userProfile = sessionData?.profile
    ? {
      full_name: sessionData.profile.full_name,
      address: sessionData.profile.city
        ? `${sessionData.profile.city} - ${sessionData.profile.state}`
        : null,
    }
    : null

  const cartCount = sessionData?.cartCount || 0
  const initialOrderNumber = resolvedParams?.order_number || resolvedParams?.order || resolvedParams?.view
  const initialTab = resolvedParams?.tab

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
      <MyOrdersListClient
        orders={orders}
        reviewedItemsArray={reviewedItemsArray}
        userId={user.id}
        initialOrderNumber={initialOrderNumber}
        initialTab={initialTab}
        userProfile={userProfile}
        cartCount={cartCount}
      />

      <MarketplaceFooter />
    </div>
  )
}
