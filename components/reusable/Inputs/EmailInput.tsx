"use client"

import React from "react"
import { Input } from "../Input"

type EmailInputProps = React.ComponentProps<typeof Input>

const EMAIL_PATTERN = "[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}"
const EMAIL_ERROR_MESSAGE = "Informe um e-mail valido, como nome@exemplo.com."

export function EmailInput({ onChange, value, ...props }: EmailInputProps) {
    const validateEmail = (
        target: HTMLInputElement | HTMLTextAreaElement,
        emailValue: string
    ) => {
        const normalizedEmail = emailValue.trim().toLowerCase()
        const isEmpty = normalizedEmail.length === 0

        if (isEmpty) {
            target.setCustomValidity("")
            return
        }

        const isValidEmail = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(
            normalizedEmail
        )

        target.setCustomValidity(isValidEmail ? "" : EMAIL_ERROR_MESSAGE)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        e.target.value = e.target.value.trim().toLowerCase()
        validateEmail(e.target, e.target.value)
        onChange?.(e)
    }

    const handleBlur: React.FocusEventHandler<
        HTMLInputElement | HTMLTextAreaElement
    > = (e) => {
        e.target.value = e.target.value.trim().toLowerCase()
        validateEmail(e.target, e.target.value)
        props.onBlur?.(e)
    }

    return (
        <Input
            {...props}
            type="email"
            value={typeof value === "string" ? value.trim().toLowerCase() : value}
            onChange={handleChange}
            onBlur={handleBlur}
            inputMode="email"
            placeholder={props.placeholder || "email@exemplo.com"}
            pattern={props.pattern || EMAIL_PATTERN}
            title={props.title || EMAIL_ERROR_MESSAGE}
            autoCapitalize={props.autoCapitalize || "none"}
            autoCorrect={props.autoCorrect || "off"}
            spellCheck={props.spellCheck ?? false}
        />
    )
}
