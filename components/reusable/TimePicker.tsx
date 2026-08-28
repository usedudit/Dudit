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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ClockIcon, ChevronDownIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { Button } from "@/components/reusable/Button"

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
    interval?: 1 | 5 | 10 | 15 | 30
    dataField?: string
}

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"))

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
    interval = 1,
    dataField,
}) => {
    const [open, setOpen] = React.useState(false)
    const isMobile = useIsMobile()
    const { hour, minute } = React.useMemo(() => normalizeTime(value), [value])
    const displayValue = value || ""

    const MINUTES = React.useMemo(() => {
        const steps = 60 / interval
        return Array.from({ length: steps }, (_, index) => String(index * interval).padStart(2, "0"))
    }, [interval])

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
                <div className="flex-1 max-h-[220px] overflow-y-auto hide-scrollbar py-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {HOURS.map((h) => (
                        <button
                            key={h}
                            onClick={() => handleSelect("hour", h)}
                            className={cn(
                                "w-full py-2 px-3 text-sm rounded-lg transition-colors mb-0.5",
                                hour === h
                                    ? "font-bold bg-brand-primary text-brand-green"
                                    : "font-medium text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-dark-border"
                            )}
                        >
                            {h}
                        </button>
                    ))}
                </div>
                {/* Minutes Column */}
                <div className="flex-1 max-h-[220px] overflow-y-auto hide-scrollbar py-1 border-l border-brand-border dark:border-dark-border" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {MINUTES.map((m) => (
                        <button
                            key={m}
                            onClick={() => {
                                handleSelect("minute", m)
                                setOpen(false)
                            }}
                            className={cn(
                                "w-full py-2 px-3 text-sm rounded-lg transition-colors mb-0.5",
                                minute === m
                                    ? "font-bold bg-brand-primary text-brand-green"
                                    : "font-medium text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-dark-border"
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>
        </div >
    )

    const Trigger = (
        <Button
            variant="outline"
            disabled={disabled}
            className={cn(
                "flex h-[42px] w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm font-normal transition-colors duration-150",
                "bg-brand-gray dark:bg-dark-border/30",
                error
                    ? "border-brand-red"
                    : "border-brand-border dark:border-dark-border focus:border-brand-dark dark:focus:border-dark-body",
                "text-brand-dark dark:text-dark-heading",
                "focus:bg-white dark:focus:bg-dark-surface focus:outline-none focus-visible:ring-0",
                "disabled:bg-brand-gray dark:disabled:bg-dark-border/30 disabled:cursor-not-allowed",
                open && "bg-white dark:bg-dark-surface border-brand-dark dark:border-dark-body",
                className
            )}
        >
            <span className="flex min-w-0 items-center">
                <ClockIcon className="mr-3 h-4 w-4 shrink-0 text-brand-inactive-text" />
                <span className={cn("truncate", !value && "text-brand-inactive-text")}>
                    {displayValue || placeholder}
                </span>
            </span>
            <ChevronDownIcon
                className={cn(
                    "ml-2 h-4 w-4 shrink-0 text-brand-inactive-text transition-transform duration-200",
                    open && "rotate-180"
                )}
            />
        </Button>
    )

    return (
        <div className={cn("flex-1 w-full", className)} {...(dataField ? { "data-field": dataField } : {})}>
            {label && (
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                        {label}
                        {required && <span className="text-brand-red"> *</span>}
                    </label>
                </div>
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
                        className="w-[180px] p-0 border-brand-border dark:border-dark-border rounded-2xl overflow-hidden shadow-xl"
                        align="start"
                        sideOffset={8}
                    >
                        <AnimatePresence mode="wait">
                            {open && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                                    className="bg-white dark:bg-dark-surface p-1"
                                >
                                    {PickerContent}
                                </motion.div>
                            )}
                        </AnimatePresence>
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
