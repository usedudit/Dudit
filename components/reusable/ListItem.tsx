"use client"

import React from "react"
import { ChevronRightIcon } from "@/lib/icons"

interface ListItemProps {
    icon?: React.ComponentType<any>
    title: string
    description?: string
    onClick?: () => void
    right?: React.ReactNode
    left?: React.ReactNode
    showChevron?: boolean
    titleClassName?: string
    descriptionClassName?: string
    className?: string
}

export const ListItem: React.FC<ListItemProps> = ({
    icon: Icon,
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
    return (
        <div
            onClick={onClick}
            className={`group flex items-center py-3 gap-2 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-dark-heading/30 transition-all cursor-pointer ${className}`}
        >
            {left && <div className="flex-shrink-0">{left}</div>}

            {Icon && (
                <div className="w-12 h-12 rounded-full bg-[#f3f5f9] dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <Icon className="text-brand-dark dark:text-dark-heading" />
                </div>
            )}

            <div className="flex-1">
                <h3
                    className={`text-base font-bold text-brand-dark dark:text-dark-heading truncate ${titleClassName}`}
                >
                    {title}
                </h3>

                {description && (
                    <p
                        className={`text-sm text-brand-inactive-text dark:text-dark-body leading-tight truncate ${descriptionClassName}`}
                    >
                        {description}
                    </p>
                )}
            </div>

            {right ? (
                right
            ) : showChevron ? (
                <ChevronRightIcon className="text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors" />
            ) : null}
        </div>
    )
}