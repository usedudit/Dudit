"use client"

import { useCallback, useEffect, useRef, useState, startTransition } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"

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

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * INSTANT UI-first state management.
 *
 * Architecture:
 *   1. Local useState updates SYNCHRONOUSLY on open/close (UI responds in <1ms)
 *   2. URL syncs in the background via startTransition + router.replace
 *   3. On browser back/forward, URL changes → local state syncs
 *
 * This ensures the UI NEVER blocks on router.replace() which is async in Next.js.
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
    const router = useRouter()
    const pathname = usePathname()

    // ── PRIMARY: Local state (synchronous, instant) ──────────────────────
    const [localState, setLocalState] = useState<EntityState>(() =>
        stateFromParams(searchParams),
    )

    // Track whether local state was set by user action (vs URL sync)
    const isUserActionRef = useRef(false)

    // ── SECONDARY: Sync from URL on browser back/forward ─────────────────
    // Only sync from URL when it wasn't triggered by our own open/close
    useEffect(() => {
        if (isUserActionRef.current) {
            // This URL change was caused by our own open/close call — skip sync
            isUserActionRef.current = false
            return
        }
        // URL changed externally (browser back/forward/direct navigation)
        const urlState = stateFromParams(searchParams)
        setLocalState(urlState)
    }, [searchParams])

    // ── Open: instant local state + background URL sync ──────────────────

    const open = useCallback(
        (action: EntityAction, id?: string) => {
            const value = action === "create" ? "true" : id || ""
            if (!value) return

            const entityId = value === "true" ? null : value

            // 1. INSTANT: Update local state synchronously
            setLocalState({ action, entityId, isOpen: true })
            isUserActionRef.current = true

            // 2. BACKGROUND: Sync URL (non-blocking)
            startTransition(() => {
                const sp = new URLSearchParams({ [action]: value })
                router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
            })
        },
        [router, pathname],
    )

    // ── Close: instant local state + background URL sync ─────────────────

    const close = useCallback(() => {
        // 1. INSTANT: Clear local state synchronously
        setLocalState(CLOSED_STATE)
        isUserActionRef.current = true

        // 2. BACKGROUND: Sync URL (non-blocking)
        startTransition(() => {
            router.replace(pathname, { scroll: false })
        })
    }, [router, pathname])

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
