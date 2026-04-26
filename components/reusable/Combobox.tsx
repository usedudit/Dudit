"use client"

import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { CancelIcon, UnfoldMoreIcon, CheckCircleIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/components/erp/hooks"
import BottomSheet from "@/components/BottomSheet"
import { createPortal } from "react-dom"

export interface ComboboxOption {
  label: string
  value: string
}

interface ComboboxActionItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  actionItem?: ComboboxActionItem
  width?: string
  label?: string
  required?: boolean
  error?: boolean

  // 🔥 NOVO (pra igualar ao Input)
  labelAddon?: React.ReactNode
  id?: string
  name?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Selecione...",
  emptyMessage = "Nenhum resultado encontrado.",
  searchPlaceholder = "Buscar...",
  className,
  disabled = false,
  actionItem,
  width = "w-full",
  label,
  required,
  error = false,
  labelAddon,
  id,
  name,
}: ComboboxProps) {
  const inputId = id || name || Math.random().toString(36).substring(7)

  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [search, setSearch] = useState("")
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<React.CSSProperties>({})

  const isMobile = useMediaQuery("(max-width: 768px)")

  const selectedOption = options.find((option) => option.value === value)

  const filteredOptions = options.filter(
    (option) =>
      option.label.toLowerCase().includes(search.toLowerCase()) ||
      option.value.toLowerCase().includes(search.toLowerCase()),
  )

  const handleToggle = useCallback(
    (shouldOpen: boolean) => {
      if (disabled) return

      if (isMobile) {
        setIsOpen(shouldOpen)
        if (!shouldOpen) setSearch("")
        return
      }

      if (shouldOpen) {
        setIsMounted(true)
      } else {
        setIsOpen(false)
        setSearch("")
      }
    },
    [isMobile, disabled],
  )

  const updatePosition = useCallback(() => {
    if (triggerRef.current && menuRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const estimatedHeight = Math.min(filteredOptions.length * 40 + 100, 300)
      const shouldOpenUpward =
        spaceBelow < estimatedHeight && rect.top > estimatedHeight

      const styles: React.CSSProperties = {
        position: "fixed",
        width: `${rect.width}px`,
        zIndex: 9999,
      }

      if (shouldOpenUpward) {
        styles.bottom = `${window.innerHeight - rect.top + 4}px`
      } else {
        styles.top = `${rect.bottom + 4}px`
      }

      styles.left = `${rect.left}px`
      setPosition(styles)
    }
  }, [filteredOptions.length])

  useEffect(() => {
    if (isMounted && !isMobile) {
      const timer = setTimeout(() => {
        updatePosition()
        setIsOpen(true)
      }, 10)
      return () => clearTimeout(timer)
    }
  }, [isMounted, updatePosition, isMobile])

  useEffect(() => {
    if (!isOpen && isMounted && !isMobile) {
      const timer = setTimeout(() => {
        setIsMounted(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen, isMounted, isMobile])

  useEffect(() => {
    if (isOpen && !isMobile) {
      window.addEventListener("resize", updatePosition)
      window.addEventListener("scroll", updatePosition, true)
      return () => {
        window.removeEventListener("resize", updatePosition)
        window.removeEventListener("scroll", updatePosition, true)
      }
    }
  }, [isOpen, updatePosition, isMobile])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        !isMobile &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        handleToggle(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () =>
        document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, isMobile, handleToggle])

  const closeDropdown = () => handleToggle(false)

  const inputBaseClasses =
    "w-full h-[42px] bg-brand-gray dark:bg-dark-border/30 border rounded-lg px-4 py-2 text-sm text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text transition-colors focus:bg-white dark:focus:bg-dark-surface focus:outline-none"

  const borderClasses = (isActive: boolean, hasError: boolean = false) =>
    hasError
      ? "border-brand-red"
      : isActive
      ? "border-brand-dark dark:focus:border-dark-body"
      : "border-brand-border dark:border-dark-border"

  const menuContent = (
    <div className="flex flex-col max-h-[inherit]">
      {/* ... (mantive igual, sem mudanças aqui) */}
      {/* pode colar seu menuContent original aqui */}
    </div>
  )

  return (
    <>
      <div ref={triggerRef} className={cn("flex-1 w-full", width, className)}>
        
        {/* ✅ LABEL IGUAL AO INPUT */}
        {label && (
          <div className="flex items-center gap-2 mb-1.5">
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate"
            >
              {label}
              {required && <span className="text-brand-red"> *</span>}
            </label>
            {labelAddon}
          </div>
        )}

        <button
          id={inputId}
          type="button"
          disabled={disabled}
          onClick={() => handleToggle(!isOpen)}
          className={cn(
            inputBaseClasses,
            "flex items-center justify-between",
            borderClasses(isOpen, error),
            "disabled:bg-brand-gray dark:disabled:bg-dark-border/30 disabled:opacity-100 disabled:cursor-not-allowed",
            isOpen && "bg-white dark:bg-dark-surface"
          )}
        >
          <span
            className={cn(
              "truncate",
              !selectedOption && "text-brand-inactive-text"
            )}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <UnfoldMoreIcon
            className={cn(
              "ml-2 h-4 w-4 text-brand-inactive-text shrink-0 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* resto continua igual */}
      {isMobile && (
        <BottomSheet isOpen={isOpen} onClose={closeDropdown}>
          <div className="py-2">{menuContent}</div>
        </BottomSheet>
      )}

      {!isMobile &&
        isMounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={position}
            className={cn(
              "rounded-md shadow-lg bg-white dark:bg-dark-surface ring-1 ring-black ring-opacity-5 ring-border dark:ring-dark-border overflow-hidden",
              "transition-all ease-out duration-200 z-9999",
              isOpen
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 pointer-events-none"
            )}
          >
            {menuContent}
          </div>,
          document.body
        )}
    </>
  )
}