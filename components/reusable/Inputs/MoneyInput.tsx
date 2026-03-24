"use client"

import React, { useEffect, useState } from "react"
import { Input } from "../Input"

interface MoneyInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
    value?: number | string
    onChange?: (value: number) => void
}

export function MoneyInput({ value = 0, onChange, ...props }: MoneyInputProps) {
    const numericVal = typeof value === 'string' ? Number(value) : value

    const [displayValue, setDisplayValue] = useState(
        numericVal > 0 ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(numericVal) : ""
    )

    useEffect(() => {
        const currentNumericValue = Number(displayValue.replace(/\./g, "").replace(",", "."))
        if (numericVal !== currentNumericValue) {
            setDisplayValue(numericVal > 0 ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(numericVal) : "")
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

        const numericValue = Number(numericString) / 100
        onChange?.(numericValue)
        setDisplayValue(new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(numericValue))
    }

    const handleBlur = () => {
        setDisplayValue(numericVal > 0 ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(numericVal) : "")
        props.onBlur?.()
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
