"use client"

import React from "react"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface TransactionContactCardProps {
    title: string
    name: string
    className?: string
}

/**
 * Top section of CustomerCard only - same chrome (accent bar, border, padding, avatar size).
 */
export function TransactionContactCard({ title, name, className = "" }: TransactionContactCardProps) {
    return (
        <div
            className={`bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors ${className}`}
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>

            <div className="p-6 pb-6 text-left">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">{title}</h3>

                <div className="flex items-start justify-between">
                    <div className="flex gap-3 text-left min-w-0">
                        <div className="relative shrink-0">
                            <UserProfileImage fullName={name || title} className="w-10 h-10 text-base border border-white dark:border-dark-border" />
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{name || "-"}</h4>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
