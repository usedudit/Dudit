"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

export type Period = "daily" | "weekly" | "monthly"

export function PeriodSelector({ 
  onChange, 
  initial = "monthly" 
}: { 
  onChange?: (period: Period) => void
  initial?: Period
}) {
  const [active, setActive] = useState<Period>(initial)

  const handleSelect = (period: Period) => {
    setActive(period)
    onChange?.(period)
  }

  const periods: { value: Period; label: string }[] = [
    { value: "daily", label: "Diário" },
    { value: "weekly", label: "Semanal" },
    { value: "monthly", label: "Mensal" },
  ]

  return (
    <div className="flex items-center rounded-lg border border-brand-border p-1 dark:border-dark-border">
      {periods.map((p) => (
        <button
          key={p.value}
          onClick={() => handleSelect(p.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-bold transition-all",
            active === p.value
              ? "bg-brand-dark text-white dark:bg-white dark:text-brand-dark"
              : "text-brand-inactive-text hover:text-brand-dark dark:text-dark-body dark:hover:text-white"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
