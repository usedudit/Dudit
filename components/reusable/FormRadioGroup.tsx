"use client"

import type React from "react"
import { useState, useEffect } from "react"

interface RadioOption {
  value: string
  label: string
  description?: string
}

interface FormRadioGroupProps {
  label?: string
  name: string
  value: string
  options: RadioOption[]
  onChange: (value: string) => void
  required?: boolean
  className?: string
  disabled?: boolean
}

export const FormRadioGroup: React.FC<FormRadioGroupProps> = ({
  label,
  name,
  value,
  options,
  onChange,
  required,
  className,
  disabled,
}) => {
  return (
    <div className={`w-full ${className || ""}`}>
      {label && (
        <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 truncate">
          {label}
          {required && <span className="text-brand-red ml-1">*</span>}
        </label>
      )}
      <div className="space-y-3">
        {options.map((option) => (
          <RadioItem
            key={option.value}
            name={name}
            option={option}
            checked={value === option.value}
            onChange={() => !disabled && onChange(option.value)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}

// Componente interno para gerenciar a animação individual de cada item
const RadioItem = ({
  name,
  option,
  checked,
  onChange,
  disabled,
}: {
  name: string
  option: RadioOption
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) => {
  const [isAnimatingIn, setIsAnimatingIn] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [wasChecked, setWasChecked] = useState(checked)

  useEffect(() => {
    if (checked && !wasChecked) {
      setIsAnimatingIn(true)
      setIsAnimatingOut(false)
      setTimeout(() => setIsAnimatingIn(false), 250)
    } else if (!checked && wasChecked) {
      setIsAnimatingOut(true)
      setIsAnimatingIn(false)
      setTimeout(() => setIsAnimatingOut(false), 200)
    }
    setWasChecked(checked)
  }, [checked, wasChecked])

  const dotClasses = [
    "radio-dot",
    isAnimatingIn && "is-animating-in",
    isAnimatingOut && "is-animating-out",
    checked && !isAnimatingIn && !isAnimatingOut && "is-checked-statically",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <label
      className={`
        relative flex items-start p-4 border rounded-lg transition-all duration-200 cursor-pointer group
        ${
          checked
            ? "border-brand-green bg-brand-green/10 ring-1 ring-brand-green" // Estado Selecionado (Igual ao RadioButton anterior)
            : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-green/50"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <div className="flex items-center h-5">
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
        />
        {/* Visual da Bolinha (Estilo Preenchido/Filled) */}
        <div
          className={`
            w-5 h-5 rounded-full border 
            flex items-center justify-center
            transition-all duration-200 ease-out
            ${
              checked
                ? "bg-brand-green border-brand-green" // Círculo cheio verde
                : "bg-white border-brand-border dark:border-gray-600 dark:bg-dark-surface group-hover:border-brand-green/60"
            }
          `}
        >
           {/* Bolinha Interna Branca */}
          <div className={`${dotClasses} w-2 h-2 rounded-full bg-white`} />
        </div>
      </div>
      <div className="ml-3 flex-1">
        <span
          className={`block text-sm font-medium transition-colors ${
            checked ? "text-brand-dark dark:text-white" : "text-brand-dark dark:text-dark-heading"
          }`}
        >
          {option.label}
        </span>
        {option.description && (
          <p className="text-xs text-brand-dark/60 dark:text-dark-body/70 mt-1">
            {option.description}
          </p>
        )}
      </div>
    </label>
  )
}

export default FormRadioGroup
