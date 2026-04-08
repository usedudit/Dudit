"use client"

import React, { useEffect, useState } from "react"
import { Input } from "../Input"
import { formatNumber } from "@/lib/utils";

interface MoneyInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
    value?: number | string
    onChange?: (value: number) => void
    min?: number
    max?: number
}

export function MoneyInput({ value = 0, onChange, min, max, ...props }: MoneyInputProps) {
    const numericVal = typeof value === 'string' ? Number(value) : value

    const [displayValue, setDisplayValue] = useState(
        numericVal > 0 ? formatNumber(numericVal) : ""
    )

    useEffect(() => {
        const currentNumericValue = Number(displayValue.replace(/\./g, "").replace(",", "."))
        if (numericVal !== currentNumericValue) {
            setDisplayValue(numericVal > 0 ? formatNumber(numericVal) : "")
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


        let numericValue = Number(numericString) / 100

        if (max !== undefined && numericValue > max) {
            numericValue = max
        }

        onChange?.(numericValue)
        setDisplayValue(formatNumber(numericValue))
    }

    const handleBlur: React.FocusEventHandler<
        HTMLInputElement | HTMLTextAreaElement
    > = (e) => {
        let finalValue = numericVal
        if (min !== undefined && finalValue < min) {
            finalValue = min
            onChange?.(finalValue)
        }
        setDisplayValue(finalValue > 0 ? formatNumber(finalValue) : "")
        props.onBlur?.(e)
    }

    return (
        <Input
            {...props}
            value={displayValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            inputMode="decimal"
            placeholder={props.placeholder || "0,00"}
            prefix={props.prefix || "R$"}
        />
    )
}
