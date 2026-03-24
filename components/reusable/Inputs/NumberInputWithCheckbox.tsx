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
}

export const NumberInputWithCheckbox: React.FC<NumberInputWithCheckboxProps> = ({
  label,
  placeholder = "123",
  value,
  number,
  noNumber,
  onNumberChange,
  onNoNumberChange,
  required = false,
  disabled = false,
}) => {
  const displayPlaceholder = noNumber ? "S/N" : placeholder

  return (
    <div className="w-full">
      <label htmlFor="number" className="text-sm font-medium text-brand-dark/80 block mb-1.5">
        {label}
        {required && <span className="text-brand-red"> *</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          id="number"
          name="number"
          placeholder={displayPlaceholder}
          value={number}
          onChange={onNumberChange}
          disabled={noNumber || disabled}
          required={required && !noNumber}
          className="w-full bg-white border border-brand-border rounded-lg py-2.5 px-4 pr-20 text-sm focus:border-brand-green focus:outline-none text-brand-dark placeholder:text-brand-dark/70 transition-colors disabled:bg-brand-gray disabled:text-gray-400"
        />
        <label
          htmlFor="noNumber"
          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center cursor-pointer gap-1.5 text-xs text-brand-dark/80 whitespace-nowrap"
        >
          <input
            id="noNumber"
            name="noNumber"
            type="checkbox"
            checked={noNumber}
            onChange={(e) => onNoNumberChange(e.target.checked)}
            disabled={disabled}
            className="custom-checkbox"
          />
          <span>Sem nº</span>
        </label>
      </div>
    </div>
  )
}
