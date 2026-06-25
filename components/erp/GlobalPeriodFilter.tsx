"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Dropdown, DropdownItem } from "@/components/reusable/Dropdown"
import type { Period, CompareMode } from "@/lib/period-types"
import { PERIOD_LABELS, COMPARE_LABELS, PERIOD_OPTIONS, COMPARE_OPTIONS } from "@/lib/period-types"

export function GlobalPeriodFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const period = (searchParams.get("period") as Period) || "monthly"
  const compare = (searchParams.get("compare") as CompareMode) || "previous"

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-3">
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
          <DropdownItem key={p} onClick={() => updateParams("period", p)}>
            {PERIOD_LABELS[p]}
          </DropdownItem>
        ))}
      </Dropdown>

      <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">vs</span>

      <Dropdown
        align="right"
        width="w-44"
        trigger={
          <button className="flex items-center text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors whitespace-nowrap">
            {COMPARE_LABELS[compare]}
          </button>
        }
      >
        {COMPARE_OPTIONS.map((c) => (
          <DropdownItem key={c} onClick={() => updateParams("compare", c)}>
            {COMPARE_LABELS[c]}
          </DropdownItem>
        ))}
      </Dropdown>
    </div>
  )
}
