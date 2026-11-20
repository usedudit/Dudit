"use client"

import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { CancelIcon, ChevronsUpDown, CheckCircleIcon, PlusIcon, InfoIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/components/erp/hooks"
import BottomSheet from "@/components/BottomSheet"
import { createPortal } from "react-dom"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

export interface ComboboxOption {
    label: string
    value: string
}

interface ComboboxActionItem {
    label: string | React.ReactNode
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
    /** Borda vermelha (validação), alinhado ao Input */
    error?: boolean
    errorMessage?: string
    /** Permite digitar e selecionar um valor customizado livre */
    creatable?: boolean
    createLabel?: (search: string) => React.ReactNode
    dataField?: string
    /** Tooltip text to show next to the label (info icon) */
    labelTooltip?: string | React.ReactNode
    /** Tooltip props for customization */
    labelTooltipProps?: React.ComponentProps<typeof TooltipContent>
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
    errorMessage,
    creatable = false,
    createLabel,
    dataField,
    labelTooltip,
    labelTooltipProps,
}: ComboboxProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [search, setSearch] = useState("")
    // NOVO: Estado para controlar o foco do input de busca interno
    const [isSearchFocused, setIsSearchFocused] = useState(false)

    const triggerRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [position, setPosition] = useState<React.CSSProperties>({})

    const isMobile = useMediaQuery("(max-width: 768px)")

    const safeOptions = Array.isArray(options) ? options : []

    const selectedOption =
        safeOptions.find((option) => option && String(option.value) === String(value)) ||
        (value && creatable ? { value: String(value), label: String(value) } : undefined)

    const normalizedSearch = (search || "").trim()
    const hasExactMatch = safeOptions.some(
        (opt) =>
            Boolean(opt) &&
            (((opt.label || "").trim().toLowerCase() === normalizedSearch.toLowerCase()) ||
             ((opt.value || "").trim().toLowerCase() === normalizedSearch.toLowerCase()))
    )

    const filteredOptions = safeOptions.filter(
        (option) =>
            Boolean(option) &&
            (((option.label || "").toLowerCase().includes(search.toLowerCase())) ||
             ((option.value || "").toLowerCase().includes(search.toLowerCase()))),
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
            const shouldOpenUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight

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
            return () => document.removeEventListener("mousedown", handleClickOutside)
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
            <div className="p-2 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface sticky top-0 z-10">
                <div className="relative">
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault()
                                if (filteredOptions.length === 1 && (filteredOptions[0]?.label || "").toLowerCase() === normalizedSearch.toLowerCase()) {
                                    onChange(filteredOptions[0].value)
                                    closeDropdown()
                                } else if (creatable && normalizedSearch && !hasExactMatch) {
                                    onChange(normalizedSearch)
                                    closeDropdown()
                                } else if (filteredOptions.length > 0) {
                                    onChange(filteredOptions[0].value)
                                    closeDropdown()
                                }
                            }
                        }}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused(false)}
                        className={cn(
                            inputBaseClasses,
                            borderClasses(isSearchFocused),
                            "pr-8"
                        )}
                        autoFocus={!isMobile}
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <CancelIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            <div className="max-h-[240px] overflow-y-auto p-1 custom-scrollbar bg-white dark:bg-dark-surface">
                {creatable && normalizedSearch && !hasExactMatch && (
                    <button
                        type="button"
                        onClick={() => {
                            onChange(normalizedSearch)
                            closeDropdown()
                        }}
                        className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-md transition-colors duration-150 cursor-pointer",
                            "hover:bg-brand-green/10 dark:hover:bg-brand-green/20 text-brand-green font-medium border-b border-brand-border/40 dark:border-dark-border/40 mb-1 text-left"
                        )}
                    >
                        <PlusIcon className="w-4 h-4 shrink-0 text-brand-green" />
                        <span className="truncate">
                            {createLabel ? createLabel(normalizedSearch) : `Usar "${normalizedSearch}"`}
                        </span>
                    </button>
                )}

                {filteredOptions.length === 0 ? (
                    !creatable || !normalizedSearch ? (
                        <div className="px-3 py-6 text-center text-sm text-brand-inactive-text dark:text-dark-body">{emptyMessage}</div>
                    ) : null
                ) : (
                    filteredOptions.map((option) => {
                        const isSelected = option.value === value
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    onChange(option.value)
                                    closeDropdown()
                                }}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors duration-150 text-left",
                                    "hover:bg-gray-100 dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading",
                                    isSelected && "bg-brand-green-secondary/10 text-brand-green font-medium",
                                )}
                            >
                                <span>{option.label}</span>
                                {isSelected && <CheckCircleIcon className="w-4 h-4 text-brand-green shrink-0" />}
                            </button>
                        )
                    })
                )}
            </div>

            {actionItem && (
                <div className="p-1 border-t border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-border/50 sticky bottom-0 z-10">
                    <button
                        type="button"
                        onClick={() => {
                            actionItem.onClick()
                            closeDropdown()
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-dark-border rounded-md transition-colors font-medium"
                    >
                        {actionItem.icon}
                        <span>{actionItem.label}</span>
                    </button>
                </div>
            )}
        </div>
    )

    return (
        <>
            <div ref={triggerRef} className={cn("relative", width, className)} {...(dataField ? { "data-field": dataField } : {})}>
                {label && (
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                            {label}
                            {required && <span className="text-brand-red"> *</span>}
                        </label>
                        {labelTooltip && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="p-0.5 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-body transition-colors rounded flex items-center justify-center"
                                        aria-label="Mais informações"
                                    >
                                        <InfoIcon className="w-4 h-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    align="start"
                                    {...labelTooltipProps}
                                >
                                    {typeof labelTooltip === "string" ? (
                                        <p className="text-xs">{labelTooltip}</p>
                                    ) : (
                                        labelTooltip
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                )}
                <button
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
                    <span className={cn("truncate", !selectedOption && "text-brand-inactive-text")}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronsUpDown
                        className={cn(
                            "ml-2 h-4 w-4 text-brand-inactive-text shrink-0 transition-transform duration-200",
                            isOpen && "rotate-180",
                        )}
                    />
                </button>
                {error && errorMessage && (
                    <p className="mt-1.5 text-xs text-brand-red animate-in fade-in slide-in-from-top-1 duration-200">
                        {errorMessage}
                    </p>
                )}
            </div>

            {isMobile && (
                <BottomSheet isOpen={isOpen} onClose={closeDropdown}>
                    <div className="py-2">
                        {menuContent}
                    </div>
                </BottomSheet>
            )}

            {!isMobile && isMounted && typeof document !== "undefined" && createPortal(
                <div
                    ref={menuRef}
                    style={position}
                    className={cn(
                        "rounded-md shadow-lg bg-white dark:bg-dark-surface ring-1 ring-black ring-opacity-5 ring-border dark:ring-dark-border overflow-hidden",
                        "transition-all ease-out duration-200 z-9999",
                        isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
                    )}
                >
                    {menuContent}
                </div>,
                document.body
            )}
        </>
    )
}
