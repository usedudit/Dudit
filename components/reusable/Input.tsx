"use client"

import { cn } from "@/lib/utils"
import React, { forwardRef } from "react"

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
  onBlur?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>
  onFocus?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>
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
  showCharacterCount?: boolean
}

export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, FormInputProps>(
  (
    {
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
      showCharacterCount = false,
    },
    ref
  ) => {
    const inputId = id || name || Math.random().toString(36).substring(7)

    const isLocked = disabled || readOnly

    const borderRadiusClass =
      variant === "full-rounded" ? "rounded-full" : "rounded-lg"

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
    ${isLocked ? "cursor-not-allowed pointer-events-none opacity-80" : ""}
  `

    const paddingClasses = `
    ${prefix ? "pl-10" : "px-4"}
    ${suffix ? "pr-10" : "pr-4"}
    py-2
  `

    const handleFocus: React.FocusEventHandler<
      HTMLInputElement | HTMLTextAreaElement
    > = (event) => {
      if (readOnly) return
      onFocus?.(event)
    }

    return (
      <div className={cn("flex-1 w-full", className)}>
        {label && (
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate"
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
              ref={ref as React.Ref<HTMLTextAreaElement>}
              id={inputId}
              name={name}
              value={value}
              placeholder={placeholder}
              onChange={onChange}
              onBlur={onBlur}
              onFocus={handleFocus}
              disabled={disabled}
              readOnly={readOnly}
              required={required}
              maxLength={maxLength}
              inputMode={inputMode}
              onKeyDown={onKeyDown}
              autoFocus={autoFocus}
              autoComplete={autoComplete}
              spellCheck={spellCheck}
              tabIndex={readOnly ? -1 : 0}
              {...({ autoCorrect, autoCapitalize } as any)}
              rows={rows}
              className={`${baseInputClasses} px-4 py-2.5 resize-none`}
            />
          ) : (
            <input
              ref={ref as React.Ref<HTMLInputElement>}
              id={inputId}
              type={type}
              name={name}
              value={value}
              placeholder={placeholder}
              onChange={onChange as React.ChangeEventHandler<HTMLInputElement>}
              onBlur={onBlur}
              onFocus={handleFocus}
              disabled={disabled}
              readOnly={readOnly}
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
              autoComplete={autoComplete}
              spellCheck={spellCheck}
              tabIndex={readOnly ? -1 : 0}
              {...({ autoCorrect, autoCapitalize } as any)}
              className={`${baseInputClasses} ${paddingClasses}`}
            />
          )}

          {suffix && (
            <div className="absolute right-3 top-0 h-full flex items-center justify-center">
              {suffix}
            </div>
          )}
        </div>

        <div className="flex justify-between mt-1">
          {error && errorMessage ? (
            <p className="text-xs text-brand-red">{errorMessage}</p>
          ) : (
            <div />
          )}

          {maxLength && showCharacterCount && (
            <p className="text-[11px] text-brand-inactive-text font-medium">
              {String(value || "").length}/{maxLength}
            </p>
          )}
        </div>
      </div>
    )
  })

Input.displayName = "Input"

export default Input