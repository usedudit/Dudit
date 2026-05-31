"use client"

import { useCallback, useState } from "react"
import { Button, Badge } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import {
  cancelRecurringSubscriptionAction,
  getRecurringSubscriptionExecutionsAction,
  listRecurringSubscriptionsAction,
  pauseRecurringSubscriptionAction,
  resumeRecurringSubscriptionAction,
} from "@/app/actions/erp/recurring-subscriptions"
import type { RecurringSubscription } from "@/lib/types/recurring"
import { getRecurringStatusLabel, getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { formatFullDate } from "@/lib/utils"

export default function RecurringSubscriptionsPage({
  partnerId,
  initialSubscriptions,
  initialHasMore,
  initialNextCursor,
}: {
  partnerId: string
  initialSubscriptions: RecurringSubscription[]
  initialHasMore: boolean
  initialNextCursor: string | null
}) {
  const { toast } = useToast()
  const { canEdit } = usePermissions()
  const canManage = canEdit("recurring_subscriptions")

  const [subscriptions, setSubscriptions] = useState(initialSubscriptions)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "cancelled" | "expired">("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [executions, setExecutions] = useState<any[]>([])
  const [loadingExecutions, setLoadingExecutions] = useState(false)

  const reload = useCallback(async () => {
    const res = await listRecurringSubscriptionsAction(partnerId, {
      status: statusFilter,
    })
    if (res.success && res.data) {
      setSubscriptions(res.data.items)
      setHasMore(res.data.hasMore)
      setNextCursor(res.data.nextCursor)
    }
  }, [partnerId, statusFilter])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const res = await listRecurringSubscriptionsAction(partnerId, { cursor: nextCursor, status: statusFilter })
    setLoadingMore(false)
    if (res.success && res.data) {
      setSubscriptions((prev) => [...prev, ...res.data.items])
      setHasMore(res.data.hasMore)
      setNextCursor(res.data.nextCursor)
    }
  }

  const openHistory = async (subscriptionId: string) => {
    setSelectedId(subscriptionId)
    setLoadingExecutions(true)
    const res = await getRecurringSubscriptionExecutionsAction(partnerId, subscriptionId)
    setLoadingExecutions(false)
    if (res.success) setExecutions(res.data || [])
    else toast({ title: "Erro", description: res.error, variant: "destructive" })
  }

  const runAction = async (action: "pause" | "resume" | "cancel", subscriptionId: string) => {
    const fn = action === "pause"
      ? pauseRecurringSubscriptionAction
      : action === "resume"
        ? resumeRecurringSubscriptionAction
        : cancelRecurringSubscriptionAction

    const res = await fn(partnerId, subscriptionId)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Assinatura atualizada" })
    await reload()
  }

  const statusVariant = (status: string) => {
    if (status === "active") return "success" as const
    if (status === "paused") return "warning" as const
    if (status === "cancelled") return "destructive" as const
    return "secondary" as const
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Assinaturas recorrentes</h2>
        <p className="text-sm text-muted-foreground">Acompanhe assinaturas ativas e o histórico de execuções automáticas.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "active", "paused", "cancelled", "expired"] as const).map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatusFilter(status); listRecurringSubscriptionsAction(partnerId, { status }).then((res) => {
              if (res.success && res.data) {
                setSubscriptions(res.data.items)
                setHasMore(res.data.hasMore)
                setNextCursor(res.data.nextCursor)
              }
            }) }}
          >
            {status === "all" ? "Todas" : getRecurringStatusLabel(status)}
          </Button>
        ))}
      </div>

      <div className="grid gap-3">
        {subscriptions.length === 0 ? (
          <div className="border rounded-xl p-8 text-center text-muted-foreground">Nenhuma assinatura encontrada.</div>
        ) : subscriptions.map((sub: any) => (
          <div key={sub.id} className="border rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{sub.plan?.name || "Plano"}</h3>
                  <Badge variant={statusVariant(sub.status)}>{getRecurringStatusLabel(sub.status)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Cliente: {sub.customer?.name || sub.customerId}
                </p>
                <p className="text-sm text-muted-foreground">
                  Próxima execução: {formatFullDate(sub.nextExecutionAt)}
                  {sub.plan && ` · ${getRecurringFrequencyLabel(sub.plan.frequency_type, sub.plan.frequency_interval)}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openHistory(sub.id)}>Histórico</Button>
                {canManage && sub.status === "active" && (
                  <Button variant="outline" size="sm" onClick={() => runAction("pause", sub.id)}>Pausar</Button>
                )}
                {canManage && sub.status === "paused" && (
                  <Button variant="outline" size="sm" onClick={() => runAction("resume", sub.id)}>Reativar</Button>
                )}
                {canManage && sub.status !== "cancelled" && sub.status !== "expired" && (
                  <Button variant="outline" size="sm" onClick={() => runAction("cancel", sub.id)}>Cancelar</Button>
                )}
              </div>
            </div>

            {selectedId === sub.id && (
              <div className="border-t pt-3 space-y-2">
                <h4 className="text-sm font-medium">Histórico de execuções</h4>
                {loadingExecutions ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : executions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma execução registrada.</p>
                ) : executions.map((exec) => (
                  <div key={exec.id} className="text-sm flex flex-wrap gap-2 items-center">
                    <span>{formatFullDate(exec.scheduled_for)}</span>
                    <Badge variant={exec.status === "completed" ? "success" : exec.status === "failed" ? "destructive" : "secondary"}>
                      {exec.status}
                    </Badge>
                    {exec.orders?.order_number && <span>Pedido #{exec.orders.order_number}</span>}
                    {exec.error_message && <span className="text-red-600">{exec.error_message}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Carregando..." : "Carregar mais"}
        </Button>
      )}
    </div>
  )
}
