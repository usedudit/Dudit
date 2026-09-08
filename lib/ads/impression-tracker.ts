"use client"

import { trackAdImpressions } from "@/app/actions/marketplace/ads"

const pendingIds = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushInFlight = false

function seenKey(id: string): string {
    return `dudit:ad-impression:${id}`
}

function wasSeenThisSession(id: string): boolean {
    try {
        return window.sessionStorage.getItem(seenKey(id)) === "1"
    } catch {
        return false
    }
}

function markSeenThisSession(ids: string[]): void {
    try {
        ids.forEach(id => window.sessionStorage.setItem(seenKey(id), "1"))
    } catch {
        // Storage can be unavailable in private/restricted browser contexts.
    }
}

async function flush(): Promise<void> {
    flushTimer = null
    if (flushInFlight || pendingIds.size === 0) return

    flushInFlight = true
    const ids = Array.from(pendingIds)
    pendingIds.clear()

    try {
        if (await trackAdImpressions(ids)) {
            markSeenThisSession(ids)
        }
    } finally {
        flushInFlight = false
        if (pendingIds.size > 0 && flushTimer === null) {
            flushTimer = setTimeout(() => void flush(), 50)
        }
    }
}

export function queueAdImpression(id: string): void {
    if (typeof window === "undefined" || !id || wasSeenThisSession(id)) return

    pendingIds.add(id)
    if (flushTimer === null && !flushInFlight) {
        flushTimer = setTimeout(() => void flush(), 50)
    }
}
