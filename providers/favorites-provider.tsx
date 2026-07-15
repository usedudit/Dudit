"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { toggleFavoriteAction, getUserFavoriteIdsAction, type FavoriteItemType } from "@/app/actions/marketplace/favorites"
import { useNotification } from "@/hooks/use-notification"

// ─── Types ──────────────────────────────────────────────────────────────────

interface FavoritesContextType {
    /** Set of "itemType:itemId" keys */
    favoriteKeys: Set<string>
    /** Check if a specific item is favorited */
    isFavorited: (itemId: string, itemType: FavoriteItemType) => boolean
    /** Toggle favorite status with optimistic update */
    toggleFavorite: (itemId: string, itemType: FavoriteItemType) => Promise<void>
    /** Total favorites count */
    count: number
    /** Whether favorites have been loaded */
    isLoaded: boolean
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined)

function makeKey(itemId: string, itemType: FavoriteItemType) {
    return `${itemType}:${itemId}`
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
    const { user } = useSupabase()
    const { success: notifySuccess } = useNotification()
    const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())
    const [isLoaded, setIsLoaded] = useState(false)
    const fetchedRef = useRef(false)

    // Fetch favorites on mount (once per session, when user is available)
    // Uses a small delay to avoid competing with page hydration
    useEffect(() => {
        if (!user?.id) {
            setFavoriteKeys(new Set())
            setIsLoaded(true)
            fetchedRef.current = false
            return
        }

        if (fetchedRef.current) return
        fetchedRef.current = true

        const id = setTimeout(() => {
            getUserFavoriteIdsAction().then((result) => {
                if (result.success) {
                    const keys = new Set(
                        result.favorites.map((f) => makeKey(f.item_id, f.item_type))
                    )
                    setFavoriteKeys(keys)
                }
                setIsLoaded(true)
            })
        }, 600)

        return () => clearTimeout(id)
    }, [user?.id])

    const isFavorited = useCallback(
        (itemId: string, itemType: FavoriteItemType) => {
            return favoriteKeys.has(makeKey(itemId, itemType))
        },
        [favoriteKeys]
    )

    const toggleFavorite = useCallback(
        async (itemId: string, itemType: FavoriteItemType) => {
            if (!user?.id) {
                // Redirect to login - handled by the component
                return
            }

            const key = makeKey(itemId, itemType)
            const wasFavorited = favoriteKeys.has(key)

            // Optimistic update
            setFavoriteKeys((prev) => {
                const next = new Set(prev)
                if (wasFavorited) {
                    next.delete(key)
                } else {
                    next.add(key)
                }
                return next
            })

            // Server call
            const result = await toggleFavoriteAction(itemId, itemType)

            if (!result.success) {
                // Rollback on failure
                setFavoriteKeys((prev) => {
                    const next = new Set(prev)
                    if (wasFavorited) {
                        next.add(key)
                    } else {
                        next.delete(key)
                    }
                    return next
                })
                return
            }

            // Show feedback
            if (result.isFavorited) {
                notifySuccess("Favoritado", "Item adicionado aos favoritos")
            }
        },
        [user?.id, favoriteKeys, notifySuccess]
    )

    const count = favoriteKeys.size

    const contextValue = useMemo(
        () => ({ favoriteKeys, isFavorited, toggleFavorite, count, isLoaded }),
        [favoriteKeys, isFavorited, toggleFavorite, count, isLoaded]
    )

    return (
        <FavoritesContext.Provider value={contextValue}>
            {children}
        </FavoritesContext.Provider>
    )
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useFavorites() {
    const context = useContext(FavoritesContext)
    if (context === undefined) {
        throw new Error("useFavorites must be used inside a FavoritesProvider")
    }
    return context
}
