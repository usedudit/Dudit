"use client"

import type React from "react"

interface NumberInputWithCheckboxProps {
  label: string
  placeholder?: string
  value: string
  number: string
  noNumber: boolean
  onNumberChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onNoNumberChange: (checked: boolean) => void
  required?: boolean
  disabled?: boolean
  error?: boolean
  errorMessage?: string
}

export const NumberInputWithCheckbox: React.FC<
  NumberInputWithCheckboxProps
> = ({
  label,
  placeholder = "123",
  number,
  noNumber,
  onNumberChange,
  onNoNumberChange,
  required = false,
  disabled = false,
  error = false,
  errorMessage,
}) => {
    const displayPlaceholder = noNumber ? "S/N" : placeholder

    const inputId = "number-input"

    // 🔥 mesmas classes base do Input
    const baseInputClasses = `
    w-full h-[42px]
    bg-brand-gray dark:bg-dark-border/30
    border
    ${error ? "border-brand-red" : "border-brand-border dark:border-dark-border"}
    rounded-lg
    text-sm
    text-brand-dark dark:text-dark-heading
    placeholder:text-brand-inactive-text
    focus:outline-none
    focus:border-brand-dark dark:focus:border-dark-body
    focus:bg-white dark:focus:bg-dark-surface
    transition-colors
    disabled:bg-brand-gray dark:disabled:bg-dark-border/30
    disabled:cursor-not-allowed
  `

    // padding ajustado pro checkbox dentro
    const paddingClasses = "pl-4 pr-20 py-2"

    return (
      <div className="flex-1 w-full">
        {/* LABEL */}
        <div className="flex items-center gap-2 mb-1.5">
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate"
          >
            {label}
            {required && <span className="text-brand-red"> *</span>}
          </label>
        </div>

        {/* INPUT + CHECKBOX */}
        <div className="relative">
          <input
            id={inputId}
            type="text"
            name="number"
            placeholder={displayPlaceholder}
            value={number}
            onChange={onNumberChange}
            disabled={noNumber || disabled}
            required={required && !noNumber}
            className={`${baseInputClasses} ${paddingClasses}`}
          />

          {/* Checkbox como "suffix" */}
          <label
            htmlFor="noNumber"
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-brand-dark dark:text-dark-heading cursor-pointer"
          >
            <input
              id="noNumber"
              name="noNumber"
              type="checkbox"
              checked={noNumber}
              onChange={(e) => onNoNumberChange(e.target.checked)}
              disabled={disabled}
              className={`
                custom-checkbox
                !border
                ${noNumber ? "!border-brand-green" : "!border-brand-border dark:!border-dark-border"}
              `}
            />
            <span>Sem nº</span>
          </label>
        </div>

        {/* ERROR */}
        <div className="flex justify-between mt-1">
          {error && errorMessage ? (
            <p className="text-xs text-brand-red">{errorMessage}</p>
          ) : (
            <div />
          )}
        </div>
      </div>
    )
  }