"use client"

import React from "react"
import { MoonIcon } from "@/lib/icons"
import { Switch } from "@/components/reusable/Switch"
import { TimePicker } from "@/components/reusable/TimePicker"
import { cn } from "@/lib/utils"

interface BusinessHoursSelectorProps {
    value: Record<string, { enabled: boolean; from: string; to: string }>
    onChange: (value: Record<string, { enabled: boolean; from: string; to: string }>) => void
    interval?: 1 | 5 | 10 | 15 | 30
}

const DAYS = [
    { key: "monday", label: "Segunda" },
    { key: "tuesday", label: "Terça" },
    { key: "wednesday", label: "Quarta" },
    { key: "thursday", label: "Quinta" },
    { key: "friday", label: "Sexta" },
    { key: "saturday", label: "Sábado" },
    { key: "sunday", label: "Domingo" },
]

export function BusinessHoursSelector({ value, onChange, interval = 5 }: BusinessHoursSelectorProps) {
    const handleToggle = (day: string, enabled: boolean) => {
        onChange({
            ...value,
            [day]: {
                ...value[day],
                enabled,
            },
        })
    }

    const handleTimeChange = (day: string, field: "from" | "to", time: string) => {
        onChange({
            ...value,
            [day]: {
                ...value[day],
                [field]: time,
            },
        })
    }

    return (
        <div className="w-full max-w-2xl space-y-3">
            {DAYS.map(({ key, label }) => {
                const dayData = value[key] || { enabled: false, from: "09:00", to: "18:00" }
                const isEnabled = dayData.enabled

                return (
                    <div key={key} className="flex items-center gap-4 py-2 group">
                        <div className="flex items-center gap-4 w-[160px] shrink-0">
                            <Switch
                                checked={isEnabled}
                                onCheckedChange={(checked) => handleToggle(key, checked)}
                            />
                            <span className={cn(
                                "text-[15px] font-bold transition-colors",
                                isEnabled ? "text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text dark:text-dark-body"
                            )}>
                                {label}
                            </span>
                        </div>

                        {isEnabled ? (
                            <div className="flex items-center gap-3 flex-1 animate-in fade-in slide-in-from-left-2 duration-300">
                                <TimePicker
                                    prefix="De"
                                    value={dayData.from}
                                    onChange={(time) => handleTimeChange(key, "from", time)}
                                    className="max-w-[160px]"
                                    interval={interval}
                                />
                                <TimePicker
                                    prefix="Até"
                                    value={dayData.to}
                                    onChange={(time) => handleTimeChange(key, "to", time)}
                                    className="max-w-[160px]"
                                    interval={interval}
                                />
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 px-6 h-[46px] bg-brand-gray/40 dark:bg-dark-border/20 rounded-xl flex-1 border border-transparent transition-all duration-300">
                                <MoonIcon className="w-4 h-4 text-brand-inactive-text/60 shrink-0" />
                                <span className="text-[14px] font-semibold text-brand-inactive-text/60">Fechado</span>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export default BusinessHoursSelector
