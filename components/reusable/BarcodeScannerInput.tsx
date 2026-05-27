"use client"

import React, { useRef, useState, useEffect } from "react"
import { Input, Button } from "@/components/reusable"
import { QRCodeIcon, CameraIcon } from "@/lib/icons"
import { CameraScannerModal } from "./CameraScannerModal"

interface BarcodeScannerInputProps {
  onScan: (barcode: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  showCameraOption?: boolean
}

export const BarcodeScannerInput: React.FC<BarcodeScannerInputProps> = ({
  onScan,
  placeholder = "Escaneie o código de barras...",
  className,
  autoFocus = true,
  showCameraOption = true,
}) => {
  const [value, setValue] = useState("")
  const [focusLock, setFocusLock] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Automatic Focus Lock handling
  useEffect(() => {
    if (autoFocus && inputRef.current && !isCameraOpen) {
      inputRef.current.focus()
    }
  }, [autoFocus, isCameraOpen])

  useEffect(() => {
    if (focusLock && !isCameraOpen) {
      const interval = setInterval(() => {
        if (document.activeElement !== inputRef.current) {
          inputRef.current?.focus()
        }
      }, 500)
      return () => clearInterval(interval)
    }
  }, [focusLock, isCameraOpen])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const scannedValue = value.trim()
      if (scannedValue) {
        onScan(scannedValue)
        setValue("") // Instantly clear input
      }
    }
  }

  const handleCameraScan = (scannedValue: string) => {
    const code = scannedValue.trim()
    if (code) {
      onScan(code)
    }
  }

  return (
    <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full ${className}`}>
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          label=""
          placeholder={placeholder}
          value={value}
          onChange={(e: any) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          prefix={<QRCodeIcon size={18} className="text-brand-inactive-text shrink-0" />}
          className="mb-0 border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface rounded-xl"
        />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Focus Lock Toggle */}
        <button
          type="button"
          onClick={() => {
            setFocusLock(!focusLock)
            if (!focusLock) {
              setTimeout(() => inputRef.current?.focus(), 50)
            }
          }}
          className={`flex h-11 px-3.5 items-center justify-center rounded-xl border text-xs font-bold transition-all ${
            focusLock
              ? "bg-brand-primary/10 border-brand-primary text-brand-primary"
              : "bg-white dark:bg-dark-surface border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
          }`}
          title="Mantém o campo focado continuamente para leitura rápida"
        >
          {focusLock ? "🔒 Foco Travado" : "🔓 Focar Auto"}
        </button>

        {/* Camera Scanner Trigger */}
        {showCameraOption && (
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4 flex items-center justify-center rounded-xl border-brand-border dark:border-dark-border text-brand-dark hover:bg-brand-gray dark:hover:bg-dark-border gap-2"
            onClick={() => setIsCameraOpen(true)}
          >
            <CameraIcon size={18} />
            <span className="hidden sm:inline">Escanear Câmera</span>
          </Button>
        )}
      </div>

      {isCameraOpen && (
        <CameraScannerModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onScan={handleCameraScan}
        />
      )}
    </div>
  )
}
