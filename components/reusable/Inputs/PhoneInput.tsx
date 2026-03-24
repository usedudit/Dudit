"use client"

import React from "react"
import { Input } from "../Input"
import { formatBrazilMobile, getPhoneDigits } from "@/lib/utils/phone-utils"

type PhoneInputProps = React.ComponentProps<typeof Input>

export function PhoneInput({ onChange, value, ...props }: PhoneInputProps) {
    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const digits = getPhoneDigits(e.target.value)
        const formatted = formatBrazilMobile(digits)

        e.target.value = formatted
        onChange?.(e)
    }

    return (
        <Input
            {...props}
            type="tel"
            value={typeof value === "string" ? formatBrazilMobile(value) : value}
            onChange={handleChange}
            inputMode="numeric"
            placeholder={props.placeholder || "(11) 99876-5432"}
            maxLength={15}
        />
    )
}