"use client"

import React, { useState, useEffect } from "react"
import Portal from "@/components/Portal"
import { XIcon, AlertCircleIcon, CheckCircleIcon, AlertTriangleIcon, InfoIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import BottomSheet from "@/components/BottomSheet"
import { Button } from "@/components/reusable/Button"
import { useModalLayer } from "@/lib/modal-stack"

// Tipos de variantes para mudar a cor do ícone/botão
type AlertVariant = "danger" | "success" | "warning" | "info"

export interface AlertModalProps {
  title: string
  message?: string | React.ReactElement
  description?: string
  isOpen?: boolean
  onClose: () => void
  onConfirm?: () => void
  confirmText?: string
  cancelText?: string
  icon?: React.ReactElement<{ className?: string }>
  variant?: AlertVariant
  isDestructive?: boolean
  disabled?: boolean
  isLoading?: boolean
}

// Configuração de cores baseada na variante
const VARIANT_STYLES = {
  danger: {
    bgLight: "bg-brand-red-light dark:bg-brand-red/20",
    text: "text-brand-red-dark dark:text-brand-red",
    button: "destructive" as const,
    defaultIcon: <AlertCircleIcon className="h-8 w-8" />,
  },
  success: {
    bgLight: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-400",
    button: "default" as const,
    defaultIcon: <CheckCircleIcon className="h-8 w-8" />,
  },
  warning: {
    bgLight: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-700 dark:text-yellow-400",
    button: "warning" as const,
    defaultIcon: <AlertTriangleIcon className="h-8 w-8" />,
  },
  info: {
    bgLight: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-400",
    button: "default" as const,
    defaultIcon: <InfoIcon className="h-8 w-8" />,
  },
}

const ConcentricCircles: React.FC = () => (
  <svg
    width="256"
    height="256"
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-border dark:text-dark-border/50 pointer-events-none"
  >
    <defs>
      <radialGradient
        id="radial-mask-gradient"
        cx="0"
        cy="0"
        r="1"
        gradientUnits="userSpaceOnUse"
        gradientTransform="translate(128 128) rotate(90) scale(128)"
      >
        <stop stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </radialGradient>
      <mask id="radial-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
        <rect width="256" height="256" fill="url(#radial-mask-gradient)" />
      </mask>
    </defs>
    <g mask="url(#radial-mask)">
      <circle cx="128" cy="128" r="32" stroke="currentColor" strokeWidth="1" />
      <circle cx="128" cy="128" r="64" stroke="currentColor" strokeWidth="1" />
      <circle cx="128" cy="128" r="96" stroke="currentColor" strokeWidth="1" />
      <circle cx="128" cy="128" r="128" stroke="currentColor" strokeWidth="1" />
    </g>
  </svg>
)

const AlertModal: React.FC<AlertModalProps> = ({
  title,
  message,
  description,
  isOpen = true,
  onClose,
  onConfirm,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  icon,
  variant,
  isDestructive,
  disabled,
  isLoading
}) => {
  const [isAnimating, setIsAnimating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isMobile = useMediaQuery("(max-width: 1023px)")
  const displayMessage = description || message || ""

  // z-index dinâmico: a variante desktop abre acima de tudo que já estava aberto.
  const zIndex = useModalLayer(isOpen)

  const effectiveVariant = isDestructive ? "danger" : variant || "danger"
  const isConfirmation = !!onConfirm
  const styles = VARIANT_STYLES[effectiveVariant]

  useEffect(() => {
    if (isOpen) {
      // Pequeno delay para garantir que o navegador renderize o estado inicial (opacity-0) antes de transicionar
      const id = setTimeout(() => setIsAnimating(true), 50)
      return () => clearTimeout(id)
    } else {
      setIsAnimating(false)
      setIsSubmitting(false)
    }
  }, [isOpen])

  const handleClose = () => {
    if (isSubmitting) return
    // 1. Inicia a animação de saída
    setIsAnimating(false)
    // 2. Espera a animação terminar (200ms) para desmontar de fato
    setTimeout(onClose, 200)
  }

  const handleConfirm = () => {
    if (disabled || isSubmitting) return
    if (onConfirm) {
      setIsSubmitting(true)
      setIsAnimating(false)
      setTimeout(onConfirm, 200)
    } else {
      handleClose()
    }
  }

  const buttonsContent = isConfirmation ? (
    <>
      <Button variant="outline" onClick={handleClose} className="transition-all duration-200">
        {cancelText}
      </Button>
      <Button
        variant={styles.button}
        onClick={handleConfirm}
        className="transition-all duration-200"
        disabled={disabled}
        isLoading={isLoading}
      >
        {confirmText}
      </Button>
    </>
  ) : (
    <Button
      variant={styles.button}
      onClick={handleClose}
      className="transition-all duration-200"
    >
      {confirmText === "Confirmar" ? "Ok, entendi" : confirmText}
    </Button>
  )

  const iconElement = icon
    ? React.cloneElement(icon as React.ReactElement<any>, { className: `h-8 w-8 ${styles.text}` })
    : React.cloneElement(styles.defaultIcon as React.ReactElement<any>, { className: `h-8 w-8 ${styles.text}` })

  // CORREÇÃO AQUI: Removemos "|| !isAnimating".
  // Se removermos, o componente sai do DOM antes da animação de fade-out terminar.
  if (!isOpen) return null

  if (isMobile) {
    return (
      <BottomSheet isOpen={isAnimating} onClose={handleClose}>
        <div className="flex flex-col items-center text-center gap-4 pt-4 relative">
          <div
            className={`relative flex shrink-0 items-center justify-center h-16 w-16 rounded-full ${styles.bgLight} mb-2`}
          >
            {iconElement}
          </div>
          <div className="z-10 flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-brand-dark dark:text-dark-heading">{title}</h3>
            {typeof displayMessage === "string" ? (
              <p className="text-sm text-brand-inactive-text dark:text-dark-body">{displayMessage}</p>
            ) : (
              <div className="text-sm text-brand-inactive-text dark:text-dark-body text-left">{displayMessage}</div>
            )}
          </div>
          <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface flex gap-3 -mx-4 -mb-6 mt-2 self-stretch">
            {isConfirmation ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="h-12 w-full"
                >
                  {cancelText}
                </Button>
                <Button
                  variant={styles.button}
                  onClick={handleConfirm}
                  className="h-12 w-full"
                  disabled={disabled}
                  isLoading={isLoading}
                >
                  {confirmText}
                </Button>
              </>
            ) : (
              <Button
                variant={styles.button}
                onClick={handleClose}
                className="h-12 w-full"
              >
                {confirmText === "Confirmar" ? "Ok, entendi" : confirmText}
              </Button>
            )}
          </footer>
        </div>
      </BottomSheet>
    )
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ zIndex }}>
        {/* Backdrop com transição de opacidade */}
        <div
          className={`fixed inset-0 bg-black/60 transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"
            }`}
          onClick={handleClose}
        ></div>

        {/* Modal com transição de escala e opacidade */}
        <div
          className={`relative bg-white dark:bg-dark-surface rounded-2xl shadow-lg w-full max-w-sm transition-all duration-200 ease-out flex flex-col overflow-hidden ${isAnimating ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`}
        >
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-[42px] h-[42px] flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors z-10"
            aria-label="Fechar"
          >
            <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
          </button>

          <div className="flex flex-col items-center gap-4 px-6 pt-10 relative text-center">
            <div className="relative w-max flex items-center justify-center">
              <ConcentricCircles />
              <div
                className={`relative flex shrink-0 items-center justify-center h-16 w-16 rounded-full ${styles.bgLight} z-10`}
              >
                {iconElement}
              </div>
            </div>

            <div className="z-10 flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-brand-dark dark:text-dark-heading">{title}</h3>
              {typeof displayMessage === "string" ? (
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">{displayMessage}</p>
              ) : (
                <div className="text-sm text-brand-inactive-text dark:text-dark-body text-left">{displayMessage}</div>
              )}
            </div>
          </div>

          <div
            className={`z-10 flex flex-1 flex-col-reverse gap-3 p-6 pt-8 ${isConfirmation ? "sm:grid sm:grid-cols-2" : ""}`}
          >
            {buttonsContent}
          </div>
        </div>
      </div>
    </Portal>
  )
}

export default AlertModal