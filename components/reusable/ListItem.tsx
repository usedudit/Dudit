"use client"

import React from "react"
import { ChevronRightIcon } from "@/lib/icons"

interface ListItemProps {
    icon?: React.ComponentType<any> | React.ReactNode
    title: React.ReactNode
    description?: React.ReactNode
    onClick?: () => void
    right?: React.ReactNode
    left?: React.ReactNode
    showChevron?: boolean
    titleClassName?: string
    descriptionClassName?: string
    className?: string
}

export const ListItem: React.FC<ListItemProps> = ({
    icon,
    title,
    description,
    onClick,
    right,
    left,
    showChevron = false,
    titleClassName = "",
    descriptionClassName = "",
    className = "",
}) => {
    const isComponent =
        typeof icon === "function" ||
        (typeof icon === "object" && icon !== null && !React.isValidElement(icon))

    return (
        <div
            onClick={onClick}
            className={`group flex items-center rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all cursor-pointer ${className}`}
        >
            {left && <div className="shrink-0">{left}</div>}

            {icon && (
                <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex border border-brand-border dark:border-dark-border items-center justify-center shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-dark-border/90 transition-colors">
                    {isComponent ? (
                        React.createElement(icon as React.ComponentType<any>, {
                            className: "text-brand-dark dark:text-dark-heading",
                        })
                    ) : (
                        icon
                    )}
                </div>
            )}

            <div className="flex-1 min-w-0">
                <h3
                    className={`text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate ${titleClassName}`}
                >
                    {title}
                </h3>

                {description && (
                    <p
                        className={`text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body leading-tight whitespace-normal break-words ${descriptionClassName}`}
                    >
                        {description}
                    </p>
                )}
            </div>

            {right ? (
                right
            ) : showChevron ? (
                <ChevronRightIcon className="text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors shrink-0" />
            ) : null}
        </div>
    )
}