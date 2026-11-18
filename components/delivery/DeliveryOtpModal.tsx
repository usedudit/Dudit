"use client"

import React, { useState, useRef, useEffect } from "react"
import { DefaultModal, Button, Spinner, InfoCard, IconPlaceholder } from "@/components/reusable"
import { ShieldIcon } from "@/lib/icons"

interface DeliveryOtpModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (code: string) => Promise<{ success: boolean; error?: string; remainingAttempts?: number }>
  orderNumber?: string
  customerName?: string
}

export function DeliveryOtpModal({
  isOpen,
  onClose,
  onConfirm,
  orderNumber,
  customerName,
}: DeliveryOtpModalProps) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (isOpen) {
      setDigits(["", "", "", "", "", ""])
      setErrorMessage(null)
      setLoading(false)
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 100)
    }
  }, [isOpen])

  const handleDigitChange = (index: number, value: string) => {
    // Only accept numeric characters
    const cleanVal = value.replace(/\D/g, "")
    if (!cleanVal) {
      const nextDigits = [...digits]
      nextDigits[index] = ""
      setDigits(nextDigits)
      return
    }

    // Handle pasting multi-digit string
    if (cleanVal.length > 1) {
      const pasteDigits = cleanVal.slice(0, 6).split("")
      const nextDigits = [...digits]
      pasteDigits.forEach((d, i) => {
        if (i < 6) nextDigits[i] = d
      })
      setDigits(nextDigits)
      const nextFocus = Math.min(pasteDigits.length, 5)
      inputRefs.current[nextFocus]?.focus()
      return
    }

    const nextDigits = [...digits]
    nextDigits[index] = cleanVal[cleanVal.length - 1]
    setDigits(nextDigits)

    if (index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const fullCode = digits.join("")
  const isComplete = fullCode.length === 6

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isComplete || loading) return

    setLoading(true)
    setErrorMessage(null)

    try {
      const res = await onConfirm(fullCode)
      if (!res.success) {
        setErrorMessage(res.error || "Código de confirmação incorreto.")
        setDigits(["", "", "", "", "", ""])
        inputRefs.current[0]?.focus()
      } else {
        onClose()
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro inesperado ao validar código.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title="Código de Entrega Obrigatório"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <IconPlaceholder
          icon={ShieldIcon}
          title={`Confirmação de segurança necessária ${orderNumber ? `para o pedido ${orderNumber}` : ""}.`}
          subtitle={`Solicite ao cliente ${customerName ? `(${customerName}) ` : ""}o código de 6 dígitos informado no aplicativo dele para concluir a entrega.`}
        />

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
                disabled={loading}
                className="w-10 h-10 sm:w-12 sm:h-12 text-center text-xl sm:text-2xl font-black rounded-xl border border-brand-border dark:border-dark-border focus:border-brand-green outline-hidden transition-all text-brand-dark dark:text-dark-heading"
                autoComplete="one-time-code"
              />
            ))}
          </div>
        </div>

        {errorMessage && (
          <InfoCard
            message={errorMessage}
            color="red"
          />
        )}

        <div className="flex items-center gap-3 pt-3 border-t border-brand-border dark:border-dark-border">
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="flex-1 h-11"
            disabled={!isComplete || loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Spinner /> Validando...
              </span>
            ) : (
              "Confirmar Entrega"
            )}
          </Button>
        </div>
      </form>
    </DefaultModal>
  )
}
