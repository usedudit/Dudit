"use client"

import { useState } from "react"
import { Button, Spinner, InfoCard } from "@/components/reusable"
import { PaymentWrapper } from "@/components/PaymentWrapper"
import { useNotification } from "@/hooks/use-notification"

interface OrderRetryPaymentProps {
  orderId: string
  amount: number
  status: string
  paymentProvider?: string | null
  orderNumber?: string | null
}

export function OrderRetryPayment({ orderId, amount, status, paymentProvider, orderNumber }: OrderRetryPaymentProps) {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const [loading, setLoading] = useState(false)
  const [showPixModal, setShowPixModal] = useState(false)
  const [pixData, setPixData] = useState<any>(null)
  const [boletoData, setBoletoData] = useState<any>(null)
  const [orderDetails, setOrderDetails] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const [chargedAmount, setChargedAmount] = useState<number>(amount)

  const handlePayNow = async () => {
    try {
      setLoading(true)
      setError(null)

      // Buscar dados do pagamento do servidor
      const response = await fetch("/api/orders/retry-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to retrieve payment")
      }

      const paymentData = await response.json()

      if (paymentData.chargeAmount != null) {
        setChargedAmount(paymentData.chargeAmount)
      }

      console.log("Full payment data received:", paymentData)

      // Se for PIX/Bank Transfer, mostra a modal
      if ((paymentData.paymentMethod === "pix" || paymentData.paymentMethod === "bank_transfer") && paymentData.pixData?.qrCodeBase64) {
        setPixData(paymentData.pixData)
        setBoletoData(null)
        setOrderDetails(paymentData.orderDetails)
        setShowPixModal(true)
        return
      }

      // Se for Boleto, abre a modal de boleto
      if ((paymentData.paymentMethod === "ticket" || paymentData.paymentMethod === "bolbradesco" || paymentData.paymentMethod === "boleto") && (paymentData.boletoData?.barcode || paymentData.ticketUrl)) {
        console.log("Showing BOLETO modal for payment")
        setPixData(null)
        setBoletoData(paymentData.boletoData || { ticketUrl: paymentData.ticketUrl })
        setOrderDetails(paymentData.orderDetails)
        setShowPixModal(true)
        return
      }

      // Se for outro método, mostra mensagem
      console.log("Payment method:", paymentData.paymentMethod)
      notifySuccess("Redirecionando", `Pagamento via ${paymentData.paymentMethod}.`)
    } catch (err: any) {
      console.error("Error in handlePayNow:", err)
      setError(err.message || "Erro ao processar pagamento")
    } finally {
      setLoading(false)
    }
  }

  if (status !== "pending" || paymentProvider !== "Mercado Pago") {
    return null
  }

  return (
    <>
      <Button
        onClick={handlePayNow}
        disabled={loading}
        className="w-full"
      >
        {loading ? (
          <>
            <Spinner className="mr-2" size={16} />
            Carregando...
          </>
        ) : (
          "Pagar Agora"
        )}
      </Button>

      {error && <InfoCard message={error} color="red" />}

      {(pixData || boletoData) && (
        <PaymentWrapper
          open={showPixModal}
          onClose={() => setShowPixModal(false)}
          pixData={pixData}
          boletoData={boletoData}
          orderId={orderId}
          amount={chargedAmount || amount}
          orderDetails={orderDetails}
          orderNumber={orderNumber || orderDetails?.orderNumber}
          sellerName={orderDetails?.sellerName}
        />
      )}
    </>
  )
}
