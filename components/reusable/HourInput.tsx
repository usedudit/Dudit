"use client"

import React, { useEffect, useState } from "react"
import { Input } from "./Input"

interface HourInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
    value?: number | string
    onChange?: (value: number) => void
    min?: number
    max?: number
}

function formatHour(decimal: number): string {
    const totalMinutes = Math.round(decimal * 60)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function parseHourDigits(raw: string): number {
    const cleaned = raw.replace(/\D/g, "")
    if (cleaned === "") return 0
    const minutes = parseInt(cleaned.slice(-2).padStart(2, "0"), 10)
    const hours = cleaned.length > 2 ? parseInt(cleaned.slice(0, -2), 10) : 0
    return hours + minutes / 60
}

export function HourInput({ value = 0, onChange, min, max, ...props }: HourInputProps) {
    const numericVal = typeof value === 'string' ? Number(value) : value

    const [displayValue, setDisplayValue] = useState(
        numericVal > 0 ? formatHour(numericVal) : ""
    )

    useEffect(() => {
        const currentNumericValue = parseHourDigits(displayValue.replace(/\D/g, ""))
        if (numericVal !== currentNumericValue) {
            setDisplayValue(numericVal > 0 ? formatHour(numericVal) : "")
        }
    }, [numericVal, displayValue])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const inputVal = e.target.value
        const numericString = inputVal.replace(/\D/g, "")

        if (numericString === "") {
            onChange?.(0)
            setDisplayValue("")
            return
        }

        let numericValue = parseHourDigits(numericString)

        if (max !== undefined && numericValue > max) {
            numericValue = max
        }

        onChange?.(numericValue)
        setDisplayValue(formatHour(numericValue))
    }

    const handleBlur: React.FocusEventHandler<
        HTMLInputElement | HTMLTextAreaElement
    > = (e) => {
        let finalValue = numericVal
        if (min !== undefined && finalValue < min) {
            finalValue = min
            onChange?.(finalValue)
        }
        setDisplayValue(finalValue > 0 ? formatHour(finalValue) : "")
        props.onBlur?.(e)
    }

    return (
        <Input
            {...props}
            value={displayValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            inputMode="numeric"
            placeholder={props.placeholder || "00:00"}
            prefix="H"
        />
    )
}
