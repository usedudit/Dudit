"use client"

import React, { useState } from "react"
import { ListItem, FormSection } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"

export interface StatusStep {
    label: string
    active: boolean
    date?: string
    time?: string
    isCancelled?: boolean
    danger?: boolean
}

interface StatusStepsTimelineProps {
    steps: StatusStep[]
    /** Title for the BottomSheet (e.g. "Status do Pedido", "Status da Entrega") */
    sheetTitle: string
    /** Optional section title shown above the desktop timeline card header */
    sectionTitle?: string
    /** Optional subtitle shown in the desktop card header */
    sectionSubtitle?: string
    /** Optional custom header node (replaces the default sectionTitle/subtitle header) */
    headerNode?: React.ReactNode
    /** Override the auto-detected danger/cancelled state for colors */
    forceDanger?: boolean
}

function useTimelineDangerState(
    steps: StatusStep[],
    forceDanger?: boolean
): boolean {
    if (forceDanger) return true
    if (steps.length === 0) return false
    const last = steps[steps.length - 1]
    return Boolean(last?.danger || last?.isCancelled)
}

/**
 * Shared component that renders a step-based status timeline.
 *
 * - Desktop (≥lg): full horizontal progress-bar timeline with dots + dates.
 * - Mobile/Tablet (<lg): compact `ListItem` with a circle indicator showing the
 *   current step + date/time. Tapping opens a `BottomSheet` with the full vertical list.
 *
 * This replaces the duplicated pattern previously inline in:
 *   - OrderDetailView.tsx
 *   - QuoteDetail.tsx
 *   - DeliveryTabContent.tsx (DeliveryStatusTimeline)
 *   - ServiceOrderDetail.tsx
 *   - TransactionDetailView.tsx
 */
