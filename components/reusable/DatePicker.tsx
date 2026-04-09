"use client"

import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { DateRange, DayPicker, DayButton, getDefaultClassNames } from "react-day-picker"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "@/lib/utils"
import { Button } from "@/components/reusable/Button"
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon
} from "@/lib/icons"
import { useIsMobile } from "@/components/ui/use-mobile"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"

// --- Local Calendar Component (Using Reusable Button and Brand Icons) ---

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (modifiers?.focused) ref.current?.focus()
  }, [modifiers?.focused])

  const isSelected = modifiers?.selected || props['aria-selected'] === true || props['aria-selected'] === "true" || ('data-selected' in props)
  const isRangeMiddle = modifiers?.range_middle || ('data-range-middle' in props)
  const isToday = modifiers?.today || props['aria-current'] === "date"

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn(
        "relative flex aspect-square size-auto w-full min-w-[32px] flex-col gap-1 leading-none font-normal transition-all duration-200 rounded-md",
        "hover:bg-brand-slate hover:text-brand-dark",
        isToday && "bg-brand-gray text-brand-dark font-bold border border-brand-border dark:bg-dark-border/50 dark:text-dark-heading dark:border-dark-border",
        isSelected && !isRangeMiddle && "!bg-brand-green !text-white hover:!bg-brand-green/90 hover:!text-white",
        isRangeMiddle && "bg-brand-gray text-brand-dark rounded-none",
        modifiers?.outside && "text-brand-inactive-text opacity-50",
        modifiers?.disabled && "text-brand-inactive-text opacity-30 cursor-not-allowed",
        "aria-[selected=true]:!bg-brand-green aria-[selected=true]:!text-white aria-[selected=true]:hover:!bg-brand-green/90 aria-[selected=true]:hover:!text-white",
        "data-[selected]:!bg-brand-green data-[selected]:!text-white data-[selected]:hover:!bg-brand-green/90 data-[selected]:hover:!text-white",
        className
      )}
      {...props}
    />
  )
}

function LocalCalendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      locale={ptBR}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("flex gap-4 flex-col md:flex-row relative", defaultClassNames.months),
        month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
        nav: cn("flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between", defaultClassNames.nav),
        month_caption: "flex items-center justify-center h-8 w-full px-8 text-sm font-bold text-brand-dark dark:text-dark-heading",
        dropdowns: "w-full flex items-center text-xs font-medium justify-center h-8 gap-1.5",
        table: "w-full border-collapse",
        weekdays: "flex mb-1",
        weekday: "text-brand-inactive-text rounded-md flex-1 font-medium text-[0.75rem] select-none text-center",
        week: "flex w-full mt-1.5",
        day: "relative w-full h-full p-0 text-center group/day aspect-square select-none",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === "left") return <ChevronLeftIcon size={18} />
          if (orientation === "right") return <ChevronRightIcon size={18} />
          return <ChevronDownIcon size={18} />
        },
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  )
}

// --- Main DatePicker Component ---

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
  const isMobile = useIsMobile()

  // Helper to parse string date using local time
  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return undefined
    if (dateStr.includes('-') && !dateStr.includes('T')) {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    }
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? undefined : date
  }

  const displayValue = React.useMemo(() => {
    if (!value) return ""

    if (mode === "single") {
      const date = typeof value === "string" ? parseLocalDate(value) : (value as Date)
      if (!date || isNaN(date.getTime())) return ""
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

  const calendarValue = React.useMemo(() => {
    if (!value) return undefined
    if (mode === "single") {
      return typeof value === "string" ? parseLocalDate(value) : (value as Date)
    }
    return value as DateRange
  }, [value, mode])

  const CalendarContent = (
    <LocalCalendar
      mode={mode as any}
      selected={calendarValue as any}
      onSelect={(val: any) => {
        onChange?.(val)
        if (mode === "single") setOpen(false)
      }}
      initialFocus
    />
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
        <CalendarIcon className="mr-3 h-4 w-4 flex-shrink-0 text-brand-inactive-text" />
        <span className={cn("truncate", !value && "text-brand-inactive-text")}>
          {displayValue || placeholder}
        </span>
      </span>
      <ChevronDownIcon
        className={cn(
          "ml-2 h-4 w-4 flex-shrink-0 text-brand-inactive-text transition-transform duration-200",
          open && "rotate-180"
        )}
      />
    </Button>
  )

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

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            {Trigger}
          </DrawerTrigger>
          <DrawerContent className="p-0">
            <DrawerHeader className="border-b border-brand-border dark:border-dark-border pb-4">
              <DrawerTitle className="text-brand-dark dark:text-dark-heading font-bold">
                {label || placeholder}
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex justify-center p-4">
              {CalendarContent}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            {Trigger}
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0 border-brand-border dark:border-dark-border rounded-2xl overflow-hidden shadow-xl"
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
                {CalendarContent}
              </motion.div>
            </AnimatePresence>
          </PopoverContent>
        </Popover>
      )}

      {error && errorMessage && (
        <p className="text-xs text-brand-red mt-1">{errorMessage}</p>
      )}
    </div>
  )
}
