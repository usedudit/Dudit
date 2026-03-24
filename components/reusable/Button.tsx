"use client"

import React from "react"
import { Spinner } from "@/components/reusable/Spinner"
import { Slot } from "@radix-ui/react-slot"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline" | "outlinered" | "destructive" | "ghost" | "filled" | "link"
    size?: "default" | "sm" | "lg" | "icon"
    asChild?: boolean
    isLoading?: boolean
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        { children, variant = "default", size = "default", asChild = false, isLoading = false, disabled, leftIcon, rightIcon, className = "", ...props },
        ref,
    ) => {
        const baseStyles =
            "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"

        const sizes = {
            default: "py-2.5 px-3",
            sm: "h-9 px-3",
            lg: "h-11 px-8",
            icon: "h-9 w-9 p-0 rounded-full",
        }

        const variants = {
            default:
                "bg-brand-green text-white hover:bg-brand-green/90 focus-visible:ring-brand-green/50 dark:bg-brand-green dark:hover:bg-brand-green/90",
            outline:
                "bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border focus-visible:ring-brand-border",
            outlinered:
                "border border-brand-red/20 text-brand-red hover:bg-brand-red/5 hover:border-brand-red/50 dark:text-brand-red dark:border-brand-red/20 dark:hover:bg-brand-red/10 dark:hover:bg-brand-red/5 dark:hover:border-brand-red/50",
            destructive:
                "bg-brand-red text-white hover:bg-brand-red/90 focus-visible:ring-brand-red/50 dark:bg-brand-red/30 dark:text-white dark:hover:bg-brand-red/40",
            ghost:
                "bg-transparent text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-dark-border focus-visible:ring-gray-300 dark:focus-visible:ring-dark-border",
            filled:
                "bg-gray-100 dark:bg-dark-border hover:bg-gray-100/50 dark:hover:bg-dark-border/50 focus-visible:ring-gray-300 dark:focus-visible:ring-dark-border",
            link:
                "text-sm font-bold text-brand-dark dark:text-dark-heading decoration-gray-300 hover:text-brand-green flex items-center hover:underline"
        }

        const sizeClass = sizes[size as keyof typeof sizes] || sizes.default
        const Comp = asChild ? Slot : "button"

        if (asChild) {
            return (
                <Comp
                    ref={ref}
                    className={`${baseStyles} ${sizeClass} ${variants[variant]} ${className}`}
                    {...(props as any)}
                >
                    {children}
                </Comp>
            )
        }

        return (
            <button
                ref={ref}
                disabled={disabled || isLoading}
                className={`${baseStyles} ${sizeClass} ${variants[variant]} ${className}`}
                {...props}
            >
                {isLoading && <Spinner size={18} className="text-white" />}
                {!isLoading && leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
                {children}
                {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
            </button>
        )
    },
)

Button.displayName = "Button"

export default Button