export function StatusStepsTimeline({
    steps,
    sheetTitle,
    sectionTitle,
    sectionSubtitle,
    headerNode,
    forceDanger,
}: StatusStepsTimelineProps) {
    const [isSheetOpen, setIsSheetOpen] = useState(false)

    const isFailed = useTimelineDangerState(steps, forceDanger)
    const activeCount = steps.filter((s) => s.active).length
    const progressPct =
        steps.length > 1
            ? ((Math.max(activeCount, 1) - 1) / (steps.length - 1)) * 100
            : 0

    // The current (right-most active) step, or the first step if none active
    const currentStep =
        [...steps].filter((s) => s.active).reverse()[0] || steps[0]

    const getStepDotColorClasses = (step: StatusStep, idx: number) => {
        const isLastFailed = isFailed && idx === steps.length - 1
        if (!step.active) {
            return "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"
        }
        if (isLastFailed || step.danger) {
            return "bg-brand-red border-brand-red"
        }
        return "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading"
    }

    const getStepInnerDotColorClasses = (step: StatusStep, idx: number) => {
        const isLastFailed = isFailed && idx === steps.length - 1
        if (!step.active) return ""
        if (isLastFailed || step.danger) {
            return "bg-white"
        }
        return "bg-white dark:bg-dark-surface"
    }

    return (
        <>
            <div className="space-y-6">
                {/* ─── Desktop: Full horizontal timeline ─── */}
                <div className="hidden lg:block">
                    <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                        {(headerNode || sectionTitle) && (
                            <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                {headerNode ? (
                                    headerNode
                                ) : (
                                    <div className="flex justify-between items-center flex-wrap gap-2">
                                        <div className="flex items-center gap-1">
                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                                {sectionTitle}
                                            </span>
                                            <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                {currentStep.label}
                                            </div>
                                        </div>
                                        {sectionSubtitle && (
                                            <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                {sectionSubtitle}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="bg-white dark:bg-dark-surface px-12 pt-12 pb-12">
                            <div className="relative px-4">
                                <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                                    <div
                                        className={`absolute left-0 h-full rounded-full transition-all duration-500 ${
                                            isFailed
                                                ? "bg-brand-red"
                                                : "bg-brand-dark dark:bg-dark-heading"
                                        }`}
                                        style={{ width: `${progressPct}%` }}
                                    ></div>

                                    {steps.map((step, idx) => {
                                        const isLastFailed =
                                            isFailed && idx === steps.length - 1
                                        return (
                                            <div
                                                key={idx}
                                                className="relative flex flex-col items-center"
                                            >
                                                <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                                                    <span
                                                        className={`text-xs font-medium ${
                                                            step.active
                                                                ? isLastFailed || step.danger
                                                                    ? "text-brand-red"
                                                                    : "text-brand-dark dark:text-dark-heading"
                                                                : "text-gray-400 dark:text-dark-body"
                                                        }`}
                                                    >
                                                        {step.label}
                                                    </span>
                                                </div>
                                                <div
                                                    className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${getStepDotColorClasses(step, idx)}`}
                                                >
                                                    {step.active && (
                                                        <div
                                                            className={`w-1.5 h-1.5 rounded-full ${getStepInnerDotColorClasses(step, idx)}`}
                                                        ></div>
                                                    )}
                                                </div>
                                                <div className="absolute top-6 whitespace-nowrap flex flex-col items-center">
                                                    {step.date ? (
                                                        <div className="flex items-center gap-1 text-xs text-brand-inactive-text">
                                                            <span>{step.date}</span>
                                                            {step.time && (
                                                                <span>{step.time}</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs font-medium text-gray-300 dark:text-dark-body/50">
                                                            -
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── Mobile/Tablet: Compact circle + ListItem ─── */}
                <div className="lg:hidden">
                    <FormSection title="" className="mt-0">
                        <ListItem
                            title={currentStep.label}
                            description={
                                currentStep.date
                                    ? `${currentStep.date} às ${currentStep.time}`
                                    : undefined
                            }
                            className="border-0 bg-transparent px-0 hover:bg-transparent"
                            showChevron={true}
                            onClick={() => setIsSheetOpen(true)}
                            left={
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                        isFailed
                                            ? "bg-brand-red/10 text-brand-red"
                                            : "bg-brand-dark/10 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"
                                    }`}
                                >
                                    <div
                                        className={`w-2.5 h-2.5 rounded-full ${
                                            isFailed
                                                ? "bg-brand-red"
                                                : "bg-brand-dark dark:bg-dark-heading"
                                        }`}
                                    />
                                </div>
                            }
                        />
                    </FormSection>
                </div>
            </div>

            {/* ─── BottomSheet: full vertical step list ── */}
            <BottomSheet
                isOpen={isSheetOpen}
                onClose={() => setIsSheetOpen(false)}
                title={sheetTitle}
            >
                <div className="space-y-0 my-4 px-2">
                    {steps.map((step, idx) => {
                        const isLastFailed = isFailed && idx === steps.length - 1
                        return (
                            <div
                                key={idx}
                                className="relative pl-6 pb-6 border-l-2 border-brand-border dark:border-dark-border last:border-l-transparent"
                            >
                                <div
                                    className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${
                                        step.active
                                            ? isLastFailed || step.danger
                                                ? "bg-brand-red border-brand-red"
                                                : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading"
                                            : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"
                                    }`}
                                >
                                    {step.active && (
                                        <div
                                            className={`w-1.5 h-1.5 rounded-full ${
                                                isLastFailed || step.danger
                                                    ? "bg-white"
                                                    : "bg-white dark:bg-dark-surface"
                                            }`}
                                        ></div>
                                    )}
                                </div>

                                <div className="flex flex-col text-left">
                                    <span
                                        className={`text-sm font-semibold ${
                                            step.active
                                                ? isLastFailed || step.danger
                                                    ? "text-brand-red"
                                                    : "text-brand-dark dark:text-dark-heading"
                                                : "text-gray-400 dark:text-dark-body"
                                        }`}
                                    >
                                        {step.label}
                                    </span>
                                    {step.date ? (
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            {step.date} às {step.time}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-300 dark:text-dark-body/50 mt-0.5">
                                            -
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </BottomSheet>
        </>
    )
}
