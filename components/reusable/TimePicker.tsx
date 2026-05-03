"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useIsMobile } from "@/components/ui/use-mobile"
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { ClockIcon, ChevronDownIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

interface TimePickerProps {
    label?: string
    prefix?: string
    value?: string
    onChange?: (time: string) => void
    placeholder?: string
    required?: boolean
    disabled?: boolean
    className?: string
    error?: boolean
    errorMessage?: string
}

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"))
const MINUTES = ["00", "15", "30", "45"] // Simplified minutes for better UX in business hours

function normalizeTime(value?: string) {
    if (!value) return { hour: "", minute: "" }
    const [hour = "", minute = ""] = value.split(":")
    return { hour, minute }
}

export const TimePicker: React.FC<TimePickerProps> = ({
    label,
    prefix,
    value,
    onChange,
    placeholder = "00:00",
    required,
    disabled,
    className,
    error,
    errorMessage,
}) => {
    const [open, setOpen] = React.useState(false)
    const isMobile = useIsMobile()
    const { hour, minute } = React.useMemo(() => normalizeTime(value), [value])
    const displayValue = value || ""

    const handleSelect = React.useCallback(
        (part: "hour" | "minute", nextValue: string) => {
            const current = normalizeTime(value)
            const nextHour = part === "hour" ? nextValue : (current.hour || "09")
            const nextMinute = part === "minute" ? nextValue : (current.minute || "00")
            
            onChange?.(`${nextHour}:${nextMinute}`)
        },
        [onChange, value]
    )

    const PickerContent = (
        <div className="w-full bg-white dark:bg-dark-surface p-1">
            <div className="flex gap-1">
                {/* Hours Column */}
                <div className="flex-1 max-h-[220px] overflow-y-auto no-scrollbar py-1">
                    {HOURS.map((h) => (
                        <button
                            key={h}
                            onClick={() => handleSelect("hour", h)}
                            className={cn(
                                "w-full py-2 px-3 text-sm font-medium rounded-lg transition-colors mb-0.5",
                                hour === h 
                                    ? "bg-brand-primary text-white" 
                                    : "text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-dark-border"
                            )}
                        >
                            {h}
                        </button>
                    ))}
                </div>
                {/* Minutes Column */}
                <div className="flex-1 max-h-[220px] overflow-y-auto no-scrollbar py-1 border-l border-brand-border dark:border-dark-border">
                    {MINUTES.map((m) => (
                        <button
                            key={m}
                            onClick={() => {
                                handleSelect("minute", m)
                                setOpen(false)
                            }}
                            className={cn(
                                "w-full py-2 px-3 text-sm font-medium rounded-lg transition-colors mb-0.5",
                                minute === m 
                                    ? "bg-brand-primary text-white" 
                                    : "text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-dark-border"
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )

    const Trigger = (
        <button
            type="button"
            disabled={disabled}
            className={cn(
                "group relative flex items-center h-[46px] w-full min-w-[120px] rounded-xl border px-4 transition-all duration-200 ease-in-out",
                "bg-white dark:bg-dark-surface",
                error
                    ? "border-brand-red shadow-[0_0_0_1px_rgba(239,68,68,0.1)]"
                    : "border-brand-border dark:border-dark-border hover:border-brand-primary/50 dark:hover:border-brand-primary/50",
                open && "border-brand-primary ring-2 ring-brand-primary/10",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                className
            )}
        >
            <div className="flex items-center w-full">
                {prefix && (
                    <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mr-3 shrink-0">
                        {prefix}
                    </span>
                )}
                <span className={cn(
                    "flex-1 text-[15px] font-bold text-left",
                    displayValue ? "text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text"
                )}>
                    {displayValue || placeholder}
                </span>
                <ClockIcon className={cn(
                    "ml-2 h-4 w-4 shrink-0 transition-colors",
                    open ? "text-brand-primary" : "text-brand-inactive-text"
                )} />
            </div>
        </button>
    )

    return (
        <div className={cn("w-full", className)}>
            {label && (
                <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                    {label}
                    {required && <span className="text-brand-red ml-1">*</span>}
                </label>
            )}

            {isMobile ? (
                <Drawer open={open} onOpenChange={setOpen}>
                    <DrawerTrigger asChild>{Trigger}</DrawerTrigger>
                    <DrawerContent className="p-0 border-none bg-white dark:bg-dark-surface rounded-t-[32px]">
                        <DrawerHeader className="border-b border-brand-border dark:border-dark-border px-6 py-5">
                            <DrawerTitle className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                {label || "Selecionar Horário"}
                            </DrawerTitle>
                        </DrawerHeader>
                        <div className="p-4">{PickerContent}</div>
                    </DrawerContent>
                </Drawer>
            ) : (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>{Trigger}</PopoverTrigger>
                    <PopoverContent
                        className="w-[180px] p-2 rounded-2xl border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                        align="start"
                        sideOffset={8}
                    >
                        {PickerContent}
                    </PopoverContent>
                </Popover>
            )}

            {error && errorMessage && (
                <p className="mt-1.5 text-xs font-medium text-brand-red animate-in slide-in-from-top-1 duration-200">
                    {errorMessage}
                </p>
            )}
        </div>
    )
}
