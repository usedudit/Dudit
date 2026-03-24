"use client"

import type React from "react"

import { useState, useCallback } from "react"

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  icon?: React.ReactElement<{ className?: string }>
}

export function useAlertModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions>({
    title: "",
    message: "",
    confirmText: "Confirmar",
  })
  const [resolveCallback, setResolveCallback] = useState<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts)
    setIsOpen(true)

    return new Promise((resolve) => {
      setResolveCallback(() => resolve)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setIsOpen(false)
    if (resolveCallback) {
      resolveCallback(true)
      setResolveCallback(null)
    }
  }, [resolveCallback])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    if (resolveCallback) {
      resolveCallback(false)
      setResolveCallback(null)
    }
  }, [resolveCallback])

  return {
    isOpen,
    options,
    confirm,
    handleConfirm,
    handleClose,
  }
}
