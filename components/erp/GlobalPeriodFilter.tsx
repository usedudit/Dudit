"use client"

import { useState, useCallback } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button, Dropdown, DropdownItem, InfoCard } from "@/components/reusable"
import type { Period, CompareMode } from "@/lib/period-types"
import { PERIOD_LABELS, COMPARE_PRESET_LABELS, PERIOD_OPTIONS, COMPARE_PRESETS, getPeriodDateRange, getCustomMaxDate } from "@/lib/period-types"
import { FilterIcon, SparklesIcon, DownloadIcon, XIcon, ChevronDownIcon } from "@/lib/icons"
import { useDashboard } from "./dashboard/DashboardContext"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"

export function GlobalPeriodFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { insights, exportHandler } = useDashboard()
  const [insightSheetOpen, setInsightSheetOpen] = useState(false)
  const isMobile = useMediaQuery("(max-width: 1023px)")
  // z-index dinâmico: este sheet abre acima de tudo que já estava aberto.
  const insightSheetZIndex = useModalLayer(insightSheetOpen)

  const rawPeriod = searchParams.get("period") as Period
  const period: Period = rawPeriod === "daily" || rawPeriod === "weekly" || rawPeriod === "monthly" ? rawPeriod : "monthly"
  const compare = (searchParams.get("compare") as CompareMode) || "none"
  const compareFrom = searchParams.get("compareFrom") || ""
  const compareTo = searchParams.get("compareTo") || ""

  const updateParams = useCallback((updates: Record<string, string>) => {
    const currentSearch = typeof window !== "undefined" && window.location.search
      ? window.location.search
      : searchParams.toString()
    const params = new URLSearchParams(currentSearch)
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const query = params.toString()
    const target = query ? `${pathname}?${query}` : pathname
    router.push(target)
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
    updateParams({ [key]: value })
  }

  const maxDate = getCustomMaxDate(period, new Date().toISOString().slice(0, 10))

  const insightsContent = (
    <div className="space-y-4">
      {insights && insights.map((insight, i) => (
        <InfoCard key={i} message={insight.message} color={insight.color as "green" | "red" | "orange" | "blue"} className="rounded-2xl p-4 font-semibold text-[14px] leading-relaxed" />
      ))}
    </div>
  )

  return (
    <div className="min-w-0 -mx-4 px-4 md:mx-0 md:px-0 xl:w-fit xl:max-w-full">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {insights && insights.length > 0 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setInsightSheetOpen(true)}
                aria-label="Ver insights de desempenho"
                title="Insights"
              >
                <SparklesIcon size={14} />
              </Button>

              {isMobile ? (
                <BottomSheet isOpen={insightSheetOpen} onClose={() => setInsightSheetOpen(false)} title="Insights de Desempenho">
                  <div className="pt-2 pb-4">
                    {insightsContent}
                  </div>
                </BottomSheet>
              ) : (
                <Portal>
                  <div
                    className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${insightSheetOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    style={{ zIndex: insightSheetZIndex }}
                    onClick={() => setInsightSheetOpen(false)}
                  >
                    <div
                      className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${insightSheetOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
                        <header className="flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                          <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Insights de Desempenho</h2>
                          <Button variant="filled" onClick={() => setInsightSheetOpen(false)} size="icon">
                            <XIcon className="h-5 w-5" />
                          </Button>
                        </header>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                          {insightsContent}
                        </div>
                      </div>
                    </div>
                  </div>
                </Portal>
              )}
            </>
          )}

          <Dropdown
            align="right"
            width="w-40"
            showChevron={false}
            fullWidth={false}
            className="inline-block w-fit shrink-0"
            trigger={
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={!exportHandler}
                aria-label="Exportar relatório"
                title="Exportar"
              >
                <DownloadIcon size={14} />
              </Button>
            }
          >
            <DropdownItem onClick={() => exportHandler?.("xlsx")}>Excel (.xlsx)</DropdownItem>
            <DropdownItem onClick={() => exportHandler?.("csv")}>CSV (.csv)</DropdownItem>
          </Dropdown>
        </div>

        <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-full border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface xl:w-[260px] xl:flex-none">
          <Dropdown
            align="left"
            width="w-44"
            showChevron={false}
            className="min-w-0 flex-1"
            trigger={
              <button
                type="button"
                className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-l-full pl-4 pr-3 text-[13px] font-bold text-brand-dark transition-colors hover:bg-brand-green-light dark:text-dark-heading dark:hover:bg-dark-border cursor-pointer"
              >
                <span className="truncate">{PERIOD_LABELS[period]}</span>
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-brand-inactive-text dark:text-dark-body" />
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
          <div className="h-5 w-px shrink-0 bg-brand-border dark:bg-dark-border" />
          <Dropdown
            align="right"
            width="w-52"
            showChevron={false}
            className="shrink-0"
            trigger={
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0 text-brand-dark transition-colors hover:bg-brand-green-light dark:text-dark-heading dark:hover:bg-dark-border cursor-pointer"
                aria-label="Comparar com outro período"
                title="Comparar período"
              >
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
      </div>

      {compare === "custom" && (
        <div className="mt-2 grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 xl:flex xl:w-fit xl:justify-end">
          <input
            type="date"
            value={compareFrom}
            max={maxDate}
            onChange={(e) => handleCustomDateChange("compareFrom", e.target.value)}
            className="h-8 w-full min-w-0 rounded-[8px] border border-brand-border bg-transparent px-2 text-xs font-medium text-brand-dark dark:border-dark-border dark:text-dark-heading sm:w-[9.5rem]"
            aria-label="Data inicial do período de comparação"
          />
          <span className="text-[11px] text-brand-inactive-text">até</span>
          <input
            type="date"
            value={compareTo}
            max={maxDate}
            onChange={(e) => handleCustomDateChange("compareTo", e.target.value)}
            className="h-8 w-full min-w-0 rounded-[8px] border border-brand-border bg-transparent px-2 text-xs font-medium text-brand-dark dark:border-dark-border dark:text-dark-heading sm:w-[9.5rem]"
            aria-label="Data final do período de comparação"
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
