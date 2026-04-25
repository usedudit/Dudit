import { CheckoutPageClient } from "@/components/marketplace/CheckoutPageClient"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Finalizar Compra - Dudit",
  description: "Conclua seu pedido na Dudit.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function CheckoutPage() {
  return <CheckoutPageClient />
}
