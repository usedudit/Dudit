"use client"

import React from "react"
import { Input } from "../Input"

type EmailInputProps = React.ComponentProps<typeof Input>

export function EmailInput({ onChange, value, ...props }: EmailInputProps) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        e.target.value = e.target.value.toLowerCase()
        onChange?.(e)
    }

    return (
        <Input
            {...props}
            type="email"
            value={typeof value === 'string' ? value.toLowerCase() : value}
            onChange={handleChange}
            inputMode="email"
            placeholder={props.placeholder || "email@exemplo.com"}
        />
    )
}
