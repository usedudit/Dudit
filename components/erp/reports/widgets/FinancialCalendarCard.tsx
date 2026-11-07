"use client"

import { useState, useMemo } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons"
import { formatCurrency as brl } from "@/lib/utils"

interface DailyMovement {
    income: number
    expense: number
    net: number
}

interface FinancialCalendarCardProps {
    dailyMovements?: Record<string, DailyMovement>
    className?: string
}

function formatCalendarCompact(value: number): string {
    const abs = Math.abs(value)
    const sign = value > 0 ? "+" : "-"
    if (abs >= 1_000_000) {
        const formatted = (abs / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })
        return `R$ ${sign}${formatted}M`
    }
    if (abs >= 1_000) {
        const formatted = (abs / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })
        return `R$ ${sign}${formatted}k`
    }
    return `R$ ${sign}${Math.round(abs)}`
}

function capitalizeFirst(str: string) {
    if (!str) return ""
    return str.charAt(0).toUpperCase() + str.slice(1)
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export function FinancialCalendarCard({ dailyMovements = {}, className = "" }: FinancialCalendarCardProps) {
    const [currentDate, setCurrentDate] = useState(() => new Date())

    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const monthLabel = useMemo(() => {
        const formatted = currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
        return capitalizeFirst(formatted)
    }, [currentDate])

    const handlePrevMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    }

    const handleNextMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    }

    const calendarGrid = useMemo(() => {
        const firstDayOfMonth = new Date(year, month, 1)
        const firstDayOfWeek = firstDayOfMonth.getDay() // 0 = Dom, 1 = Seg, ...
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const daysInPrevMonth = new Date(year, month, 0).getDate()

        const cells = []

        // 1. Padding days from previous month
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i
            const prevMonthDate = new Date(year, month - 1, dayNum)
            const y = prevMonthDate.getFullYear()
            const m = String(prevMonthDate.getMonth() + 1).padStart(2, "0")
            const d = String(dayNum).padStart(2, "0")
            const dateStr = `${y}-${m}-${d}`

            cells.push({
                dayNum,
                dateStr,
                isPadding: true,
                movement: dailyMovements[dateStr] || null,
            })
        }

        // 2. Days of current month
        for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
            const m = String(month + 1).padStart(2, "0")
            const d = String(dayNum).padStart(2, "0")
            const dateStr = `${year}-${m}-${d}`

            cells.push({
                dayNum,
                dateStr,
                isPadding: false,
                movement: dailyMovements[dateStr] || null,
            })
        }

        // 3. Padding days from next month to complete the 7-column rows
        const remainder = cells.length % 7
        if (remainder > 0) {
            const daysToAdd = 7 - remainder
            for (let dayNum = 1; dayNum <= daysToAdd; dayNum++) {
                const nextMonthDate = new Date(year, month + 1, dayNum)
                const y = nextMonthDate.getFullYear()
                const m = String(nextMonthDate.getMonth() + 1).padStart(2, "0")
                const d = String(dayNum).padStart(2, "0")
                const dateStr = `${y}-${m}-${d}`

                cells.push({
                    dayNum,
                    dateStr,
                    isPadding: true,
                    movement: dailyMovements[dateStr] || null,
                })
            }
        }

        return cells
    }, [year, month, dailyMovements])

    const todayStr = useMemo(() => {
        const t = new Date()
        return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
    }, [])

    return (
        <div className={`bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between h-full ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                    Calendário Financeiro
                </h3>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handlePrevMonth}
                        aria-label="Mês anterior"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-brand-dark dark:text-dark-heading hover:bg-brand-gray/60 dark:hover:bg-dark-border/60 transition-colors"
                    >
                        <ChevronLeftIcon size={18} />
                    </button>
                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading min-w-[100px] text-center select-none">
                        {monthLabel}
                    </span>
                    <button
                        type="button"
                        onClick={handleNextMonth}
                        aria-label="Próximo mês"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-brand-dark dark:text-dark-heading hover:bg-brand-gray/60 dark:hover:bg-dark-border/60 transition-colors"
                    >
                        <ChevronRightIcon size={18} />
                    </button>
                </div>
            </div>

            {/* Weekdays Header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {WEEKDAYS.map((w, idx) => (
                    <div key={idx} className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body py-1 select-none">
                        {w}
                    </div>
                ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 flex-1">
                {calendarGrid.map((cell, idx) => {
                    const isToday = cell.dateStr === todayStr
                    const net = cell.movement?.net || 0
                    const hasMovement = Boolean(net && net !== 0)
                    const isPositive = net > 0

                    if (cell.isPadding) {
                        return (
                            <div
                                key={idx}
                                className="bg-[#f8fafc] dark:bg-dark-border/20 rounded-[14px] p-1.5 flex flex-col items-center justify-center min-h-[56px] select-none"
                            >
                                <span className="text-[13px] font-medium text-brand-inactive-text/50 dark:text-dark-body/40">
                                    {cell.dayNum}
                                </span>
                            </div>
                        )
                    }

                    return (
                        <div
                            key={idx}
                            title={
                                cell.movement
                                    ? `Data: ${cell.dayNum}/${month + 1}/${year}\nEntradas: ${brl(cell.movement.income)}\nSaídas: ${brl(cell.movement.expense)}\nResultado: ${net >= 0 ? "+" : ""}${brl(net)}`
                                    : `Data: ${cell.dayNum}/${month + 1}/${year}`
                            }
                            className={`p-1.5 flex flex-col items-center justify-start min-h-[56px] rounded-[14px] transition-colors relative cursor-default ${isToday
                                ? "bg-brand-green-light/40 dark:bg-dark-border/40 ring-1 ring-brand-green/30"
                                : "hover:bg-brand-gray/30 dark:hover:bg-dark-border/30"
                                }`}
                        >
                            <span
                                className={`text-[13px] font-semibold leading-tight ${isToday
                                    ? "text-brand-green font-bold"
                                    : "text-brand-dark dark:text-dark-heading"
                                    }`}
                            >
                                {cell.dayNum}
                            </span>

                            {hasMovement ? (
                                <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap mt-1 ${isPositive
                                        ? "bg-[#d1fae5] dark:bg-emerald-950/60 text-[#79c325] dark:text-emerald-300"
                                        : "bg-[#ffe4e6] dark:bg-rose-950/60 text-[#e11d48] dark:text-rose-300"
                                        }`}
                                >
                                    {formatCalendarCompact(net)}
                                </span>
                            ) : (
                                <div className="h-[18px]" />
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
