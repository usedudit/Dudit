"use client"

import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type Period = "daily" | "weekly" | "monthly"

export function PeriodSelector({ 
  onChange, 
  initial = "monthly" 
}: { 
  onChange?: (period: Period) => void
  initial?: Period
}) {
  const [active, setActive] = useState<Period>(initial)

  const handleSelect = (period: string) => {
    const p = period as Period
    setActive(p)
    onChange?.(p)
  }

  return (
    <Select value={active} onValueChange={handleSelect}>
      <SelectTrigger className="w-[130px] h-8 bg-transparent border-brand-border dark:border-dark-border text-xs font-medium rounded-[8px]">
        <SelectValue placeholder="Selecione o período" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="daily">Hoje</SelectItem>
        <SelectItem value="weekly">Últimos 7 dias</SelectItem>
        <SelectItem value="monthly">Este Mês</SelectItem>
      </SelectContent>
    </Select>
  )
}
