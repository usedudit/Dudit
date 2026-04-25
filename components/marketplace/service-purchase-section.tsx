"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ShoppingBag } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface ServicePurchaseSectionProps {
  service: {
    id: string
    name: string
    price: number
    partner_id: string
  }
  partnerAddress: string
  paymentMethods: string[]
  userId: string
  mpConnected?: boolean
  mpPublicKey?: string
}

export function ServicePurchaseSection({
  service,
  partnerAddress,
  paymentMethods,
  userId,
  mpConnected,
  mpPublicKey,
}: ServicePurchaseSectionProps) {
  const router = useRouter()
  const handleBuyService = () => {
    if (!userId) {
      router.push("/auth/login?next=" + encodeURIComponent(window.location.pathname))
      return
    }

    const checkoutData = {
        source: "service",
        partnerId: service.partner_id,
        products: [{
            id: service.id,
            name: service.name,
            price: Number(service.price),
            quantity: 1,
        }],
        partnerInfo: {
            address: partnerAddress || {},
            paymentMethods: paymentMethods.length > 0 ? paymentMethods : ["Dinheiro", "PIX", "Cartão de Débito", "Cartão de Crédito"],
            mpConnected: mpConnected,
            mpPublicKey: mpPublicKey,
        },
        itemId: service.id,
        itemType: "service"
    }
    
    sessionStorage.setItem("checkout_session", JSON.stringify(checkoutData))
    router.push("/checkout")
  }

  return (
    <>
      <Button onClick={handleBuyService} className="w-full" size="lg">
        <ShoppingBag className="mr-2 h-5 w-5" />
        Solicitar Serviço - {formatCurrency(service.price)}
      </Button>
    </>
  )
}
