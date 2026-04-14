import { createAdminClient } from "@/lib/supabase/server"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { requireUser, getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { MyOrdersListClient } from "@/components/marketplace/MyOrdersListClient"
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default async function MyOrdersPage() {
  const user = await requireUser()
  const adminClient = await createAdminClient()

  // Parallelize all independent data fetches
  const [ordersResult, reviewsResult, sessionData] = await Promise.all([
    adminClient
      .from("orders")
      .select(`
        id, order_number, situation, total_amount, created_at, payment_method,
        payment_provider, delivery_type, delivery_address, customer_name,
        partner_id, buyer_id, mp_payment_id,
        partners(id, store_name, store_image_url, slug, addresses(city, state)),
        order_items(id, product_id, product_name, product_price, quantity, subtotal,
          product_variants(variant_name, variant_options),
          products(id, name, images, slug))
      `)
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    adminClient.from("reviews").select("order_id").eq("user_id", user.id),
    getUserSessionData(user.id),
  ])

  const orders = ordersResult.data || []
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

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
      <MarketplaceHeader currentView="account-info" userProfile={userProfile} cartCount={cartCount} />

      <MyOrdersListClient
        orders={orders}
        reviewedOrderIdsArray={reviewedOrderIdsArray}
        userId={user.id}
      />

      <MarketplaceFooter />
    </div>
  )
}
