"use client"

import type React from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { InfoIcon } from "@/lib/icons"

interface FormTextareaProps {
    label?: string
    placeholder?: string
    value?: string
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
    onBlur?: () => void
    name?: string
    disabled?: boolean
    labelAddon?: React.ReactNode
    /** Tooltip text to show next to the label (info icon) */
    labelTooltip?: string | React.ReactNode
    /** Tooltip props for customization */
    labelTooltipProps?: React.ComponentProps<typeof TooltipContent>
    required?: boolean
    maxLength?: number
    id?: string
    className?: string
    rows?: number
    error?: boolean
    errorMessage?: string
    showCharacterCount?: boolean
    dataField?: string
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
    error = false,
    errorMessage,
    showCharacterCount = false,
    dataField,
    labelTooltip,
    labelTooltipProps,
}) => (
    <div className={`flex-1 w-full ${className || ""}`} {...(dataField ? { "data-field": dataField } : {})}>
        {(label || labelAddon) && (
            <div className="flex items-center gap-2 mb-1.5">
                {label && (
                    <label htmlFor={id || name} className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                        {label}
                        {required && <span className="text-brand-red"> *</span>}
                    </label>
                )}
                {labelTooltip && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"

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
                {labelAddon}
            </div>
        )}
        <div className="min-h-[100px]">
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
                className={`w-full bg-brand-gray dark:bg-dark-border/30 border rounded-lg py-2.5 px-4 text-sm focus:bg-white dark:focus:bg-dark-surface focus:ring-brand-green focus:border-brand-green dark:focus:ring-brand-green dark:focus:border-brand-green focus:outline-none text-brand-dark dark:text-dark-heading placeholder:text-brand-dark/70 dark:placeholder:text-dark-heading/70 transition-colors disabled:bg-brand-gray dark:disabled:bg-dark-border/30 resize-y min-h-[100px] ${error ? "border-brand-red" : "border-brand-border dark:border-dark-border"}`}
            />
        </div>
        {maxLength && showCharacterCount && (
            <div className="flex justify-end mt-1">
                {error && errorMessage ? (
                    <p className="text-xs text-brand-red">{errorMessage}</p>
                ) : (
                    <div />
                )}
                <p className="text-[11px] text-brand-inactive-text font-medium">
                    {String(value || "").length}/{maxLength}
                </p>
            </div>
        )}
    </div>
)

export default FormTextarea
