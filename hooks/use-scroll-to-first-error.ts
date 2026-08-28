"use client"

import { useCallback, useRef } from "react"

interface RequiredField {
    field: string
    tab: string
}

interface UseScrollToFirstErrorOptions {
    fieldErrors: Set<string>
    REQUIRED_FIELDS: RequiredField[]
    scrollContainerRef: React.RefObject<HTMLDivElement | null>
    activeTab: string
    setActiveTab: (tab: string) => void
}

export function useScrollToFirstError({
    fieldErrors,
    REQUIRED_FIELDS,
    scrollContainerRef,
    activeTab,
    setActiveTab,
}: UseScrollToFirstErrorOptions) {
    const isScrolling = useRef(false)

    const scrollToFirstError = useCallback(() => {
        if (isScrolling.current) return
        if (fieldErrors.size === 0) return

        const firstError = REQUIRED_FIELDS.find(({ field }) => fieldErrors.has(field))
        if (!firstError) return

        const needsTabSwitch = firstError.tab !== activeTab
        if (needsTabSwitch) {
            setActiveTab(firstError.tab)
        }

        const scroll = () => {
            const container = scrollContainerRef.current
            if (!container) return

            const target = container.querySelector(`[data-field="${firstError.field}"]`)
            if (!target) return

            isScrolling.current = true
            target.scrollIntoView({ behavior: "smooth", block: "center" })

            setTimeout(() => {
                isScrolling.current = false
            }, 500)
        }

        if (needsTabSwitch) {
            requestAnimationFrame(() => {
                requestAnimationFrame(scroll)
            })
        } else {
            requestAnimationFrame(scroll)
        }
    }, [fieldErrors, REQUIRED_FIELDS, scrollContainerRef, activeTab, setActiveTab])

    return { scrollToFirstError }
}
