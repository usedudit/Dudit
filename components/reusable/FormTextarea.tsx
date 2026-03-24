"use client"

import type React from "react"

interface FormTextareaProps {
  label: string
  placeholder?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onBlur?: () => void
  name: string
  disabled?: boolean
  labelAddon?: React.ReactNode
  required?: boolean
  maxLength?: number
  id?: string
  className?: string
  rows?: number
}

export const FormTextarea: React.FC<FormTextareaProps> = ({
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  name,
  disabled,
  labelAddon,
  required,
  maxLength,
  id,
  className,
  rows = 4,
}) => (
  <div className={`flex-1 w-full ${className || ""}`}>
    <div className="flex items-center gap-2 mb-1.5">
      <label htmlFor={id || name} className="text-sm font-medium text-brand-dark/80 dark:text-dark-body truncate">
        {label}
        {required && <span className="text-brand-red"> *</span>}
      </label>
      {labelAddon}
    </div>
    <textarea
      name={name}
      id={id || name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      required={required}
      maxLength={maxLength}
      rows={rows}
      className="w-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg py-2.5 px-4 text-sm focus:ring-brand-green focus:border-brand-green dark:focus:ring-brand-green dark:focus:border-brand-green focus:outline-none text-brand-dark dark:text-dark-heading placeholder:text-brand-dark/70 dark:placeholder:text-dark-heading/70 transition-colors disabled:bg-brand-gray dark:disabled:bg-dark-border/30 resize-y min-h-[100px]"
    />
  </div>
)

export default FormTextarea
