"use client"

import type React from "react"
import Dropdown, { DropdownItem } from "./Dropdown"

interface FormDropdownProps {
  label?: string
  options: { value: string; label: string }[]
  value: string
  setValue: (value: string) => void
  placeholder?: string
  width?: string
  actionItem?: { label: string; icon: React.ReactNode; onClick: () => void }
  disabled?: boolean
  className?: string
  error?: boolean
  errorMessage?: string
  onFocus?: () => void
  dataField?: string
}

export const FormDropdown: React.FC<FormDropdownProps> = ({
  label,
  options,
  value,
  setValue,
  placeholder = "Selecione",
  width,
  actionItem,
  disabled,
  className,
  error,
  errorMessage,
  onFocus,
  dataField,
}) => (
  <div className="flex-1 w-full" {...(dataField ? { "data-field": dataField } : {})}>
    {label && <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 truncate">{label}</label>}
    <Dropdown
      className={className}
      trigger={
        <button
          disabled={disabled}
          onFocus={onFocus}
          className={`flex items-center text-brand-dark dark:text-dark-heading 
          bg-brand-gray dark:bg-dark-border/30 
          
          focus:bg-white dark:focus:bg-dark-surface focus:outline-none

          border ${error ? "border-brand-red" : "border-brand-border dark:border-dark-border focus:border-brand-dark dark:focus:border-dark-body"
            } rounded-lg py-2.5 px-4 text-sm 
          
          transition-colors duration-150 w-full text-left justify-between 
          disabled:bg-brand-gray dark:disabled:bg-dark-border/30 disabled:cursor-not-allowed`}
        >
          <span className={`truncate block ${!value ? "text-brand-inactive-text" : ""}`}>
            {options.find((o) => o.value === value)?.label || placeholder}
          </span>
        </button>
      }
      align="left"
      width="w-full"
    >
      {options.map((option) => (
        <DropdownItem
          key={option.value}
          onClick={() => {
            setValue(option.value)
            if (onFocus) onFocus()
          }}
        >
          {option.label}
        </DropdownItem>
      ))}
      {actionItem && (
        <>
          <div className="border-t border-brand-border dark:border-dark-border my-1 mx-1"></div>
          <DropdownItem onClick={actionItem.onClick}>
            <div className="flex items-center gap-2 text-brand-dark dark:text-dark-heading">
              {actionItem.icon}
              <span>{actionItem.label}</span>
            </div>
          </DropdownItem>
        </>
      )}
    </Dropdown>
    {error && errorMessage && <p className="text-xs text-brand-red mt-1">{errorMessage}</p>}
  </div>
)
