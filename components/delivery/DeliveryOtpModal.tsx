"use client"

import React, { useState, useRef, useEffect } from "react"
import { DefaultModal, Button, Spinner, InfoCard } from "@/components/reusable"
import { ShieldIcon, AlertCircleIcon, KeyIcon, CheckCircleIcon } from "@/lib/icons"

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
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-brand-primary/10 dark:bg-brand-primary/20 border border-brand-primary/20 text-brand-dark dark:text-dark-heading">
          <ShieldIcon size={22} className="text-brand-primary shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed space-y-1">
            <p className="font-bold">
              Confirmação de segurança necessária {orderNumber ? `para o pedido ${orderNumber}` : ""}.
            </p>
            <p className="text-brand-inactive-text dark:text-dark-body">
              Solicite ao cliente {customerName ? `(${customerName}) ` : ""}o código de 6 dígitos informado no aplicativo dele para concluir a entrega.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertCircleIcon size={16} className="shrink-0 mt-0.5 text-red-600" />
            <div className="flex-1 font-medium">{errorMessage}</div>
          </div>
        )}

        <div className="py-2">
          <label className="block text-xs font-bold text-center text-brand-dark dark:text-dark-heading mb-3 uppercase tracking-wider">
            Digite os 6 dígitos fornecidos pelo cliente
          </label>
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
                className="w-10 h-12 sm:w-12 sm:h-14 text-center font-mono text-xl sm:text-2xl font-black rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-hidden transition-all text-brand-dark dark:text-white"
                autoComplete="one-time-code"
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-brand-border dark:border-dark-border">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="default"
            className="flex-1 h-11 font-bold"
            disabled={!isComplete || loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Spinner size={16} /> Validando...
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
