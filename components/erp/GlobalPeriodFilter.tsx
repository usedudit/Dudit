"use client"

import { useState, useCallback } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button, Dropdown, DropdownItem } from "@/components/reusable"
import type { Period, CompareMode } from "@/lib/period-types"
import { PERIOD_LABELS, COMPARE_PRESET_LABELS, PERIOD_OPTIONS, COMPARE_PRESETS, getPeriodDateRange, getCustomMaxDate } from "@/lib/period-types"
import { FilterIcon, SparklesIcon, DownloadIcon } from "@/lib/icons"
import { useDashboard } from "./dashboard/DashboardContext"
import Portal from "@/components/Portal"
import { XIcon } from "@/lib/icons"

function DashboardInsight({ message, color }: { message: string; color: string }) {
  const colors: Record<string, { bg: string; text: string; bar: string; border: string }> = {
    green: { bg: "bg-[#ecfdf5] dark:bg-emerald-900/20", text: "text-emerald-900 dark:text-emerald-100", bar: "bg-emerald-500", border: "border-emerald-100 dark:border-emerald-900/30" },
    red: { bg: "bg-red-50 dark:bg-red-900/10", text: "text-red-700 dark:text-red-300/80", bar: "bg-red-400", border: "border-red-100 dark:border-red-900/30" },
    orange: { bg: "bg-[#fff7ed] dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-300/80", bar: "bg-orange-500", border: "border-orange-100 dark:border-orange-900/30" },
    blue: { bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-300/80", bar: "bg-blue-500", border: "border-blue-100 dark:border-blue-900/30" },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`${c.bg} ${c.border} rounded-xl px-4 py-4 border transition-all duration-200 hover:scale-[1.01] hover:shadow-xs`}>
      <div className="flex gap-3 items-start">
        <div className={`${c.bar} w-1.5 rounded-full self-stretch shrink-0 min-h-6`} />
        <p className={`text-[14px] font-semibold leading-relaxed ${c.text}`}>{message}</p>
      </div>
    </div>
  )
}

export function GlobalPeriodFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { insights, exportHandler } = useDashboard()
  const [insightSheetOpen, setInsightSheetOpen] = useState(false)

  const period = (searchParams.get("period") as Period) || "monthly"
  const compare = (searchParams.get("compare") as CompareMode) || "none"
  const compareFrom = searchParams.get("compareFrom") || ""
  const compareTo = searchParams.get("compareTo") || ""

  const updateParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const handleCompareSelect = (mode: CompareMode) => {
    if (mode === "custom") {
      const { from } = getPeriodDateRange(period, new Date().toISOString().slice(0, 10))
      const today = new Date().toISOString().slice(0, 10)
      const maxDate = getCustomMaxDate(period, today)
      updateParams({ compare: "custom", compareFrom: maxDate, compareTo: from ? addDaysLocal(from, -1) : maxDate })
    } else {
      updateParams({ compare: mode, compareFrom: "", compareTo: "" })
    }
  }

  const handleCustomDateChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  const maxDate = getCustomMaxDate(period, new Date().toISOString().slice(0, 10))

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      {insights && insights.length > 0 && (
        <>
          <Button variant="outline" size="icon" onClick={() => setInsightSheetOpen(true)}>
            <SparklesIcon size={14} />
          </Button>

          {insightSheetOpen && (
            <Portal>
              <div
                className="fixed inset-0 bg-black/50 z-50 transition-opacity duration-300"
                onClick={() => setInsightSheetOpen(false)}
              >
                <div
                  className="fixed right-4 top-4 bottom-4 w-96 bg-white dark:bg-dark-surface shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                        <SparklesIcon size={18} className="text-brand-green dark:text-emerald-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Insights de Desempenho</h2>
                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">Análises automáticas sobre os seus resultados.</p>
                      </div>
                    </div>
                    <Button variant="filled" size="icon" onClick={() => setInsightSheetOpen(false)}>
                      <XIcon className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
                    {insights.map((insight, i) => (
                      <DashboardInsight key={i} message={insight.message} color={insight.color} />
                    ))}
                  </div>
                </div>
              </div>
            </Portal>
          )}
        </>
      )}

      <Button variant="outline" size="icon" onClick={() => exportHandler?.("csv")} disabled={!exportHandler}>
        <DownloadIcon size={14} />
      </Button>

      <div className="flex items-center border border-brand-border dark:border-dark-border rounded-full overflow-hidden">
        <Dropdown
          align="left"
          width="w-44"
          trigger={
            <button className="flex items-center gap-1.5 text-[13px] font-bold text-brand-dark dark:text-dark-heading pl-4 pr-3 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors whitespace-nowrap cursor-pointer">
              {PERIOD_LABELS[period]}
            </button>
          }
        >
          {PERIOD_OPTIONS.map((p) => (
            <DropdownItem key={p} onClick={() => {
              updateParams({ period: p, compare: "", compareFrom: "", compareTo: "" })
            }}>
              {PERIOD_LABELS[p]}
            </DropdownItem>
          ))}
        </Dropdown>
        <div className="w-px h-5 bg-brand-border dark:bg-dark-border" />
        <Dropdown
          align="right"
          width="w-52"
          showChevron={false}
          trigger={
            <button className="flex items-center justify-center w-9 h-9 rounded-full p-0 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors cursor-pointer text-brand-dark dark:text-dark-heading">
              <FilterIcon size={14} />
            </button>
          }
        >
          {COMPARE_PRESETS.map((c) => (
            <DropdownItem key={c} onClick={() => handleCompareSelect(c)}>
              {COMPARE_PRESET_LABELS[c]}
            </DropdownItem>
          ))}
        </Dropdown>
      </div>

      {compare === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={compareFrom}
            max={maxDate}
            onChange={(e) => handleCustomDateChange("compareFrom", e.target.value)}
            className="h-8 px-2 text-xs font-medium border border-brand-border dark:border-dark-border rounded-[8px] bg-transparent text-brand-dark dark:text-dark-heading"
          />
          <span className="text-[11px] text-brand-inactive-text">até</span>
          <input
            type="date"
            value={compareTo}
            max={maxDate}
            onChange={(e) => handleCustomDateChange("compareTo", e.target.value)}
            className="h-8 px-2 text-xs font-medium border border-brand-border dark:border-dark-border rounded-[8px] bg-transparent text-brand-dark dark:text-dark-heading"
          />
        </div>
      )}
    </div>
  )
}

function addDaysLocal(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10)
}
