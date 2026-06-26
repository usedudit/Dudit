"use client"

import { useState, useCallback } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Dropdown, DropdownItem } from "@/components/reusable/Dropdown"
import type { Period, CompareMode } from "@/lib/period-types"
import { PERIOD_LABELS, COMPARE_PRESET_LABELS, PERIOD_OPTIONS, COMPARE_PRESETS, getPeriodDateRange, getCustomMaxDate } from "@/lib/period-types"

export function GlobalPeriodFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

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
      ? `${compareFrom || "..."} — ${compareTo || "..."}`
      : COMPARE_PRESET_LABELS[compare] || "Comparar"

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
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