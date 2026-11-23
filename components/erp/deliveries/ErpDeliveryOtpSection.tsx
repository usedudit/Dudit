"use client"

import React, { useEffect, useRef } from "react"
import { Checkbox, IconPlaceholder, InfoCard, Input } from "@/components/reusable"
import { ShieldIcon } from "@/lib/icons"

export interface ErpDeliveryOtpSectionProps {
    code: string
    onCodeChange: (nextCode: string) => void
    bypassOtp: boolean
    onBypassOtpChange: (checked: boolean) => void
    bypassReason: string
    onBypassReasonChange: (reason: string) => void
    canBypass: boolean
    orderNumber?: string | null
    customerName?: string | null
    otpOrderCount?: number
    checkboxId: string
    autoFocus?: boolean
}

export default function ErpDeliveryOtpSection({
    code,
    onCodeChange,
    bypassOtp,
    onBypassOtpChange,
    bypassReason,
    onBypassReasonChange,
    canBypass,
    orderNumber,
    customerName,
    otpOrderCount = 1,
    checkboxId,
    autoFocus = true,
}: ErpDeliveryOtpSectionProps) {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    const digits = Array.from({ length: 6 }, (_, i) => code[i] || "")

    useEffect(() => {
        if (autoFocus && !bypassOtp && otpOrderCount <= 1) {
            const timer = setTimeout(() => {
                inputRefs.current[0]?.focus()
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [autoFocus, bypassOtp, otpOrderCount])

    const handleDigitChange = (index: number, value: string) => {
        const cleanVal = value.replace(/\D/g, "")
        if (!cleanVal) {
            const nextDigits = [...digits]
            nextDigits[index] = ""
            onCodeChange(nextDigits.join(""))
            return
        }

        if (cleanVal.length > 1) {
            const pasteDigits = cleanVal.slice(0, 6).split("")
            const nextDigits = ["", "", "", "", "", ""]
            pasteDigits.forEach((d, i) => {
                if (i < 6) nextDigits[i] = d
            })
            onCodeChange(nextDigits.join(""))
            const nextFocus = Math.min(pasteDigits.length, 5)
            inputRefs.current[nextFocus]?.focus()
            return
        }

        const nextDigits = [...digits]
        nextDigits[index] = cleanVal[cleanVal.length - 1]
        onCodeChange(nextDigits.join(""))

        if (index < 5) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !digits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const effectiveBypass = canBypass && bypassOtp

    return (
        <div className="space-y-4 pt-1">
            <IconPlaceholder
                icon={ShieldIcon}
                title={`Confirmação de segurança necessária${orderNumber ? ` para o pedido ${orderNumber}` : ""}.`}
                subtitle={
                    otpOrderCount > 1
                        ? "Esta entrega possui múltiplos pedidos que exigem código de confirmação. Confirme cada pedido individualmente nos detalhes da entrega."
                        : `Solicite ao cliente${customerName ? ` (${customerName})` : ""} o código de 6 dígitos informado no aplicativo dele para concluir a entrega.`
                }
            />

            {otpOrderCount > 1 && !effectiveBypass ? (
                <InfoCard
                    color="yellow"
                    message="Abra os detalhes desta entrega para confirmar o código de cada pedido separadamente."
                />
            ) : !effectiveBypass ? (
                <div className="py-2">
                    <div className="flex justify-center items-center gap-2 sm:gap-2.5">
                        {digits.map((digit, index) => (
                            <input
                                key={index}
                                ref={(el) => {
                                    inputRefs.current[index] = el
                                }}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                value={digit}
                                onChange={(e) => handleDigitChange(index, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(index, e)}
                                className="w-10 h-10 sm:w-12 sm:h-12 text-center text-xl sm:text-2xl font-black rounded-xl border border-brand-border dark:border-dark-border focus:border-brand-green outline-hidden transition-all text-brand-dark dark:text-dark-heading bg-white dark:bg-dark-surface"
                                autoComplete="one-time-code"
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <Input
                    label="Motivo do Bypass Administrativo"
                    placeholder="Ex: Cliente sem celular / autorizado por telefone"
                    value={bypassReason}
                    onChange={(e) => onBypassReasonChange(e.target.value)}
                />
            )}

            {canBypass && (
                <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                    <Checkbox
                        id={checkboxId}
                        checked={bypassOtp}
                        onChange={onBypassOtpChange}
                        label="Bypassar código (Autorização de Administrador)"
                    />
                </div>
            )}
        </div>
    )
}
