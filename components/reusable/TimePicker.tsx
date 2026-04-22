"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"

import { Button } from "@/components/reusable/Button"
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
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"))

function normalizeTime(value?: string) {
    if (!value) return { hour: "", minute: "" }
    const [hour = "", minute = ""] = value.split(":")
    return { hour, minute }
}

function TimeColumn({
    title,
    items,
    selectedValue,
    onSelect,
}: {
    title: string
    items: string[]
    selectedValue: string
    onSelect: (value: string) => void
}) {
    return (
        <div className="min-w-0 flex-1">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-brand-inactive-text">
                {title}
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-brand-border bg-brand-gray/40 p-2 dark:border-dark-border dark:bg-dark-border/20">
                {items.map((item) => {
                    const isSelected = item === selectedValue
                    return (
                        <button
                            key={item}
                            type="button"
                            onClick={() => onSelect(item)}
                            className={cn(
                                "flex h-10 w-full items-center justify-center rounded-xl text-sm font-semibold transition-all duration-200",
                                isSelected
                                    ? "bg-brand-green text-white shadow-sm"
                                    : "text-brand-dark hover:bg-white dark:text-dark-heading dark:hover:bg-dark-surface"
                            )}
                        >
                            {item}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export const TimePicker: React.FC<TimePickerProps> = ({
    label,
    value,
    onChange,
    placeholder = "Selecione um horário",
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
            const nextHour = part === "hour" ? nextValue : current.hour
            const nextMinute = part === "minute" ? nextValue : current.minute

            if (nextHour && nextMinute) {
                onChange?.(`${nextHour}:${nextMinute}`)
            } else {
                onChange?.(`${nextHour}:${nextMinute}`.replace(/:$/, ""))
            }
        },
        [onChange, value]
    )

    const PickerContent = (
        <div className="w-full max-w-[420px] bg-white p-4 dark:bg-dark-surface">
            <div className="mb-4 rounded-2xl border border-brand-border bg-brand-gray/50 px-4 py-3 dark:border-dark-border dark:bg-dark-border/20">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-inactive-text">
                    Horário selecionado
                </p>
                <p className="mt-1 text-2xl font-bold text-brand-dark dark:text-dark-heading">
                    {displayValue || "--:--"}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <TimeColumn
                    title="Hora"
                    items={HOURS}
                    selectedValue={hour}
                    onSelect={(nextHour) => handleSelect("hour", nextHour)}
                />
                <TimeColumn
                    title="Minuto"
                    items={MINUTES}
                    selectedValue={minute}
                    onSelect={(nextMinute) => {
                        handleSelect("minute", nextMinute)
                        if (hour) setOpen(false)
                    }}
                />
            </div>
        </div>
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
                open && "bg-white dark:bg-dark-surface border-brand-dark dark:border-dark-body"
            )}
        >
            <span className="flex min-w-0 items-center">
                <ClockIcon className="mr-3 h-4 w-4 shrink-0 text-brand-inactive-text" />
                <span className={cn("truncate", !displayValue && "text-brand-inactive-text")}>
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
        <div className={cn("flex-1 w-full", className)}>
            {label && (
                <div className="mb-1.5 flex items-center gap-2">
                    <label className="truncate text-sm font-medium text-brand-dark dark:text-dark-heading">
                        {label}
                        {required && <span className="text-brand-red"> *</span>}
                    </label>
                </div>
            )}

            {isMobile ? (
                <Drawer open={open} onOpenChange={setOpen}>
                    <DrawerTrigger asChild>{Trigger}</DrawerTrigger>
                    <DrawerContent className="p-0">
                        <DrawerHeader className="border-b border-brand-border pb-4 dark:border-dark-border">
                            <DrawerTitle className="font-bold text-brand-dark dark:text-dark-heading">
                                {label || placeholder}
                            </DrawerTitle>
                        </DrawerHeader>
                        <div className="p-4">{PickerContent}</div>
                    </DrawerContent>
                </Drawer>
            ) : (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>{Trigger}</PopoverTrigger>
                    <PopoverContent
                        className="w-auto rounded-2xl border-brand-border p-0 shadow-xl dark:border-dark-border"
                        align="start"
                        sideOffset={8}
                    >
                        <AnimatePresence mode="wait">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: -4 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                                {PickerContent}
                            </motion.div>
                        </AnimatePresence>
                    </PopoverContent>
                </Popover>
            )}

            {error && errorMessage && (
                <p className="mt-1 text-xs text-brand-red">{errorMessage}</p>
            )}
        </div>
    )
}
