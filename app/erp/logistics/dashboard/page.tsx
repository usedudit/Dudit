import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPermission } from "@/lib/permissions/access"
import { getERPDeliveryAnalyticsAction } from "@/app/actions/erp/deliveries"
import { DashboardBarChart, DashboardLineChart } from "@/components/erp/dashboard/charts/DashboardCharts"
import { InfoCard } from "@/components/reusable"

export const dynamic = "force-dynamic"

export default async function LogisticsDashboardPage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const [{ allowed }, analytics] = await Promise.all([
    checkPermission(partnerId, "delivery", "view"),
    getERPDeliveryAnalyticsAction({ partnerId, days: 30 }),
  ])

  if (!allowed) return <AccessDenied />
  if (!analytics.success) {
    throw new Error(analytics.error || "Erro ao carregar dashboard de entregas.")
  }

  const d = analytics.data

  return (
    <>
      <ERPPageHeader title="Dashboard de entregas" />
      <FadeIn className="p-4">
        <div className="max-w-[1300px] mx-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard color="blue" title="Tempo médio de entrega" message={`${d.metrics.avgDeliveryMinutes} min`} />
            <InfoCard color="gray" title="Total entregas (30d)" message={String(d.metrics.totalDeliveries)} />
            <InfoCard color="green" title="Taxa de conclusão" message={`${d.metrics.completionRate}%`} />
            <InfoCard color="green" title="Entregas concluídas" message={String(d.metrics.completedDeliveries)} />
            <InfoCard color="orange" title="Entregas ativas" message={String(d.metrics.activeDeliveries)} />
            <InfoCard color="purple" title="Distância total estimada" message={`${d.metrics.totalEstimatedDistanceKm} km`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 xl:col-span-2">
              <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Entregas por dia</h3>
              <DashboardBarChart data={d.deliveriesPerDay} />
            </div>
            <div className="rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-5">
              <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Ranking de entregadores</h3>
              <div className="mt-4 space-y-3">
                {d.driverRanking.length === 0 ? (
                  <div className="text-sm text-brand-inactive-text">Sem dados suficientes no período.</div>
                ) : (
                  d.driverRanking.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{r.name}</div>
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body">{r.deliveries} entrega(s)</div>
                      </div>
                      <div className="text-xs font-bold text-brand-dark dark:text-dark-heading shrink-0">
                        {r.avgMinutes ? `${r.avgMinutes} min` : "-"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-5">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Tendência de conclusão</h3>
            <DashboardLineChart data={d.completionTrend} />
            <p className="text-xs text-brand-inactive-text mt-2">
              Linha principal: concluídas • Linha secundária: total do dia
            </p>
          </div>
        </div>
      </FadeIn>
    </>
  )
}

