"use client"

import { useState, useCallback } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Dropdown, DropdownItem } from "@/components/reusable/Dropdown"
import type { Period, CompareMode } from "@/lib/period-types"
import { PERIOD_LABELS, COMPARE_PRESET_LABELS, PERIOD_OPTIONS, COMPARE_PRESETS, getPeriodDateRange, getCustomMaxDate } from "@/lib/period-types"
import { Sparkles } from "lucide-react"
import { useDashboard } from "./dashboard/DashboardContext"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

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
  const { insights } = useDashboard()

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

  const compareLabel = compare === "none"
    ? "Comparar"
    : compare === "custom"
      ? `${compareFrom || "..."} - ${compareTo || "..."}`
      : COMPARE_PRESET_LABELS[compare] || "Comparar"

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      {insights && insights.length > 0 && (
        <Sheet>
          <SheetTrigger asChild>
            <button className="flex items-center gap-2 text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors whitespace-nowrap cursor-pointer">
              <div className="w-5 h-5 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                <Sparkles size={12} className="text-brand-green dark:text-emerald-400" />
              </div>
              <span>Insights</span>
              <span className="bg-brand-green text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                {insights.length}
              </span>
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md p-6 border-l border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
            <SheetHeader className="pb-6 border-b border-brand-border/40 dark:border-dark-border/40">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                  <Sparkles size={18} className="text-brand-green dark:text-emerald-400" />
                </div>
                <div>
                  <SheetTitle className="text-xl font-bold text-brand-dark dark:text-dark-heading">Insights de Desempenho</SheetTitle>
                  <SheetDescription className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">Análises automáticas sobre os seus resultados.</SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="mt-6 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)] pr-1">
              {insights.map((insight, i) => (
                <DashboardInsight key={i} message={insight.message} color={insight.color} />
              ))}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <Dropdown
        align="right"
        width="w-44"
        trigger={
          <button className="flex items-center text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors whitespace-nowrap">
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

      <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">vs</span>

      <Dropdown
        align="right"
        width="w-52"
        trigger={
          <button className="flex items-center text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors whitespace-nowrap">
            {compareLabel}
          </button>
        }
      >
        {COMPARE_PRESETS.map((c) => (
          <DropdownItem key={c} onClick={() => handleCompareSelect(c)}>
            {COMPARE_PRESET_LABELS[c]}
          </DropdownItem>
        ))}
      </Dropdown>

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