"use client"

import React from "react"
import { Input } from "../Input"
import {
    formatBrazilMobile,
    getPhoneDigits,
    isValidBrazilMobile,
} from "@/lib/utils/phone-utils"

type PhoneInputProps = React.ComponentProps<typeof Input>

const PHONE_PATTERN = "\\(\\d{2}\\)\\s\\d{5}-\\d{4}"
const PHONE_ERROR_MESSAGE = "Informe um celular no formato (XX) XXXXX-XXXX."

export function PhoneInput({ onChange, value, ...props }: PhoneInputProps) {
    const validatePhone = (
        target: HTMLInputElement | HTMLTextAreaElement,
        phoneValue: string
    ) => {
        const digits = getPhoneDigits(phoneValue)
        const isEmpty = digits.length === 0

        if (isEmpty) {
            target.setCustomValidity("")
            return
        }

        target.setCustomValidity(
            isValidBrazilMobile(digits) ? "" : PHONE_ERROR_MESSAGE
        )
    }

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const digits = getPhoneDigits(e.target.value)
        const formatted = formatBrazilMobile(digits)

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
            value={typeof value === "string" ? formatBrazilMobile(value) : value}
            onChange={handleChange}
            onBlur={handleBlur}
            inputMode="numeric"
            placeholder={props.placeholder || "(11) 99876-5432"}
            maxLength={15}
            pattern={props.pattern || PHONE_PATTERN}
            title={props.title || PHONE_ERROR_MESSAGE}
        />
    )
}
