"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Button, Spinner } from "@/components/reusable"
import { CheckCircleIcon, CancelCircleIcon, InfoIcon } from "@/lib/icons"
import { syncSubscriptionWithMpAction } from "@/app/actions/marketplace/preapproval"
import { checkSubscriptionStatusAction } from "@/app/actions/checkout/fulfillment"
import { useRealtimeRecord } from "@/hooks/use-realtime-record"

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

  // Realtime subscription: updates status in < 80ms as soon as webhook writes to DB
  useRealtimeRecord<{ status?: string }>({
    table: "recurring_subscriptions",
    id: subscriptionId,
    enabled: status === "pending" && !!subscriptionId,
    onUpdate: (record) => {
      if (record?.status === "active") {
        setStatus("active")
      } else if (record?.status === "payment_failed") {
        setStatus("failed")
        setErrorDetails("O pagamento não foi aprovado pela operadora do cartão.")
      } else if (record?.status === "cancelled") {
        setStatus("failed")
        setErrorDetails("A assinatura foi cancelada.")
      }
    },
  })

  useEffect(() => {
    if (!subscriptionId) {
      router.push("/")
      return
    }

    let isMounted = true

    // 1. Initial immediate check (in case payment completed before page mounted)
    const checkInitial = async () => {
      try {
        const res = await checkSubscriptionStatusAction(subscriptionId)
        if (!isMounted) return
        if (res.error) throw new Error(res.error)

        if (res.status === "active") {
          setStatus("active")
        } else if (res.status === "payment_failed") {
          setStatus("failed")
          setErrorDetails("O pagamento não foi aprovado pela operadora do cartão.")
        } else if (res.status === "cancelled") {
          setStatus("failed")
          setErrorDetails("A assinatura foi cancelada.")
        }
      } catch (err: any) {
        console.error("Fulfillment initial check error:", err.message)
      }
    }

    void checkInitial()

    // 2. Gentle safety fallback: one check at 12s, timeout at 35s if still pending
    const fallbackTimer = setTimeout(async () => {
      if (!isMounted || status !== "pending") return
      try {
        const res = await checkSubscriptionStatusAction(subscriptionId)
        if (!isMounted) return
        if (res.status === "active") {
          setStatus("active")
        } else if (res.status === "payment_failed") {
          setStatus("failed")
          setErrorDetails("O pagamento não foi aprovado pela operadora do cartão.")
        }
      } catch (err) { }
    }, 12000)

    const timeoutTimer = setTimeout(() => {
      if (isMounted && status === "pending") {
        setStatus("timeout")
      }
    }, 35000)

    return () => {
      isMounted = false
      clearTimeout(fallbackTimer)
      clearTimeout(timeoutTimer)
    }
  }, [subscriptionId, router, status])

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
                  Ir para o Início
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
