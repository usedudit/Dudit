"use client"

import type React from "react"
import Dropdown, { DropdownItem } from "./Dropdown"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { InfoIcon } from "@/lib/icons"

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
  /** Tooltip text to show next to the label (info icon) */
  labelTooltip?: string | React.ReactNode
  /** Tooltip props for customization */
  labelTooltipProps?: React.ComponentProps<typeof TooltipContent>
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
  labelTooltip,
  labelTooltipProps,
}) => (
  <div className="flex-1 w-full" {...(dataField ? { "data-field": dataField } : {})}>
    {label && (
      <div className="flex items-center gap-2 mb-1.5">
        <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading truncate">{label}</label>
        {labelTooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="p-0.5 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-body transition-colors rounded flex items-center justify-center"
                aria-label="Mais informações"
              >
                <InfoIcon className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="start"
              {...labelTooltipProps}
            >
              {typeof labelTooltip === "string" ? (
                <p className="text-xs">{labelTooltip}</p>
              ) : (
                labelTooltip
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    )}
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
