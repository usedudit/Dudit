"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams, usePathname } from "next/navigation"

// ── Types ────────────────────────────────────────────────────────────────────

export type EntityAction = "view" | "edit" | "create" | "duplicate"

export interface EntityState {
    action: EntityAction | null
    entityId: string | null
    isOpen: boolean
    entityType?: string
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
                entityType: searchParams.get("type") || undefined,
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
 *   2. URL syncs INSTANTLY (0ms) via window.history.pushState/replaceState
 *      preserving window.history.state so Next.js router remains in sync
 *   3. On browser back/forward, popstate → local state syncs instantly
 *   4. Closing uses safe history handling without accidental double-backs
 *
 * URL patterns:
 *   /erp/produtos              → list (no action)
 *   /erp/produtos?view=123     → viewing entity 123
 *   /erp/produtos?edit=123     → editing entity 123
 *   /erp/produtos?create=true  → creating new entity
 *   /erp/produtos?duplicate=123 → duplicating entity 123
 */
export function useEntityState() {
    const searchParams = useSearchParams()
    const pathname = usePathname()

    // ── PRIMARY: Local state (synchronous, instant) ──────────────────────
    const [localState, setLocalState] = useState<EntityState>(() =>
        stateFromCurrentUrl(),
    )

    // Keep a ref with the current localState for safe comparison inside effects
    const localStateRef = useRef(localState)
    localStateRef.current = localState

    // Track whether a history entry was pushed for this modal in this component session
    const pushedHistoryRef = useRef(false)

    // ── SECONDARY: Sync from URL on external navigation ──────────────────
    useEffect(() => {
        const urlState = stateFromCurrentUrl()
        if (
            urlState.action === localStateRef.current.action &&
            urlState.entityId === localStateRef.current.entityId &&
            urlState.isOpen === localStateRef.current.isOpen &&
            urlState.entityType === localStateRef.current.entityType
        ) {
            return
        }
        // External navigation detected (link click, router navigation, etc.)
        localStateRef.current = urlState
        setLocalState(urlState)
    }, [searchParams, pathname])

    // ── Popstate handler for browser back/forward ────────────────────────
    useEffect(() => {
        const handlePopState = () => {
            if (window.location.pathname !== pathname) return
            const urlState = stateFromCurrentUrl()
            localStateRef.current = urlState
            // History was popped by the browser navigation itself
            pushedHistoryRef.current = false
            setLocalState(urlState)
        }
        window.addEventListener("popstate", handlePopState)
        return () => window.removeEventListener("popstate", handlePopState)
    }, [pathname])

    // ── Open: instant local state + instant URL sync (0ms) ───────────────

    const open = useCallback(
        (action: EntityAction, id?: string, entityType?: string) => {
            const value = action === "create" ? "true" : id || ""
            if (!value) return
            if (typeof window !== "undefined" && window.location.pathname !== pathname) return

            const entityId = value === "true" ? null : value

            // Guard against duplicate opens with the exact same configuration
            if (
                localStateRef.current.isOpen &&
                localStateRef.current.action === action &&
                localStateRef.current.entityId === entityId &&
                localStateRef.current.entityType === entityType
            ) {
                return
            }

            // 1. INSTANT: Update local state synchronously
            const wasOpen = localStateRef.current.isOpen
            const nextState: EntityState = { action, entityId, isOpen: true, entityType }
            localStateRef.current = nextState
            setLocalState(nextState)

            // 2. INSTANT: Sync URL via pushState / replaceState (0ms, no server RSC roundtrip)
            if (typeof window !== "undefined") {
                const url = new URL(window.location.href)
                for (const a of ACTION_PARAMS) {
                    url.searchParams.delete(a)
                }
                url.searchParams.delete("type")
                url.searchParams.set(action, value)
                if (entityType) url.searchParams.set("type", entityType)

                const newRelative = `${url.pathname}${url.search}${url.hash}`
                if (wasOpen) {
                    // Modal was already open (e.g. view -> edit): replace state so we don't pollute history
                    window.history.replaceState(window.history.state, "", newRelative)
                } else {
                    // First time opening the modal: push state so browser Back returns to list
                    pushedHistoryRef.current = true
                    window.history.pushState(window.history.state, "", newRelative)
                }
            }
        },
        [pathname],
    )

    // ── Close: instant local state + instant URL sync ────────────────────

    const close = useCallback(() => {
        // Guard: if it's already closed, do nothing (prevents duplicate history operations)
        if (!localStateRef.current.isOpen) return

        // 1. INSTANT: Clear local state synchronously
        localStateRef.current = CLOSED_STATE
        setLocalState(CLOSED_STATE)

        if (typeof window === "undefined") return

        // Safety: if pathname differs, navigation already occurred. Do not touch history!
        if (window.location.pathname !== pathname) {
            pushedHistoryRef.current = false
            return
        }

        // 2. INSTANT: Clean URL / history
        if (pushedHistoryRef.current) {
            pushedHistoryRef.current = false
            window.history.back()
        } else {
            // Opened directly via URL (?view=123) or reloaded: use replaceState to avoid exiting the page
            const url = new URL(window.location.href)
            for (const a of ACTION_PARAMS) {
                url.searchParams.delete(a)
            }
            url.searchParams.delete("type")
            const newRelative = `${url.pathname}${url.search}${url.hash}`
            window.history.replaceState(window.history.state, "", newRelative)
        }
    }, [pathname])

    // ── Auto-reset on erp-sidebar-reset ──────────────────────────────────
    useEffect(() => {
        const handleReset = () => {
            if (localStateRef.current.isOpen) {
                close()
            }
        }
        window.addEventListener("erp-sidebar-reset", handleReset)
        return () => window.removeEventListener("erp-sidebar-reset", handleReset)
    }, [close])

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

