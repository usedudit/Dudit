"use client"

import type React from "react"

import { useEffect, useState } from "react"

interface FormCurrencyInputProps {
  label: string
  name?: string
  id?: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  required?: boolean
  placeholder?: string
  maxLength?: number
}

export function FormCurrencyInput({
  label,
  name,
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = "0,00",
  maxLength,
}: FormCurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(
    value > 0 ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(value) : "",
  )

  useEffect(() => {
    const currentNumericValue = Number(displayValue.replace(/\./g, "").replace(",", "."))
    if (value !== currentNumericValue) {
      setDisplayValue(value > 0 ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(value) : "")
    }
  }, [value, displayValue])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value
    const numericString = inputVal.replace(/\D/g, "")

    if (numericString === "") {
      onChange(0)
      setDisplayValue("")
      return
    }

    const numericValue = Number(numericString) / 100
    onChange(numericValue)
    setDisplayValue(new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(numericValue))
  }

  const handleBlur = () => {
    setDisplayValue(value > 0 ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(value) : "")
  }

  return (
    <div className="flex-1 w-full">
      <label
        htmlFor={id || name}
        className="text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1.5 truncate"
      >
        {label}
        {required && <span className="text-brand-red ml-1">*</span>}
      </label>
      <div className="relative flex items-center">
        <span className="absolute left-4 text-sm text-brand-inactive-text dark:text-dark-body pointer-events-none">
          R$
        </span>
        <input
          type="text"
          inputMode="decimal"
          name={name}
          id={id || name}
          value={displayValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg py-2.5 pl-11 pr-4 text-sm focus:border-brand-green dark:focus:border-brand-green focus:outline-none text-brand-dark dark:text-dark-heading placeholder:text-brand-dark/70 dark:placeholder:text-dark-heading/70 transition-colors disabled:bg-brand-gray dark:disabled:bg-dark-border/30"
        />
      </div>
    </div>
  )
}
