"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface HourInputProps {
    label?: string
    value?: string
    onChange?: (value: string) => void
    placeholder?: string
    required?: boolean
    disabled?: boolean
    error?: boolean
    errorMessage?: string
}

function parseHours(value?: string) {
    const num = Number(value || 0)
    if (!num || num < 0) return { hours: "", minutes: "" }
    const h = Math.floor(num)
    const m = Math.round((num - h) * 60)
    return { hours: String(h), minutes: String(m || 0) }
}

function toDecimal(hours: string, minutes: string): string {
    const h = Number(hours) || 0
    const m = Number(minutes) || 0
    if (h === 0 && m === 0) return ""
    return String(h + m / 60)
}

export const HourInput: React.FC<HourInputProps> = ({
    label,
    value,
    onChange,
    placeholder = "0h 0m",
    required,
    disabled,
    error,
    errorMessage,
}) => {
    const { hours, minutes } = React.useMemo(() => parseHours(value), [value])
    const [localHours, setLocalHours] = React.useState(hours)
    const [localMinutes, setLocalMinutes] = React.useState(minutes)

    React.useEffect(() => {
        const { hours: h, minutes: m } = parseHours(value)
        setLocalHours(h)
        setLocalMinutes(m)
    }, [value])

    const handleHoursChange = (val: string) => {
        const cleaned = val.replace(/\D/g, "")
        setLocalHours(cleaned)
        onChange?.(toDecimal(cleaned, localMinutes))
    }

    const handleMinutesChange = (val: string) => {
        const cleaned = val.replace(/\D/g, "").slice(0, 2)
        setLocalMinutes(cleaned)
        onChange?.(toDecimal(localHours, cleaned))
    }

    const handleHoursBlur = () => {
        if (localMinutes && !localHours) {
            setLocalHours("0")
            onChange?.(toDecimal("0", localMinutes))
        }
    }

    return (
        <div className="flex-1 w-full">
            {label && (
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                        {label}
                        {required && <span className="text-brand-red"> *</span>}
                    </label>
                </div>
            )}
            <div
                className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors duration-150 bg-brand-gray dark:bg-dark-border/30",
                    error
                        ? "border-brand-red"
                        : "border-brand-border dark:border-dark-border",
                    disabled && "cursor-not-allowed opacity-50"
                )}
            >
                <input
                    type="text"
                    inputMode="numeric"
                    value={localHours}
                    onChange={(e) => handleHoursChange(e.target.value)}
                    onBlur={handleHoursBlur}
                    placeholder="0"
                    disabled={disabled}
                    className="w-12 bg-transparent text-sm font-medium text-brand-dark dark:text-dark-heading text-right outline-none disabled:cursor-not-allowed"
                />
                <span className="text-sm text-brand-inactive-text">h</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={localMinutes}
                    onChange={(e) => handleMinutesChange(e.target.value)}
                    placeholder="00"
                    disabled={disabled}
                    className="w-10 bg-transparent text-sm font-medium text-brand-dark dark:text-dark-heading text-right outline-none disabled:cursor-not-allowed"
                />
                <span className="text-sm text-brand-inactive-text">min</span>
            </div>
            {error && errorMessage && (
                <p className="mt-1.5 text-xs font-medium text-brand-red animate-in slide-in-from-top-1 duration-200">
                    {errorMessage}
                </p>
            )}
        </div>
    )
}
