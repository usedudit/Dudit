"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ShoppingBag } from "lucide-react"
import { CheckoutWrapper } from "@/components/marketplace/CheckoutWrapper"
import { createOrderAction } from "@/app/actions/orders"
import { useNotification } from "@/hooks/use-notification"

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
  const { success: notifySuccess, error: notifyError } = useNotification()
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)

  const handleCheckout = async (data: {
    deliveryType: "delivery" | "pickup"
    deliveryAddress: string
    paymentMethod: string
    notes: string
    quantities: Record<string, number>
    useMercadoPago?: boolean
    paymentFormData?: any
  }) => {
    if (data.useMercadoPago) {
      try {
        const items = [
          {
            id: service.id,
            name: service.name,
            price: Number(service.price),
            quantity: 1,
          },
        ]

        // Processa pagamento localmente e cria order no banco
        const { fetchJSONWithCSRF } = await import("@/lib/utils/fetch-with-csrf")
        const mpData = await fetchJSONWithCSRF<{ success?: boolean; orderId?: string; paymentStatus?: string; error?: string }>(
          "/api/mercadopago/process-payment",
          {
            method: "POST",
            body: {
              paymentFormData: data.paymentFormData,
              items,
              partnerId: service.partner_id,
              buyerId: userId,
              deliveryType: data.deliveryType,
              deliveryAddress: data.deliveryAddress,
              notes: data.notes,
            },
          },
        )

        if (mpData.error) {
          notifyError("Erro", mpData.error)
          return
        }

        if (mpData.success && mpData.orderId) {
          setShowCheckoutModal(false)
          notifySuccess("Sucesso", `Pagamento realizado! Pedido: ${mpData.orderId}`)
          router.push("/my-orders")
          return
        }

        notifyError("Erro", "Erro ao processar pagamento")
        return
      } catch (error) {
        console.error("Checkout Bricks error:", error)
        notifyError("Erro", "Erro ao processar pagamento no Mercado Pago")
        return
      }
    }

    const csrfResponse = await fetch("/api/csrf-token")
    const { token: csrfToken } = await csrfResponse.json()

    const result = await createOrderAction({
      itemId: service.id,
      itemType: "service",
      quantity: 1,
      totalAmount: Number(service.price),
      deliveryType: data.deliveryType,
      deliveryAddress: data.deliveryAddress,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      partnerId: service.partner_id,
      csrf_token: csrfToken,
    })

    if (result.error) {
      notifyError("Erro", result.error)
      return
    }

    setShowCheckoutModal(false)
    notifySuccess("Sucesso", `Pedido realizado! Número: ${result.orderNumber}`)
    router.push("/my-orders")
  }

  return (
    <>
      <Button onClick={() => setShowCheckoutModal(true)} className="w-full" size="lg">
        <ShoppingBag className="mr-2 h-5 w-5" />
        Solicitar Serviço - R$ {Number(service.price).toFixed(2)}
      </Button>

      {showCheckoutModal && (
        <CheckoutWrapper
          open={true}
          onClose={() => setShowCheckoutModal(false)}
          products={[
            {
              id: service.id,
              name: service.name,
              price: Number(service.price),
              quantity: 1,
            },
          ]}
          partnerId={service.partner_id}
          partnerInfo={{
            address: partnerAddress,
            paymentMethods:
              paymentMethods.length > 0 ? paymentMethods : ["Dinheiro", "PIX", "Cartão de Débito", "Cartão de Crédito"],
            mpConnected: mpConnected,
            mpPublicKey: mpPublicKey,
          }}
          onSubmit={handleCheckout}
        />
      )}
    </>
  )
}
