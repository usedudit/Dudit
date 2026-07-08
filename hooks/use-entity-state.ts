"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams, usePathname } from "next/navigation"

// ── Types ────────────────────────────────────────────────────────────────────

export type EntityAction = "view" | "edit" | "create" | "duplicate"

export interface EntityState {
    action: EntityAction | null
    entityId: string | null
    isOpen: boolean
}

const CLOSED_STATE: EntityState = { action: null, entityId: null, isOpen: false }

// Query param keys in priority order (only one active at a time)
const ACTION_PARAMS: EntityAction[] = ["view", "edit", "create", "duplicate"]

function stateFromParams(searchParams: URLSearchParams): EntityState {
    for (const action of ACTION_PARAMS) {
        const value = searchParams.get(action)
        if (value !== null) {
            return {
                action,
                entityId: value === "true" ? null : value,
                isOpen: true,
            }
        }
    }
    return CLOSED_STATE
}

function stateFromCurrentUrl(): EntityState {
    if (typeof window === "undefined") return CLOSED_STATE
    return stateFromParams(new URLSearchParams(window.location.search))
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * INSTANT UI-first state management.
 *
 * Architecture:
 *   1. Local useState updates SYNCHRONOUSLY on open/close (UI responds in <1ms)
 *   2. URL syncs INSTANTLY via window.history.replaceState (NO Next.js router)
 *   3. On browser back/forward, popstate → local state syncs
 *
 * CRITICAL: We do NOT use router.replace() because it triggers Next.js
 * server-side revalidation, causing 2-3 second delays. Instead we use
 * window.history.replaceState() which is <1ms.
 *
 * URL patterns:
 *   /erp/products              → list (no action)
 *   /erp/products?view=123     → viewing entity 123
 *   /erp/products?edit=123     → editing entity 123
 *   /erp/products?create=true  → creating new entity
 *   /erp/products?duplicate=123 → duplicating entity 123
 */
export function useEntityState() {
    const searchParams = useSearchParams()
    const pathname = usePathname()

    // ── PRIMARY: Local state (synchronous, instant) ──────────────────────
    const [localState, setLocalState] = useState<EntityState>(() =>
        stateFromParams(searchParams),
    )

    // Track the URL we last set via open()/close() so we can distinguish
    // our own updates from external navigations. Next.js useSearchParams()
    // is not updated by window.history.replaceState, so its value can be
    // stale. We only sync from searchParams when the actual browser URL
    // differs from what we last set, indicating a real external navigation.
    const expectedHrefRef = useRef(
        typeof window !== "undefined" ? window.location.href : "",
    )

    // Timestamp of last user action - prevents stale searchParams from overriding
    const lastUserActionRef = useRef(0)

    // ── SECONDARY: Sync from URL on external navigation ──────────────────
    // This effect listens to Next.js searchParams changes. However, when we use
    // window.history.replaceState, Next.js may re-fire searchParams reactively
    // with either the old or new params. We only sync when the actual browser
    // URL differs from our expected URL (i.e., a REAL external navigation).
    useEffect(() => {
        const actualHref = window.location.href
        if (actualHref === expectedHrefRef.current) {
            // Our own open()/close() just updated the URL and Next.js is
            // reacting to it belatedly. Skip to avoid stale override.
            return
        }
        // Guard: if a user action happened very recently (<1500ms), ignore
        // searchParams updates since they're likely stale Next.js reactions.
        // Increased from 500ms to handle slower devices and concurrent rendering.
        if (Date.now() - lastUserActionRef.current < 1500) {
            return
        }
        // Extra safety: compare URL state with current local state.
        // If they match, don't reset - prevents stale searchParams from
        // closing the entity view after a replaceState.
        const urlState = stateFromParams(new URLSearchParams(window.location.search))
        if (
            urlState.action === localState.action &&
            urlState.entityId === localState.entityId &&
            urlState.isOpen === localState.isOpen
        ) {
            return
        }
        // External navigation detected (back/forward, link click, etc.)
        expectedHrefRef.current = actualHref
        setLocalState(urlState)
    }, [searchParams, localState])

    // ── Popstate handler for browser back/forward ────────────────────────
    useEffect(() => {
        const handlePopState = () => {
            const urlState = stateFromCurrentUrl()
            setLocalState(urlState)
            expectedHrefRef.current = window.location.href
        }
        window.addEventListener("popstate", handlePopState)
        return () => window.removeEventListener("popstate", handlePopState)
    }, [])

    // ── Open: instant local state + instant URL sync ─────────────────────

    const open = useCallback(
        (action: EntityAction, id?: string) => {
            const value = action === "create" ? "true" : id || ""
            if (!value) return

            const entityId = value === "true" ? null : value

            const url = `${pathname}?${new URLSearchParams({ [action]: value }).toString()}`

            // 1. INSTANT: Update local state synchronously
            setLocalState({ action, entityId, isOpen: true })
            lastUserActionRef.current = Date.now()
            expectedHrefRef.current = url

            // 2. INSTANT: Sync URL via replaceState (NO Next.js router = NO server revalidation)
            window.history.replaceState(null, "", url)
        },
        [pathname],
    )

    // ── Close: instant local state + instant URL sync ────────────────────

    const close = useCallback(() => {
        // 1. INSTANT: Clear local state synchronously
        setLocalState(CLOSED_STATE)
        lastUserActionRef.current = Date.now()
        expectedHrefRef.current = pathname

        // 2. INSTANT: Sync URL via replaceState (NO Next.js router)
        window.history.replaceState(null, "", pathname)
    }, [pathname])

    // ── Derived booleans (from instant local state) ──────────────────────

    return {
        state: localState,
        open,
        close,
        isViewing: localState.action === "view",
        isEditing: localState.action === "edit",
        isCreating: localState.action === "create",
        isDuplicating: localState.action === "duplicate",
    }
}
