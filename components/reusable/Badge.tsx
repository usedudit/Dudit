import React from "react"
import {
    CheckCircleIcon,
    CancelCircleIcon,
    AlertTriangleIcon,
    BlockedIcon,
    InfoIcon,
    AwardIcon,
} from "@/lib/icons"

export type BadgeVariant =
    | "green"
    | "red"
    | "orange"
    | "blue"
    | "cyan"
    | "purple"
    | "gray"

interface BadgeProps {
    variant: BadgeVariant
    children?: React.ReactNode
    icon?: React.ReactElement<{ className?: string }> | null
    className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
    green:
        "bg-green-50 text-green-700 border-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900/50",
    red:
        "bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30",
    orange:
        "bg-orange-50 text-brand-orange border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/30",
    blue:
        "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30",
    cyan:
        "bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-900/30",
    purple:
        "bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-900/30",
    gray:
        "bg-brand-gray text-brand-dark border-brand-border dark:bg-dark-border/30 dark:text-dark-heading dark:border-dark-border",
}

const defaultIcons: Partial<Record<BadgeVariant, React.ElementType>> = {
    green: CheckCircleIcon,
    red: CancelCircleIcon,
    orange: AlertTriangleIcon,
    blue: InfoIcon,
    cyan: CheckCircleIcon,
    purple: AwardIcon,
    gray: BlockedIcon,
}

const defaultIconStyles: Partial<Record<BadgeVariant, string>> = {
    green: "text-green-600 dark:text-green-400 fill-green-600/10",
    red: "text-brand-red dark:text-red-400 fill-red-600/10",
    orange: "text-brand-orange dark:text-orange-400 fill-orange-600/10",
    blue: "text-blue-600 dark:text-blue-400",
    cyan: "text-cyan-600 dark:text-cyan-400",
    purple: "text-purple-600 dark:text-purple-400",
    gray: "text-brand-inactive-text dark:text-dark-body",
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ variant, children, icon, className = "", ...props }, ref) => {
        const DefaultIconComponent = defaultIcons[variant]
        const hasDefaultIcon = !!DefaultIconComponent

        const hasChildren = React.Children.count(children) > 0
        const paddingClass = hasChildren
            ? "px-2.5 py-1"
            : "p-1.5 w-6 h-6 justify-center"

        const iconBaseClass = `w-3 h-3 ${defaultIconStyles[variant] ?? ""}`

        const renderIcon = () => {
            if (icon === null) return null

            if (icon) {
                if (React.isValidElement(icon)) {
                    return React.cloneElement(icon, {
                        className: `${iconBaseClass} ${icon.props.className ?? ""}`,
                    })
                }
                return icon
            }

            // 👉 fallback pro default
            if (hasDefaultIcon && DefaultIconComponent) {
                return <DefaultIconComponent className={iconBaseClass} />
            }

            return null
        }

        return (
            <span
                ref={ref}
                className={`inline-flex items-center gap-1.5 ${paddingClass} rounded-full text-[11px] font-bold border ${variantStyles[variant]} ${className}`}
                {...props}
            >
                {renderIcon()}
                {children}
            </span>
        )
    }
)

Badge.displayName = "Badge"