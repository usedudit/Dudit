import { createAdminClient } from "@/lib/supabase/server"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { requireUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { MyOrdersListClient } from "@/components/marketplace/MyOrdersListClient"
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default async function MyOrdersPage({ searchParams }: { searchParams?: Promise<{ tab?: string; order_number?: string }> }) {
  const resolvedParams = await searchParams
  const user = await requireUser()
  const adminClient = await createAdminClient()
  const orderSelect = `
    id, order_number, situation, delivery_status, total_amount, amount_paid, subtotal_original, discount_total, shipping_total, created_at, payment_method,
    payment_provider, delivery_type, delivery_address, customer_name,
    partner_id, buyer_id, mp_payment_id,
    partners(id, store_name, store_image_url, addresses(city, state)),
    return_requests!order_id(id, request_type, status),
    order_items(id, product_id, product_name, product_price, quantity, subtotal,
      product_variants(variant_name, variant_options),
      products(id, name, images, video_thumbnail))
  `
  const fallbackOrderSelect = `
    id, order_number, situation, delivery_status, total_amount, amount_paid, subtotal_original, discount_total, shipping_total, created_at, payment_method,
    payment_provider, delivery_type, delivery_address, customer_name,
    partner_id, buyer_id, mp_payment_id,
    partners(id, store_name, store_image_url, addresses(city, state)),
    return_requests!order_id(id, request_type, status),
    order_items(id, product_id, product_name, product_price, quantity, subtotal)
  `

  // Parallelize all independent data fetches
  const [ordersResult, reviewsResult, sessionData] = await Promise.all([
    adminClient
      .from("orders")
      .select(orderSelect)
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    adminClient.from("reviews").select("order_id").eq("user_id", user.id),
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
      .limit(50)

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

  const reviewedOrderIdsArray = reviewsResult.data?.map((r: any) => r.order_id) || []

  const userProfile = sessionData?.profile
    ? {
      full_name: sessionData.profile.full_name,
      address: sessionData.profile.city
        ? `${sessionData.profile.city} - ${sessionData.profile.state}`
        : null,
    }
    : null

  const cartCount = sessionData?.cartCount || 0

  const isDetails = resolvedParams?.tab === 'details'
  const headerTitle = isDetails ? "Detalhes do pedido" : "Meus pedidos"

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
      <MarketplaceHeader simpleTitle={headerTitle} userProfile={userProfile} cartCount={cartCount} />

      <MyOrdersListClient
        orders={orders}
        reviewedOrderIdsArray={reviewedOrderIdsArray}
        userId={user.id}
      />

      <MarketplaceFooter />
    </div>
  )
}
