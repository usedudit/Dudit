import { CartPageClient } from "@/components/marketplace/CartPage"
import { getCachedCart } from "@/app/actions/marketplace/cart"
import { requireUser } from "@/lib/auth/authorization"
import { recordCartAbandonmentClick } from "@/lib/services/cart-abandonment.service"
import type { Metadata } from "next"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
}

// No need for force-dynamic - the page uses cookies() via auth which already makes it dynamic.

export default async function CartPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string | string[]; partner?: string | string[] }>
}) {
  // Use cached auth layer instead of raw supabase call
  const user = await requireUser()

  const resolvedParams = searchParams ? await searchParams : {}
  const fromParam = Array.isArray(resolvedParams.from) ? resolvedParams.from[0] : resolvedParams.from
  const partnerParam = Array.isArray(resolvedParams.partner) ? resolvedParams.partner[0] : resolvedParams.partner

  if (fromParam === "cart_abandoned") {
    await recordCartAbandonmentClick({
      userId: user.id,
      partnerId: partnerParam || null,
    }).catch(() => {})
  }

  const cartPageData = await getCachedCart(user.id)

  return (
    <CartPageClient
      itemsByPartner={cartPageData.itemsByPartner}
      userId={user.id}
      initialCartCount={cartPageData.cartCount}
      initialUserProfile={cartPageData.userProfile}
      initialUserAddresses={cartPageData.userAddresses}
    />
  )
}
