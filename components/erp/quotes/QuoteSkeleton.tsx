import React from "react"
import { motion } from "framer-motion"

interface QuoteSkeletonProps {
    count?: number
    viewMode?: "list" | "grid" | "table" // Support standard layouts
}

/**
 * Enterprise-grade Skeleton Loader for the Quotes Dashboard
 */
export default function QuoteSkeleton({ count = 5, viewMode = "list" }: QuoteSkeletonProps) {
    const arr = Array.from({ length: count })

    if (viewMode === "grid") {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                {arr.map((_, i) => (
                    <div
                        key={i}
                        className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex flex-col h-[230px] animate-pulse"
                    >
                        <div className="h-1 bg-brand-border dark:bg-dark-border/50 w-full" />
                        <div className="flex gap-4 p-4 pb-0 pt-5">
                            <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-transparent border border-brand-border dark:border-dark-border flex-shrink-0" />
                            <div className="flex-1 flex flex-col gap-2 justify-center">
                                <div className="h-4 bg-brand-gray dark:bg-dark-border rounded w-2/3" />
                                <div className="h-4 bg-brand-gray dark:bg-dark-border rounded w-1/3" />
                            </div>
                        </div>
                        <div className="mt-4 flex flex-col gap-3 px-4">
                            <div className="h-3 bg-brand-gray dark:bg-dark-border rounded w-1/4" />
                            <div className="h-4 bg-brand-gray dark:bg-dark-border rounded w-[90%]" />
                        </div>
                        <div className="mt-auto pt-3 px-4 pb-4 border-t border-brand-border dark:border-dark-border flex items-end justify-between">
                            <div className="flex flex-col gap-2 w-1/3">
                                <div className="h-3 bg-brand-gray dark:bg-dark-border rounded w-1/2" />
                                <div className="h-4 bg-brand-gray dark:bg-dark-border rounded w-full" />
                            </div>
                            <div className="h-8 w-8 bg-brand-gray dark:bg-dark-border rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    if (viewMode === "table") {
        return (
            <div className="w-full overflow-hidden rounded-xl border border-brand-border dark:border-dark-border">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] border-collapse relative">
                        <thead>
                            <tr className="bg-brand-gray dark:bg-dark-surface/50">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <th key={i} className="px-4 py-3 border-b border-brand-border dark:border-dark-border">
                                        <div className="h-4 bg-brand-gray dark:bg-dark-border rounded w-[60%] animate-pulse" />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {arr.map((_, i) => (
                                <tr key={i} className="bg-white dark:bg-dark-background border-b border-brand-border dark:border-dark-border animate-pulse">
                                    <td className="px-4 py-3"><div className="h-5 w-5 bg-brand-gray dark:bg-dark-border rounded" /></td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0" />
                                            <div className="flex flex-col gap-2">
                                                <div className="h-3 bg-brand-gray dark:bg-dark-border rounded w-[100px]" />
                                                <div className="h-3 bg-brand-gray dark:bg-dark-border rounded w-[60px]" />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3"><div className="h-4 bg-brand-gray dark:bg-dark-border rounded w-[80px]" /></td>
                                    <td className="px-4 py-3"><div className="h-6 rounded-full w-[100px] bg-brand-gray dark:bg-dark-border" /></td>
                                    <td className="px-4 py-3"><div className="h-4 bg-brand-gray dark:bg-dark-border rounded w-[150px]" /></td>
                                    <td className="px-4 py-3"><div className="h-8 w-8 rounded-full bg-brand-gray dark:bg-dark-border mx-auto" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    // Default "List" Mobile Mode
    return (
        <div className="flex flex-col w-full bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
            {arr.map((_, i) => (
                <div key={i} className="p-4 border-b border-brand-border dark:border-dark-border animate-pulse last:border-0">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex flex-col gap-2 w-1/3">
                            <div className="h-4 bg-brand-gray dark:bg-dark-border rounded w-full" />
                            <div className="h-3 bg-brand-gray dark:bg-dark-border rounded w-2/3" />
                        </div>
                        <div className="h-5 w-[80px] bg-brand-gray dark:bg-dark-border rounded-full" />
                    </div>
                    <div className="flex justify-between items-center mt-2">
                        <div className="h-4 bg-brand-gray dark:bg-dark-border rounded w-1/4" />
                        <div className="h-3 bg-brand-gray dark:bg-dark-border rounded w-1/5" />
                    </div>
                </div>
            ))}
        </div>
    )
}
