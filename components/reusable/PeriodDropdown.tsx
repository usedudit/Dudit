"use client"

import React from "react"
import { CalendarIcon, CheckIcon } from "@/lib/icons"
import Dropdown, { DropdownItem } from "./Dropdown"

interface PeriodDropdownProps {
    options: { value: string; label: string }[]
    value: string
    setValue: (value: string) => void
    placeholder?: string
}

export const PeriodDropdown: React.FC<PeriodDropdownProps> = ({
    options,
    value,
    setValue,
    placeholder = "Período",
}) => (
    <Dropdown
        align="right"
        width="w-40"
        showChevron={false}
        fullWidth={false}
        trigger={
            <button
                type="button"
                aria-label={placeholder}
                title={placeholder}
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-brand-border bg-brand-gray text-brand-dark transition-colors hover:border-brand-dark dark:border-dark-border dark:bg-dark-border/30 dark:text-dark-heading dark:hover:border-dark-body"
            >
                <CalendarIcon size={18} />
            </button>
        }
    >
        {options.map((option) => {
            const isActive = option.value === value
            return (
                <DropdownItem key={option.value} onClick={() => setValue(option.value)}>
                    <span className={`flex-1 text-left ${isActive ? "font-bold text-brand-green" : ""}`}>
                        {option.label}
                    </span>
                    {isActive && <CheckIcon size={16} className="shrink-0 text-brand-green" />}
                </DropdownItem>
            )
        })}
    </Dropdown>
)

export default PeriodDropdown
