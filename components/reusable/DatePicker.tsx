"use client"

import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarIcon } from "@/lib/icons"
import { DateRange } from "react-day-picker"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  label?: string
  value?: string | Date | DateRange
  onChange?: (date: any) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  mode?: "single" | "range"
  error?: boolean
  errorMessage?: string
}

export const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  placeholder = "Selecione uma data",
  required,
  disabled,
  className,
  mode = "single",
  error,
  errorMessage,
}) => {
  const [open, setOpen] = React.useState(false)

  // Handle value conversion and display
  const displayValue = React.useMemo(() => {
    if (!value) return ""

    if (mode === "single") {
      const date = typeof value === "string" ? new Date(value) : (value as Date)
      if (isNaN(date.getTime())) return ""
      return format(date, "dd/MM/yyyy", { locale: ptBR })
    } else if (mode === "range") {
      const range = value as DateRange
      if (!range?.from) return ""
      if (!range.to) return format(range.from, "dd/MM/yyyy", { locale: ptBR })
      return `${format(range.from, "dd/MM/yyyy", { locale: ptBR })} - ${format(
        range.to,
        "dd/MM/yyyy",
        { locale: ptBR }
      )}`
    }
    return ""
  }, [value, mode])

  // Get date for calendar
  const calendarValue = React.useMemo(() => {
    if (!value) return undefined
    if (mode === "single") {
      return typeof value === "string" ? new Date(value) : (value as Date)
    }
    return value as DateRange
  }, [value, mode])

  return (
    <div className={cn("flex-1 w-full", className)}>
      {label && (
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
            {label}
            {required && <span className="text-brand-red"> *</span>}
          </label>
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full h-[42px] justify-start text-left font-normal transition-all duration-200",
              "bg-brand-gray dark:bg-dark-border/30 border-brand-border dark:border-dark-border",
              "hover:bg-white dark:hover:bg-dark-surface hover:border-brand-dark dark:hover:border-dark-body",
              "focus-visible:ring-0 focus:border-brand-dark dark:focus:border-dark-body",
              !value && "text-brand-inactive-text",
              error && "border-brand-red",
              open && "border-brand-dark dark:border-dark-body bg-white dark:bg-dark-surface ring-0 outline-none"
            )}
          >
            <CalendarIcon className="mr-3 ml-0.5 h-4 w-4 text-brand-inactive-text" />
            <span className="truncate">
              {displayValue || placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 border-brand-border dark:border-dark-border rounded-2xl overflow-hidden"
          align="start"
          sideOffset={8}
        >
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-white dark:bg-dark-surface"
            >
              <Calendar
                mode={mode as any}
                selected={calendarValue as any}
                onSelect={(val: any) => {
                  onChange?.(val)
                  if (mode === "single") setOpen(false)
                }}
                initialFocus
                locale={ptBR}
                className="p-4"
                classNames={{
                  day_selected: "bg-brand-dark dark:bg-dark-heading text-white hover:bg-brand-dark/90 dark:hover:bg-dark-heading/90",
                  day_today: "bg-accent text-accent-foreground font-bold border-2 border-brand-dark/10",
                  range_start: "rounded-l-md bg-brand-dark dark:bg-dark-heading text-white",
                  range_end: "rounded-r-md bg-brand-dark dark:bg-dark-heading text-white",
                  range_middle: "bg-brand-gray dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading rounded-none",
                }}
              />
            </motion.div>
          </AnimatePresence>
        </PopoverContent>
      </Popover>

      {error && errorMessage && (
        <p className="text-xs text-brand-red mt-1">{errorMessage}</p>
      )}
    </div>
  )
}
