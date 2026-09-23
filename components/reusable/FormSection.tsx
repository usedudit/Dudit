import type React from "react"

interface FormSectionProps {
    title?: string | React.ReactNode
    titleRight?: React.ReactNode
    headerRight?: React.ReactNode
    description?: string
    children?: React.ReactNode
    className?: string
    hasSeparator?: boolean
}

export const FormSection: React.FC<FormSectionProps> = ({
    title,
    titleRight,
    headerRight,
    description,
    children,
    className = "",
    hasSeparator = false,
}) => (
    <>
        {hasSeparator && (
            <div className={`border-t border-brand-border dark:border-dark-border mb-8 w-full ${className}`} />
        )}
        <div className={`${hasSeparator ? "mt-8 mb-8" : ""} ${className}`.trim()}>
            {(title || headerRight) && (
                <div className="flex items-center justify-between mb-6">
                    <div className="min-w-0 flex-1">
                        {title && (
                            <div className="flex items-center gap-3">
                                <h2 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading">{title}</h2>
                                {titleRight && <div className="shrink-0">{titleRight}</div>}
                            </div>
                        )}
                        {description && (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">{description}</p>
                        )}
                    </div>
                    {headerRight && <div className="shrink-0 ml-4">{headerRight}</div>}
                </div>
            )}
            {children && <div className="space-y-6">{children}</div>}
        </div>
    </>
)

