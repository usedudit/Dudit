import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { normalizeToRoutePermissions } from "@/lib/permissions/route-permissions"
import { canAccessRoute } from "@/lib/permissions/route-permissions"
import type { PartnerRole } from "@/lib/permissions/types"
import ProductivityPage from "@/components/erp/produtividade/ProductivityPage"
import { GlobalPeriodFilter } from "@/components/erp/GlobalPeriodFilter"
import type { Period, CompareMode } from "@/lib/period-types"
import { getPeriodDateRange } from "@/lib/period-types"
import {
  getProductivityOverviewAction,
  getProductivityRankingAction,
} from "@/app/actions/erp/produtividade"

export const dynamic = "force-dynamic"

export default async function ProdutividadePage(props: {
  searchParams?: Promise<{ period?: string; compare?: string; compareFrom?: string; compareTo?: string }>
}) {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId
  const role = (context.role || "DELIVERY") as PartnerRole
  const routePermissions = normalizeToRoutePermissions(role, context.roleId === "owner" ? null : context.permissions)
  if (!canAccessRoute(routePermissions, "productivity_overview")) return <AccessDenied />

  const searchParams = await props.searchParams
  const period = (searchParams?.period as Period) || "monthly"
  const compare = (searchParams?.compare as CompareMode) || "none"
  const compareFrom = searchParams?.compareFrom
  const compareTo = searchParams?.compareTo

  const today = new Date().toISOString().slice(0, 10)
  const currentRange = getPeriodDateRange(period, today)
  const startDate = `${currentRange.from}T00:00:00.000Z`
  const endDate = `${currentRange.to}T23:59:59.999Z`

  const overviewRes = await getProductivityOverviewAction(partnerId, period, compare, compareFrom, compareTo)
  const rankingRes = await getProductivityRankingAction(partnerId, { startDate, endDate })

  const overview = overviewRes.success
    ? {
        totalSold: overviewRes.totalSold || 0,
        totalSalesCount: overviewRes.totalSalesCount || 0,
        averageTicket: overviewRes.averageTicket || 0,
        generalGoal: overviewRes.generalGoal || 0,
        goalAchievedPercent: overviewRes.goalAchievedPercent || 0,
        estimatedCommission: overviewRes.estimatedCommission || 0,
        paidCommission: overviewRes.paidCommission || 0,
        pendingCommission: overviewRes.pendingCommission || 0,
        totalSoldTrend: overviewRes.totalSoldTrend,
        totalSalesCountTrend: overviewRes.totalSalesCountTrend,
        averageTicketTrend: overviewRes.averageTicketTrend,
      }
    : {
        totalSold: 0,
        totalSalesCount: 0,
        averageTicket: 0,
        generalGoal: 0,
        goalAchievedPercent: 0,
        estimatedCommission: 0,
        paidCommission: 0,
        pendingCommission: 0,
      }

  const ranking = rankingRes.success ? rankingRes.ranking : []

  return (
    <>
      <ERPPageHeader title="Visão Geral" />
      <FadeIn className="p-4">
        <div className="w-full space-y-6 pt-2 px-4 md:px-8">
          <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
              <h1 className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading flex items-center gap-2">
                Visão Geral
              </h1>
              <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                Desempenho de vendas e produtividade da equipe
              </p>
            </div>
            <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-full bg-brand-gray/40 dark:bg-dark-border/20" />}>
              <GlobalPeriodFilter />
            </Suspense>
          </header>
          <ProductivityPage overview={overview} ranking={ranking} />
        </div>
      </FadeIn>
    </>
  )
}
