"use client"

import React from "react"
import { Input } from "../Input"

type WebsiteInputProps = React.ComponentProps<typeof Input>

const WEBSITE_ERROR_MESSAGE = "Informe um site válido, como exemplo.com.br ou https://exemplo.com.br."

function normalizeWebsite(value: string) {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return ""
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function isValidWebsite(value: string) {
    try {
        const normalized = normalizeWebsite(value)
        if (!normalized) return true

        const url = new URL(normalized)
        return Boolean(url.hostname) && url.hostname.includes(".")
    } catch {
        return false
    }
}

export function WebsiteInput({ onChange, value, ...props }: WebsiteInputProps) {
    const validateWebsite = (
        target: HTMLInputElement | HTMLTextAreaElement,
        websiteValue: string
    ) => {
        const trimmed = websiteValue.trim()
        if (!trimmed) {
            target.setCustomValidity("")
            return
        }

        target.setCustomValidity(isValidWebsite(trimmed) ? "" : WEBSITE_ERROR_MESSAGE)
    }

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        validateWebsite(e.target, e.target.value)
        onChange?.(e)
    }

    const handleBlur: React.FocusEventHandler<
        HTMLInputElement | HTMLTextAreaElement
    > = (e) => {
        const trimmed = e.target.value.trim()
        if (trimmed && isValidWebsite(trimmed)) {
            e.target.value = normalizeWebsite(trimmed)
        }

        validateWebsite(e.target, e.target.value)
        props.onBlur?.(e)
    }

    return (
        <Input
            {...props}
            type="url"
            value={typeof value === "string" ? value : value}
            onChange={handleChange}
            onBlur={handleBlur}
            inputMode="url"
            placeholder={props.placeholder || "https://www.site.com.br"}
            title={props.title || WEBSITE_ERROR_MESSAGE}
            autoCapitalize={props.autoCapitalize || "none"}
            autoCorrect={props.autoCorrect || "off"}
            spellCheck={props.spellCheck ?? false}
        />
    )
}
