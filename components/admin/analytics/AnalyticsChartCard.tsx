"use client"

import React from "react"
import { cn } from "@/lib/utils"

function CardHeader({
    icon: Icon,
    title,
    subtitle,
    legendItems,
    action,
}: {
    icon?: React.ElementType
    title: string
    subtitle?: string
    legendItems?: Array<{ label: string; color: string }>
    action?: React.ReactNode
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center space-x-3">
                {Icon && (
                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                        <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
                    </div>
                )}
                <div>
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">{title}</h3>
                    {subtitle && (
                        <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3.5 sm:self-center">
                {legendItems?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[12px] font-bold text-brand-inactive-text dark:text-dark-body">
                            {item.label}
                        </span>
                    </div>
                ))}
                {action}
            </div>
        </div>
    )
}

interface AnalyticsChartCardProps {
    title: string
    subtitle?: string
    icon?: React.ElementType
    legendItems?: Array<{ label: string; color: string }>
    action?: React.ReactNode
    className?: string
    children: React.ReactNode
}

export function AnalyticsChartCard({
    title,
    subtitle,
    icon,
    legendItems,
    action,
    className,
    children,
}: AnalyticsChartCardProps) {
    return (
        <div
            className={cn(
                "bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between",
                className
            )}
        >
            <CardHeader
                icon={icon}
                title={title}
                subtitle={subtitle}
                legendItems={legendItems}
                action={action}
            />
            {children}
        </div>
    )
}
