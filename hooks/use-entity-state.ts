"use client"

import { useCallback, useEffect, useRef, useMemo } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"

// ── Types ────────────────────────────────────────────────────────────────────

export type EntityAction = "view" | "edit" | "create" | "duplicate"

export interface EntityState {
    action: EntityAction | null
    entityId: string | null
    isOpen: boolean
}

// Query param keys in priority order (only one active at a time)
const ACTION_PARAMS: EntityAction[] = ["view", "edit", "create", "duplicate"]

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages UI state via URL query parameters instead of useState.
 *
 * URL patterns:
 *   /erp/products              → list (no action)
 *   /erp/products?view=123     → viewing entity 123
 *   /erp/products?edit=123     → editing entity 123
 *   /erp/products?create=true  → creating new entity
 *   /erp/products?duplicate=123 → duplicating entity 123
 *
 * Uses router.replace (no navigation, no scroll reset, no history spam).
 * Back/forward works via native popstate + searchParams reactivity.
 */
export function useEntityState() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Derive state from URL (no useState needed) ───────────────────────

    const state: EntityState = useMemo(() => {
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
        return { action: null, entityId: null, isOpen: false }
    }, [searchParams])

    // ── URL update (debounced to prevent rapid thrashing) ────────────────

    const updateURL = useCallback(
        (params: Record<string, string> | null) => {
            if (debounceRef.current) clearTimeout(debounceRef.current)

            debounceRef.current = setTimeout(() => {
                debounceRef.current = null
                if (params === null) {
                    // Close: remove all action params
                    router.replace(pathname, { scroll: false })
                } else {
                    const sp = new URLSearchParams(params)
                    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
                }
            }, 16) // ~1 frame — fast enough to feel instant, prevents double-calls
        },
        [router, pathname],
    )

    // ── Public API ───────────────────────────────────────────────────────

    const open = useCallback(
        (action: EntityAction, id?: string) => {
            const value = action === "create" ? "true" : id || ""
            if (!value) return
            updateURL({ [action]: value })
        },
        [updateURL],
    )

    const close = useCallback(() => {
        updateURL(null)
    }, [updateURL])

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [])

    // ── Derived booleans ─────────────────────────────────────────────────

    return {
        state,
        open,
        close,
        isViewing: state.action === "view",
        isEditing: state.action === "edit",
        isCreating: state.action === "create",
        isDuplicating: state.action === "duplicate",
    }
}
