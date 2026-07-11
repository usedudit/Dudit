"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, Spinner } from "@/components/reusable"
import { CheckCircleIcon, CancelCircleIcon, InfoIcon } from "@/lib/icons"
import { syncSubscriptionWithMpAction } from "@/app/actions/marketplace/preapproval"
import { checkSubscriptionStatusAction } from "@/app/actions/checkout/fulfillment"

export default function CheckoutFulfillmentPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription_id?: string; preapproval_id?: string; status?: string }>
}) {
  const router = useRouter()
  const params = use(searchParams)
  const subscriptionId = params.subscription_id
  const preapprovalId = params.preapproval_id
  const mpStatus = params.status

  const [status, setStatus] = useState<"pending" | "active" | "failed" | "timeout">("pending")
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    if (!subscriptionId) {
      router.push("/")
      return
    }

    let intervalId: NodeJS.Timeout

    const checkStatus = async () => {
      try {
        const res = await checkSubscriptionStatusAction(subscriptionId)
        if (res.error) throw new Error(res.error)

        if (res.status === "active") {
          setStatus("active")
          clearInterval(intervalId)
        } else if (res.status === "payment_failed") {
          setStatus("failed")
          setErrorDetails("O pagamento não foi aprovado pela operadora do cartão.")
          clearInterval(intervalId)
        } else if (res.status === "cancelled") {
          setStatus("failed")
          setErrorDetails("A assinatura foi cancelada.")
          clearInterval(intervalId)
        }

        setAttempts((prev) => {
          if (prev >= 12) { // 30 seconds max polling
            setStatus("timeout")
            clearInterval(intervalId)
            return prev
          }
          return prev + 1
        })
      } catch (err: any) {
        console.error("Fulfillment polling error:", err.message)
      }
    }

    // Run first check immediately, then every 2.5 seconds
    void checkStatus()
    intervalId = setInterval(checkStatus, 2500)

    return () => clearInterval(intervalId)
  }, [subscriptionId, router])

  const handleManualSync = async () => {
    if (!subscriptionId) return
    setStatus("pending")
    setAttempts(0)

    try {
      // Check subscription status first
      const statusRes = await checkSubscriptionStatusAction(subscriptionId)
      if (statusRes.error) throw new Error(statusRes.error)

      if (statusRes.partner_id) {
        const res = await syncSubscriptionWithMpAction(statusRes.partner_id, subscriptionId)
        if (res.success && res.status === "active") {
          setStatus("active")
        } else if (res.success && res.status === "payment_failed") {
          setStatus("failed")
          setErrorDetails("O pagamento não foi aprovado.")
        } else {
          setStatus("timeout")
        }
      } else {
        setStatus("failed")
        setErrorDetails("Assinatura inválida.")
      }
    } catch (err: any) {
      setStatus("failed")
      setErrorDetails(err.message)
    }
  }

  return (
    <div className="container max-w-xl mx-auto py-24 px-4 min-h-[80vh] flex items-center justify-center">
      <Card className="w-full shadow-lg border border-brand-border dark:border-dark-border rounded-[24px]">
        <CardContent className="pt-10 pb-8 flex flex-col items-center">
          {status === "pending" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center space-y-6 flex flex-col items-center"
            >
              <Spinner size={48} className="text-brand-primary" />
              <div className="space-y-2">
                <CardTitle className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                  Confirmando Assinatura
                </CardTitle>
                <CardDescription className="text-brand-inactive-text dark:text-dark-body max-w-sm mx-auto">
                  Aguardando confirmação do pagamento pelo Mercado Pago. Isso pode levar alguns segundos...
                </CardDescription>
              </div>
            </motion.div>
          )}

          {status === "active" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center space-y-6 flex flex-col items-center w-full"
            >
              <div className="h-16 w-16 bg-green-50 dark:bg-green-900/10 rounded-full flex items-center justify-center">
                <CheckCircleIcon className="h-10 w-10 text-brand-green" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                  Assinatura Confirmada! 🎉
                </CardTitle>
                <CardDescription className="text-brand-inactive-text dark:text-dark-body max-w-sm mx-auto">
                  Sua assinatura foi ativada com sucesso e seus benefícios de créditos e entregas já estão liberados!
                </CardDescription>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full justify-center pt-4">
                <Button onClick={() => router.push("/assinaturas")} className="w-full sm:w-auto">
                  Ver Minhas Assinaturas
                </Button>
                <Button variant="outline" onClick={() => router.push("/")} className="w-full sm:w-auto">
                  Ir para a Home
                </Button>
              </div>
            </motion.div>
          )}

          {status === "failed" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center space-y-6 flex flex-col items-center w-full"
            >
              <div className="h-16 w-16 bg-red-50 dark:bg-red-900/10 rounded-full flex items-center justify-center">
                <CancelCircleIcon className="h-10 w-10 text-brand-red" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                  Falha na Confirmação
                </CardTitle>
                <CardDescription className="text-brand-inactive-text dark:text-dark-body max-w-sm mx-auto">
                  {errorDetails || "Não foi possível confirmar o pagamento da assinatura no Mercado Pago."}
                </CardDescription>
              </div>

              <div className="flex gap-3 w-full justify-center pt-4">
                <Button onClick={() => router.push("/checkout")} className="w-full sm:w-auto">
                  Tentar Novamente
                </Button>
              </div>
            </motion.div>
          )}

          {status === "timeout" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center space-y-6 flex flex-col items-center w-full"
            >
              <div className="h-16 w-16 bg-orange-50 dark:bg-orange-900/10 rounded-full flex items-center justify-center">
                <InfoIcon className="h-10 w-10 text-brand-orange" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                  Sincronização em Andamento
                </CardTitle>
                <CardDescription className="text-brand-inactive-text dark:text-dark-body max-w-sm mx-auto">
                  O Mercado Pago está demorando um pouco para confirmar o pagamento. Clique abaixo para verificar o status atualizado.
                </CardDescription>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full justify-center pt-4">
                <Button onClick={handleManualSync} className="w-full sm:w-auto">
                  Verificar Pagamento
                </Button>
                <Button variant="outline" onClick={() => router.push("/assinaturas")} className="w-full sm:w-auto">
                  Ir para Minhas Assinaturas
                </Button>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
