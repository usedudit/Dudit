"use client"

import React from "react"
import { ChevronRightIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

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
    rightClassName?: string
    iconContainerClassName?: string
    className?: string
    disabled?: boolean
    wrapRight?: boolean
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
    rightClassName = "",
    iconContainerClassName = "",
    className = "",
    disabled = false,
    wrapRight = true,
}) => {
    const isComponent =
        typeof icon === "function" ||
        (typeof icon === "object" && icon !== null && !React.isValidElement(icon))

    // Ref para rastrear a área do conteúdo "right" (checkbox/radio/etc)
    const rightRef = React.useRef<HTMLDivElement>(null)

    /**
     * Quando o ListItem contém um checkbox ou radio no prop `right`,
     * clicar em qualquer parte do item (não apenas no input) deve selecionar
     * esse controle. Isso evita o bug onde o usuário precisa clicar
     * exatamente no radio/checkbox para que a seleção aconteça.
     */
    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as Node

        // Se o clique veio do próprio conteúdo "right", deixa o controle
        // tratar naturalmente (evita double-fire com onClick + onChange)
        if (rightRef.current?.contains(target)) {
            onClick?.()
            return
        }

        // Se não há onClick no ListItem mas o "right" tem um checkbox/radio,
        // encaminha o clique para o input para que ele seja selecionado
        if (!onClick && rightRef.current) {
            const input = rightRef.current.querySelector(
                'input[type="checkbox"], input[type="radio"]'
            ) as HTMLInputElement | null
            if (input && !input.disabled) {
                input.click()
                return
            }
        }

        // Padrão: chama onClick se existir
        onClick?.()
    }

    const shouldWrapRight = Boolean(right && wrapRight)
    const hasLeading = Boolean(left || icon)

    return (
        <div
            onClick={disabled ? undefined : (right ? handleContainerClick : onClick)}
            className={cn(
                "group flex items-center rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface transition-all",
                shouldWrapRight ? "flex-wrap gap-x-4 gap-y-3" : "gap-4",
                disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:border-brand-dark/30 dark:hover:border-brand-gray/30 cursor-pointer",
                className
            )}
        >
            <div
                className={cn(
                    "flex items-center gap-4 flex-1 min-w-0",
                    shouldWrapRight &&
                        (hasLeading
                            ? "min-w-[min(100%,210px)]"
                            : "min-w-[min(100%,150px)]")
                )}
            >
                {left && <div className="shrink-0">{left}</div>}

                {icon && (
                    <div
                        className={cn(
                            "w-12 h-12 rounded-full flex border items-center justify-center shrink-0 transition-colors overflow-hidden",
                            iconContainerClassName ||
                                "bg-brand-slate dark:bg-dark-border/50 border-brand-border dark:border-dark-border group-hover:bg-gray-200 dark:group-hover:bg-dark-border/90"
                        )}
                    >
                        {isComponent ? (
                            React.createElement(icon as React.ComponentType<any>, {
                                className: "text-brand-dark dark:text-dark-heading",
                            })
                        ) : typeof icon === "string" ? (
                            <img
                                src={icon}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        ) : (
                            icon
                        )}
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <h3
                        className={cn(
                            "text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate",
                            titleClassName
                        )}
                    >
                        {title}
                    </h3>

                    {description && (
                        <p
                            className={cn(
                                "text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body leading-tight whitespace-normal break-words",
                                descriptionClassName
                            )}
                        >
                            {description}
                        </p>
                    )}
                </div>
            </div>

            {right ? (
                <div
                    ref={rightRef}
                    className={cn(
                        "shrink-0 max-w-full",
                        shouldWrapRight && "ml-auto",
                        rightClassName
                    )}
                >
                    {right}
                </div>
            ) : showChevron ? (
                <ChevronRightIcon className="text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors shrink-0" />
            ) : null}
        </div>
    )
}