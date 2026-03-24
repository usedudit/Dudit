"use client"

import React, { useState, useEffect, type ReactNode } from "react"
import Portal from "../Portal"
import { CloseIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import BottomSheet from "@/components/BottomSheet"
import { Button } from "@/components/reusable"

interface DefaultModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl"
  description?: string
  icon?: React.ReactElement<{ className?: string }>
  hideHeader?: boolean
  className?: string
}

const DefaultModal: React.FC<DefaultModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = "xl",
  hideHeader = false,
  className = "",
}) => {
  const [isAnimating, setIsAnimating] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const isMobile = useMediaQuery("(max-width: 768px)")

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      const id = setTimeout(() => setIsAnimating(true), 50)
      return () => clearTimeout(id)
    } else {
      setIsAnimating(false)
      const id = setTimeout(() => setIsVisible(false), 200)
      return () => clearTimeout(id)
    }
  }, [isOpen])

  const handleClose = () => {
    onClose()
  }

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
  }

  if (!isVisible) return null

  if (isMobile) {
    return (
      <BottomSheet isOpen={isAnimating} onClose={handleClose}>
        <div className="flex flex-col gap-4 pt-2 pb-4">
          {/* Header Mobile Clean */}
          {!hideHeader && (
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
            </div>
          )}

          <div className="flex flex-col gap-4">{children}</div>
          {footer && <div className="flex flex-col gap-3 pt-2">{footer}</div>}
        </div>
      </BottomSheet>
    )
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div
          className={`fixed inset-0 bg-black/60 transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"}`}
          onClick={handleClose}
        ></div>

        <div
          className={`relative bg-white dark:bg-dark-surface rounded-2xl shadow-xl w-full ${maxWidthClasses[maxWidth]} transition-all duration-200 ease-out flex flex-col overflow-hidden max-h-[90vh] ${isAnimating ? "scale-100 opacity-100" : "scale-95 opacity-0"} ${className}`}
        >
          {!hideHeader && (
            <div className="flex items-center justify-between p-6 pb-2">
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
              <Button variant="filled" onClick={handleClose} className="w-[40px] h-[40px] p-0 flex items-center justify-center">
                <CloseIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </Button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

          {footer && (
            <div className="flex items-center justify-end gap-3 p-6 pt-2">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}

export default DefaultModal
