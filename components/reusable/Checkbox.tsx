"use client"

import type React from "react"

export interface CheckboxProps {
  id?: string
  name?: string
  label?: React.ReactNode
  checked: boolean
  onChange?: (checked: boolean) => void
  onCheckedChange?: (checked: boolean | "indeterminate") => void
  disabled?: boolean
  className?: string
}

export const Checkbox: React.FC<CheckboxProps> = ({
  id,
  name,
  label,
  checked,
  onChange,
  onCheckedChange,
  disabled,
  className = "",
}) => {
  const inputId = id || name

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return

    const newChecked = e.target.checked
    onChange?.(newChecked)
    onCheckedChange?.(newChecked)
  }

  return (
    <label
      htmlFor={inputId}
      className={`
        flex items-center gap-2 w-fit
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
    >
      <input
        id={inputId}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        className={`
          custom-checkbox focus-visible
          !border !border-brand-border dark:!border-brand-dark
          ${disabled ? "cursor-not-allowed" : "cursor-pointer"}
        `}
      />
      {label && (
        <span className="text-sm font-medium text-brand-dark dark:text-dark-heading select-none">
          {label}
        </span>
      )}
    </label>
  )
}
