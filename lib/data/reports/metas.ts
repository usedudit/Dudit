import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { brl } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"

export interface GoalReportData {
  goals: {
    id: string
    name: string
    targetAmount: number
    targetFormatted: string
    progress: number
    progressPct: number
    achieved: boolean
  }[]
  overallProgress: number
  achievedCount: number
  totalCount: number
}

const getCachedGoalsData = cache(async (partnerId: string, period: Period = "monthly") => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from } = getDateRangeWithPrevious(period)

      const goalsResult = await supabase
        .from("sales_goals")
        .select("id, name, target_amount, start_date, end_date")
        .eq("partner_id", partnerId)
        .gte("start_date", from)
        .order("start_date", { ascending: false })
        .limit(50)

      if (goalsResult.error) throw goalsResult.error
      const goals = goalsResult.data || []

      let goalIds = goals.map((g: any) => g.id)
      let progressMap = new Map<string, { current: number; achieved: boolean }>()

      if (goalIds.length > 0) {
        const progressResult = await supabase
          .from("sales_goal_progress")
          .select("goal_id, current_amount, achieved")
          .in("goal_id", goalIds)
        if (!progressResult.error && progressResult.data) {
          for (const p of progressResult.data) {
            const existing = progressMap.get(p.goal_id) || { current: 0, achieved: true }
            existing.current += Number(p.current_amount || 0)
            if (!p.achieved) existing.achieved = false
            progressMap.set(p.goal_id, existing)
          }
        }
      }

      const goalItems = goals.map((g: any) => {
        const pg = progressMap.get(g.id)
        const current = pg?.current || 0
        const target = Number(g.target_amount || 1)
        const progressPct = Math.round((current / target) * 100)
        return {
          id: g.id,
          name: g.name,
          targetAmount: target,
          targetFormatted: brl(target),
          progress: current,
          progressPct,
          achieved: pg?.achieved || false,
        }
      })

      const totalTarget = goals.reduce((a: number, g: any) => a + Number(g.target_amount || 0), 0)
      const totalProgress = goalItems.reduce((a: number, g: any) => a + g.progress, 0)
      const overallProgress = totalTarget > 0 ? Math.round((totalProgress / totalTarget) * 100) : 0
      const achievedCount = goalItems.filter((g: any) => g.achieved).length

      return {
        goals: goalItems,
        overallProgress,
        achievedCount,
        totalCount: goals.length,
      }
    },
    [`report-goals-${partnerId}-${period}`],
    { tags: [REPORT_TAGS.visaoGeral(partnerId, period)], revalidate: 120 }
  )()
})

export async function getGoalReportData(partnerId: string, period: Period = "monthly") {
  return getCachedGoalsData(partnerId, period)
}
