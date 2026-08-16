import { CartPageClient } from "@/components/marketplace/CartPage"
import { getCachedCart } from "@/app/actions/marketplace/cart"
import { requireUser } from "@/lib/auth/authorization"
import type { Metadata } from "next"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
}

// No need for force-dynamic - the page uses cookies() via auth which already makes it dynamic.

export default async function CartPage() {
  // Use cached auth layer instead of raw supabase call
  const user = await requireUser()

  // Busca de Dados Otimizada (Vem do Cache de Dados, não do Banco)
  const itemsByPartner = await getCachedCart(user.id)

  return <CartPageClient itemsByPartner={itemsByPartner} userId={user.id} />
}
