"use client"

import React from "react"
import { Input } from "../Input"
import {
    formatBrazilLandline,
    getPhoneDigits,
    isValidBrazilLandline,
} from "@/lib/utils/phone-utils"

type FixedPhoneInputProps = React.ComponentProps<typeof Input>

const FIXED_PHONE_PATTERN = "\\(\\d{2}\\)\\s\\d{4}-\\d{4}"
const FIXED_PHONE_ERROR_MESSAGE = "Informe um telefone fixo no formato (XX) XXXX-XXXX."

export function FixedPhoneInput({ onChange, value, ...props }: FixedPhoneInputProps) {
    const validatePhone = (
        target: HTMLInputElement | HTMLTextAreaElement,
        phoneValue: string
    ) => {
        const digits = getPhoneDigits(phoneValue)

        if (digits.length === 0) {
            target.setCustomValidity("")
            return
        }

        target.setCustomValidity(
            isValidBrazilLandline(digits) ? "" : FIXED_PHONE_ERROR_MESSAGE
        )
    }

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const digits = getPhoneDigits(e.target.value)
        const formatted = formatBrazilLandline(digits)

        e.target.value = formatted
        validatePhone(e.target, formatted)
        onChange?.(e)
    }

    const handleBlur: React.FocusEventHandler<
        HTMLInputElement | HTMLTextAreaElement
    > = (e) => {
        validatePhone(e.target, e.target.value)
        props.onBlur?.(e)
    }

    return (
        <Input
            {...props}
            type="tel"
            value={typeof value === "string" ? formatBrazilLandline(value) : value}
            onChange={handleChange}
            onBlur={handleBlur}
            inputMode="numeric"
            placeholder={props.placeholder || "(11) 3456-7890"}
            maxLength={14}
            pattern={props.pattern || FIXED_PHONE_PATTERN}
            title={props.title || FIXED_PHONE_ERROR_MESSAGE}
        />
    )
}
