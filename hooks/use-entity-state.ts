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

    // Track whether local state was set by user action (vs URL sync)
    const isUserActionRef = useRef(false)

    // ── SECONDARY: Sync from URL on browser back/forward ─────────────────
    useEffect(() => {
        if (isUserActionRef.current) {
            isUserActionRef.current = false
            return
        }
        const urlState = stateFromParams(searchParams)
        setLocalState(urlState)
    }, [searchParams])

    // ── Popstate handler for browser back/forward ────────────────────────
    useEffect(() => {
        const handlePopState = () => {
            setLocalState(stateFromCurrentUrl())
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

            // 1. INSTANT: Update local state synchronously
            setLocalState({ action, entityId, isOpen: true })
            isUserActionRef.current = true

            // 2. INSTANT: Sync URL via replaceState (NO Next.js router = NO server revalidation)
            const sp = new URLSearchParams({ [action]: value })
            window.history.replaceState(null, "", `${pathname}?${sp.toString()}`)
        },
        [pathname],
    )

    // ── Close: instant local state + instant URL sync ────────────────────

    const close = useCallback(() => {
        // 1. INSTANT: Clear local state synchronously
        setLocalState(CLOSED_STATE)
        isUserActionRef.current = true

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
