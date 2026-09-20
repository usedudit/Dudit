import type React from "react"
import { FormSection } from "./FormSection"

interface SidebarCardProps {
    title?: React.ReactNode
    children: React.ReactNode
    className?: string
    hasTopStrip?: boolean
    hasSeparator?: boolean
    headerRight?: React.ReactNode
}

export const SidebarCard: React.FC<SidebarCardProps> = ({
    title,
    children,
    className = "",
    hasTopStrip = false,
    hasSeparator = false,
    headerRight,
}) => (
    <>
        {/* Desktop: card */}
        <div className={`hidden lg:block bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
            {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
            {(title || headerRight) ? (
                <div className="flex items-center justify-between mb-6 mt-2">
                    <div className="min-w-0 flex-1">
                        {title ? (
                            <h3 className="text-md lg:text-lg font-medium text-brand-dark dark:text-dark-heading">{title}</h3>
                        ) : null}
                    </div>
                    {headerRight && <div className="shrink-0 ml-4">{headerRight}</div>}
                </div>
            ) : null}
            {children}
        </div>
        {/* Mobile/Tablet: FormSection */}
        <FormSection title={title} headerRight={headerRight} hasSeparator={hasSeparator} className="lg:hidden">
            {children}
        </FormSection>
    </>
)
