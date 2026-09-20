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
        "bg-brand-green-secondary text-brand-green dark:bg-emerald-900/30 dark:text-emerald-400",
    red:
        "bg-brand-red-secondary text-brand-red dark:bg-red-900/30 dark:text-red-400",
    orange:
        "bg-brand-orange-secondary text-brand-orange dark:bg-orange-900/30 dark:text-orange-400",
    blue:
        "bg-brand-blue-secondary text-brand-blue dark:bg-blue-900/30 dark:text-blue-400",
    cyan:
        "bg-brand-cyan-secondary text-brand-cyan dark:bg-cyan-900/30 dark:text-cyan-400",
    purple:
        "bg-brand-purple-secondary text-brand-purple dark:bg-purple-900/30 dark:text-purple-400",
    gray:
        "bg-brand-gray text-brand-dark dark:bg-dark-border/30 dark:text-dark-heading",
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
    green: "text-brand-green dark:text-green-400 fill-green-600/10",
    red: "text-brand-red dark:text-red-400 fill-red-600/10",
    orange: "text-brand-orange dark:text-orange-400 fill-orange-600/10",
    blue: "text-brand-blue dark:text-blue-400",
    cyan: "text-brand-cyan dark:text-cyan-400",
    purple: "text-brand-purple dark:text-purple-400",
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
                className={`inline-flex items-center gap-1.5 ${paddingClass} rounded-full text-[11px] font-bold ${variantStyles[variant]} ${className}`}
                {...props}
            >
                {renderIcon()}
                {children}
            </span>
        )
    }
)

Badge.displayName = "Badge"