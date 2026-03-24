import { createAdminClient } from "@/lib/supabase/server"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { requireUser } from "@/lib/auth/authorization"
import { MyOrdersListClient } from "@/components/marketplace/MyOrdersListClient"
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default async function MyOrdersPage() {
  const userData = { user: await requireUser() }
  const adminClient = await createAdminClient()

  const { data: orders, error: ordersError } = await adminClient
    .from("orders")
    .select(`
      *,
      partners(store_name, store_image_url),
      order_items(*, product_variants(variant_name, variant_options), products(name, images))
    `)
    .eq("buyer_id", userData.user.id)
    .order("created_at", { ascending: false })

  const { data: reviews } = await adminClient.from("reviews").select("order_id").eq("user_id", userData.user.id)
  const reviewedOrderIdsArray = reviews?.map((r: any) => r.order_id) || []

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
      <MarketplaceHeader currentView="account-info" />

      <MyOrdersListClient
        orders={orders || []}
        reviewedOrderIdsArray={reviewedOrderIdsArray}
        userId={userData.user.id}
      />

      <MarketplaceFooter />
    </div>
  )
}
