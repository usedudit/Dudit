import type React from "react"

interface FormSectionProps {
    title: string
    children: React.ReactNode
    className?: string
    hasSeparator?: boolean
}

export const FormSection: React.FC<FormSectionProps> = ({
    title,
    children,
    className = "",
    hasSeparator = false,
}) => (
    <>
        {hasSeparator && (
            <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full" />
        )}
        <div className={`${hasSeparator ? "mt-8" : ""} ${className}`.trim()}>
            <h2 className="text-lg lg:text-2xl font-medium text-brand-dark mb-6">{title}</h2>
            <div className="space-y-5">{children}</div>
        </div>
    </>
)

