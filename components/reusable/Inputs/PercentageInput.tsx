"use client"

import React, { useEffect, useState } from "react"
import { Input } from "../Input"

interface PercentageInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
    value?: number | string
    onChange?: (value: number) => void
}

export function PercentageInput({ value = 0, onChange, ...props }: PercentageInputProps) {
    const numericVal = typeof value === 'string' ? Number(value) : value

    const [displayValue, setDisplayValue] = useState(
        numericVal > 0 ? numericVal.toString() : ""
    )

    useEffect(() => {
        if (numericVal !== Number(displayValue)) {
            setDisplayValue(numericVal > 0 ? numericVal.toString() : "")
        }
    }, [numericVal, displayValue])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const inputVal = e.target.value
        const numericString = inputVal.replace(/[^\d.]/g, "")

        if (numericString === "") {
            onChange?.(0)
            setDisplayValue("")
            return
        }

        // Allow only one decimal point
        const parts = numericString.split(".")
        const cleanValue = parts[0] + (parts.length > 1 ? "." + parts[1] : "")
        
        const numericValue = parseFloat(cleanValue)
        
        if (!isNaN(numericValue)) {
            // Cap at 100%? Usually yes for percentages in this context
            const cappedValue = Math.min(100, numericValue)
            onChange?.(cappedValue)
            setDisplayValue(cappedValue.toString())
        }
    }

    const handleBlur = () => {
        setDisplayValue(numericVal > 0 ? numericVal.toString() : "")
        props.onBlur?.()
    }

    return (
        <Input
            {...props}
            value={displayValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            inputMode="decimal"
            placeholder={props.placeholder || "0"}
            suffix={props.suffix || <span className="text-brand-inactive-text dark:text-dark-body text-sm font-medium">%</span>}
        />
    )
}
