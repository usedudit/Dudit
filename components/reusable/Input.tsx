"use client"

import type React from "react"

interface FormInputProps {
  label?: string
  placeholder?: string
  type?: string
  value?: string | number
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  onChange?: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void
  onBlur?: () => void
  onFocus?: () => void
  name?: string
  disabled?: boolean
  readOnly?: boolean
  inputMode?: "search" | "text" | "none" | "tel" | "url" | "email" | "numeric" | "decimal"
  labelAddon?: React.ReactNode
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>
  autoFocus?: boolean
  required?: boolean
  min?: string | number
  max?: string | number
  maxLength?: number
  step?: string
  id?: string
  className?: string
  multiline?: boolean
  rows?: number
  pattern?: string
  title?: string
  error?: boolean
  errorMessage?: string
  variant?: "default" | "full-rounded"
  autoComplete?: string
  spellCheck?: boolean
  autoCorrect?: string
  autoCapitalize?: string
}

export const Input: React.FC<FormInputProps> = ({
  label,
  placeholder,
  type = "text",
  value,
  prefix,
  suffix,
  onChange,
  onBlur,
  onFocus,
  name,
  disabled = false,
  readOnly = false,
  labelAddon,
  required,
  min,
  max,
  maxLength,
  step,
  id,
  className,
  multiline = false,
  rows = 4,
  pattern,
  title,
  error = false,
  errorMessage,
  variant = "default",
  inputMode,
  onKeyDown,
  autoFocus,
  autoComplete,
  spellCheck,
  autoCorrect,
  autoCapitalize,
}) => {
  const inputId = id || name || Math.random().toString(36).substring(7)

  const borderRadiusClass =
    variant === "full-rounded" ? "rounded-full" : "rounded-lg"

  const labelSpacingClass =
    variant === "full-rounded" ? "" : "gap-2 mb-1.5"

  const baseInputClasses = `
    w-full h-[42px]
    bg-brand-gray dark:bg-dark-border/30
    border
    ${error ? "border-brand-red" : "border-brand-border dark:border-dark-border"}
    ${borderRadiusClass}
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

  const paddingClasses = `
    ${prefix ? "pl-10" : "px-4"}
    ${suffix ? "pr-10" : "pr-4"}
    py-2
  `

  const handleFocus = () => {
    onFocus?.()
  }

  return (
    <div className={`flex-1 w-full ${className ?? ""}`}>
      {label && (
        <div className={`flex items-center ${labelSpacingClass}`}>
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-brand-dark dark:text-dark-body truncate"
          >
            {label}
            {required && <span className="text-brand-red"> *</span>}
          </label>
          {labelAddon}
        </div>
      )}

      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark dark:text-dark-heading pointer-events-none">
            {prefix}
          </span>
        )}

        {multiline ? (
          <textarea
            id={inputId}
            name={name}
            value={value}
            placeholder={placeholder}
            onChange={onChange}
            onBlur={onBlur}
            onFocus={handleFocus}
            disabled={disabled}
            required={required}
            maxLength={maxLength}
            inputMode={inputMode}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            readOnly={readOnly}
            autoComplete={autoComplete}
            spellCheck={spellCheck}
            {...({ autoCorrect, autoCapitalize } as any)}
            rows={rows}
            className={`${baseInputClasses} px-4 py-2.5 resize-none`}
          />
        ) : (
          <input
            id={inputId}
            type={type}
            name={name}
            value={value}
            placeholder={placeholder}
            onChange={onChange as React.ChangeEventHandler<HTMLInputElement>}
            onBlur={onBlur}
            onFocus={handleFocus}
            disabled={disabled}
            required={required}
            min={min}
            max={max}
            maxLength={maxLength}
            step={step}
            pattern={pattern}
            title={title}
            inputMode={inputMode}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            readOnly={readOnly}
            autoComplete={autoComplete}
            spellCheck={spellCheck}
            {...({ autoCorrect, autoCapitalize } as any)}
            className={`${baseInputClasses} ${paddingClasses}`}
          />
        )}

        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {suffix}
          </div>
        )}
      </div>

      {error && errorMessage && (
        <p className="mt-1 text-xs text-brand-red">{errorMessage}</p>
      )}
    </div>
  )
}

export default Input
