"use client"

import { useState } from "react"
import { Button, Badge } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import {
  cancelMyRecurringSubscriptionAction,
  getMyRecurringSubscriptionExecutionsAction,
  pauseMyRecurringSubscriptionAction,
  resumeMyRecurringSubscriptionAction,
} from "@/app/actions/marketplace/recurring-subscriptions"
import { formatFullDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

export function MySubscriptionsClient({ subscriptions }: { subscriptions: any[] }) {
  const { toast } = useToast()
  const [items, setItems] = useState(subscriptions)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [executions, setExecutions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const refreshItem = (updated: any) => {
    setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated, statusLabel: updated.status } : item)))
  }

  const runAction = async (action: "pause" | "resume" | "cancel", subscriptionId: string) => {
    const fn = action === "pause"
      ? pauseMyRecurringSubscriptionAction
      : action === "resume"
        ? resumeMyRecurringSubscriptionAction
        : cancelMyRecurringSubscriptionAction

    const res = await fn(subscriptionId)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Assinatura atualizada" })
    if (res.data) refreshItem(res.data)
  }

  const openHistory = async (subscriptionId: string) => {
    setSelectedId(subscriptionId)
    setLoading(true)
    const res = await getMyRecurringSubscriptionExecutionsAction(subscriptionId)
    setLoading(false)
    if (res.success) setExecutions(res.data || [])
    else toast({ title: "Erro", description: res.error, variant: "destructive" })
  }

  const statusVariant = (status: string) => {
    if (status === "active") return "green" as const
    if (status === "paused") return "orange" as const
    if (status === "cancelled") return "red" as const
    return "gray" as const
  }

  return (
    <div className="grid gap-4">
      {items.length === 0 ? (
        <div className="border rounded-2xl p-10 text-center text-gray-500">
          Você ainda não possui assinaturas ativas.
        </div>
      ) : items.map((sub) => (
        <div key={sub.id} className="border rounded-2xl p-5 space-y-4 bg-white dark:bg-dark-card">
          <div className="flex items-start gap-4">
            {sub.partner?.store_image_url && (
              <img
                src={getR2ImageUrl(sub.partner.store_image_url)}
                alt={sub.partner.store_name}
                className="w-14 h-14 rounded-xl object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-lg">{sub.plan?.name || "Plano"}</h3>
                <Badge variant={statusVariant(sub.status)}>{sub.statusLabel || sub.status}</Badge>
              </div>
              <p className="text-sm text-gray-500 mt-1">{sub.partner?.store_name}</p>
              <p className="text-sm mt-2">
                Próxima execução: <strong>{formatFullDate(sub.nextExecutionAt)}</strong>
              </p>
              {sub.frequencyLabel && (
                <p className="text-sm text-gray-500">{sub.frequencyLabel}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => openHistory(sub.id)}>Ver histórico</Button>
            {sub.status === "active" && (
              <Button variant="outline" size="sm" onClick={() => runAction("pause", sub.id)}>Pausar</Button>
            )}
            {sub.status === "paused" && (
              <Button variant="outline" size="sm" onClick={() => runAction("resume", sub.id)}>Reativar</Button>
            )}
            {sub.status !== "cancelled" && sub.status !== "expired" && (
              <Button variant="outline" size="sm" onClick={() => runAction("cancel", sub.id)}>Cancelar</Button>
            )}
          </div>

          {selectedId === sub.id && (
            <div className="border-t pt-4 space-y-2">
              <h4 className="font-medium text-sm">Histórico</h4>
              {loading ? (
                <p className="text-sm text-gray-500">Carregando...</p>
              ) : executions.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma execução ainda.</p>
              ) : executions.map((exec) => (
                <div key={exec.id} className="text-sm flex flex-wrap gap-2 items-center">
                  <span>{formatFullDate(exec.scheduled_for)}</span>
                  <Badge variant={exec.status === "completed" ? "green" : exec.status === "failed" ? "red" : "gray"}>
                    {exec.status}
                  </Badge>
                  {exec.orders?.order_number && <span>Pedido #{exec.orders.order_number}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
