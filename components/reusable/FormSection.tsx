import type React from "react"

interface FormSectionProps {
    title?: string
    description?: string
    children: React.ReactNode
    className?: string
    hasSeparator?: boolean
}

export const FormSection: React.FC<FormSectionProps> = ({
    title,
    description,
    children,
    className = "",
    hasSeparator = false,
}) => (
    <>
        {hasSeparator && (
            <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full" />
        )}
        <div className={`${hasSeparator ? "mt-8" : ""} ${className}`.trim()}>
            {title && (
                <h2 className={`text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading ${description ? "mb-2" : "mb-6"}`}>{title}</h2>
            )}
            {description && (
                <p className="text-sm text-brand-inactive-text mb-6">{description}</p>
            )}
            <div className="space-y-6">{children}</div>
        </div>
    </>
)

