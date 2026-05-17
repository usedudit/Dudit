"use client"

import { useState } from "react"
import { Dropdown, DropdownItem } from "@/components/reusable/Dropdown"

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

  const getLabel = (p: Period) => {
    switch (p) {
        case "daily": return "Hoje"
        case "weekly": return "Últimos 7 dias"
        case "monthly": return "Este Mês"
        default: return "Este Mês"
    }
  }

  return (
    <Dropdown
      align="right"
      width="w-40"
      trigger={
        <button className="w-[130px] h-8 px-3 text-xs font-medium bg-transparent border border-brand-border dark:border-dark-border rounded-[8px] text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border/50 transition-colors text-left">
          {getLabel(active)}
        </button>
      }
    >
      <DropdownItem onClick={() => handleSelect("daily")}>Hoje</DropdownItem>
      <DropdownItem onClick={() => handleSelect("weekly")}>Últimos 7 dias</DropdownItem>
      <DropdownItem onClick={() => handleSelect("monthly")}>Este Mês</DropdownItem>
    </Dropdown>
  )
}
