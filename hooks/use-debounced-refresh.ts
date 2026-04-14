"use client"

import { useRouter } from "next/navigation"
import { useCallback, useRef } from "react"

/**
 * Debounced router.refresh() hook.
 *
 * When multiple calls happen within `delayMs`, only the LAST one
 * triggers an actual server request. Earlier calls are merged/skipped.
 *
 * This eliminates overlapping SSR requests caused by rapid user actions
 * (e.g., mark as paid → edit → save → all calling refresh in quick succession).
 *
 * Instrumentation logs are tagged [REFRESH] for Railway log visibility.
 *
 * @param delayMs - Debounce window in milliseconds (default: 400ms)
 */
export function useDebouncedRefresh(delayMs = 400) {
    const router = useRouter()
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingRef = useRef(false)

    const refresh = useCallback(() => {
        // If there's already a pending debounced refresh, skip and reset timer
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            console.log("[REFRESH] skipped (debounced, waiting for burst to settle)")
        } else {
            console.log("[REFRESH] triggered (scheduling)")
        }

        pendingRef.current = true

        timerRef.current = setTimeout(() => {
            timerRef.current = null
            pendingRef.current = false
            console.log("[REFRESH] executed")
            router.refresh()
        }, delayMs)
    }, [router, delayMs])

    return refresh
}
