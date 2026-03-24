"use client"

import React from "react"
import { Input } from "../Input"

type CpfCnpjInputProps = React.ComponentProps<typeof Input>

export function CpfCnpjInput({ onChange, value, ...props }: CpfCnpjInputProps) {
    const formatDocument = (val: string) => {
        let rawValue = val.replace(/\D/g, "")
        if (rawValue.length > 14) rawValue = rawValue.slice(0, 14)

        if (rawValue.length <= 11) {
            rawValue = rawValue.replace(/(\d{3})(\d)/, "$1.$2")
            rawValue = rawValue.replace(/(\d{3})(\d)/, "$1.$2")
            rawValue = rawValue.replace(/(\d{3})(\d{1,2})$/, "$1-$2")
            return rawValue
        } else {
            rawValue = rawValue.replace(/^(\d{2})(\d)/, "$1.$2")
            rawValue = rawValue.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
            rawValue = rawValue.replace(/\.(\d{3})(\d)/, ".$1/$2")
            rawValue = rawValue.replace(/(\d{4})(\d)/, "$1-$2")
            return rawValue
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const formatted = formatDocument(e.target.value)
        e.target.value = formatted
        onChange?.(e)
    }

    return (
        <Input
            {...props}
            value={typeof value === 'string' ? formatDocument(value) : value}
            onChange={handleChange}
            inputMode="numeric"
            placeholder={props.placeholder || "000.000.000-00"}
            maxLength={18}
        />
    )
}
