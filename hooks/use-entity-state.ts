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

    // ── SECONDARY: Sync from URL on external navigation ──────────────────
    // Track the last synced URL string to avoid reacting to transient
    // searchParams changes triggered by router.refresh() or state updates.
    const lastSyncedUrlRef = useRef<string>(
        typeof window !== "undefined" ? window.location.search + window.location.pathname : "",
    )

    useEffect(() => {
        const currentUrlString = window.location.search + window.location.pathname

        // If the actual browser URL hasn't changed, ignore the effect trigger.
        // This prevents router.refresh() or other re-renders from resetting
        // the entity state when the URL is still the same.
        if (currentUrlString === lastSyncedUrlRef.current) return

        lastSyncedUrlRef.current = currentUrlString

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
            // Keep the ref in sync so the sync-effect doesn't react to this change
            lastSyncedUrlRef.current = window.location.search + window.location.pathname
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
                    // First time opening the modal: push state so browser Back returns to list.
                    // Closing never relies on this entry being present (see close below).
                    window.history.pushState(window.history.state, "", newRelative)
                }
                // Keep the ref in sync so the sync-effect doesn't react to this change
                lastSyncedUrlRef.current = url.search + url.pathname
            }
        },
        [pathname],
    )

    // ── Close: instant local state + instant URL sync ────────────────────

    const close = useCallback(() => {
        // Clear local state (even if already closed, still clean the URL below —
        // local state and URL can drift when router.replace races with replaceState).
        const wasOpen = localStateRef.current.isOpen
        localStateRef.current = CLOSED_STATE
        if (wasOpen) setLocalState(CLOSED_STATE)

        if (typeof window === "undefined") return

        // Safety: if pathname differs, navigation already occurred. Do not touch history!
        if (window.location.pathname !== pathname) {
            return
        }

        // Clean the action params in-place.
        // Do not call history.back() here: the current entry may have been
        // replaced by a router navigation, a direct URL load, bfcache restore,
        // or a concurrent RSC transition. In those cases back() exits the
        // current route and looks like an unsolicited redirect.
        const url = new URL(window.location.href)
        let needsClean = false
        for (const a of ACTION_PARAMS) {
            if (url.searchParams.has(a)) {
                url.searchParams.delete(a)
                needsClean = true
            }
        }
        if (url.searchParams.has("type")) {
            url.searchParams.delete("type")
            needsClean = true
        }
        if (url.searchParams.has("payment")) {
            url.searchParams.delete("payment")
            needsClean = true
        }
        if (!needsClean) return
        const newRelative = `${url.pathname}${url.search}${url.hash}`
        window.history.replaceState(window.history.state, "", newRelative)
        // Keep the ref in sync so the sync-effect doesn't react to this change
        lastSyncedUrlRef.current = window.location.search + window.location.pathname
    }, [pathname])

    // ── Auto-reset on erp-sidebar-reset ──────────────────────────────────
    useEffect(() => {
        const handleReset = () => {
            if (localStateRef.current.isOpen) close()
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

