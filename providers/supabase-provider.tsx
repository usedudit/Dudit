"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { SWRConfig } from "swr"

type SupabaseContextType = {
    supabase: ReturnType<typeof createClient>
    user: User | null
    isLoading: boolean
    sessionData: any | null
    isSessionLoading: boolean
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined)

export function SupabaseProvider({
    children,
    initialUser,
    initialSessionData
}: {
    children: React.ReactNode
    initialUser: User | null
    initialSessionData: any | null
}) {
    const [supabase] = useState(() => createClient())
    const [user, setUser] = useState<User | null>(initialUser)
    const [isLoading, setIsLoading] = useState(false)
    const [sessionData, setSessionData] = useState<any | null>(initialSessionData)
    const [isSessionLoading, setIsSessionLoading] = useState(false)

    useEffect(() => {
        const clearAccountScopedBrowserState = () => {
            if (typeof window === "undefined") return

            // These values used to be global browser state. Clear them on
            // account transitions so a new user cannot inherit the previous
            // user's ERP/store selection or marketplace city.
            localStorage.removeItem("dudit_city")
            localStorage.removeItem("cachedStores")
            localStorage.removeItem("cachedStoresTimestamp")
            localStorage.removeItem("selectedStoreId")
            document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; max-age=0"
        }

        // Only fetch user client-side if SSR didn't provide one.
        // When initialUser is available (the common case), this avoids a redundant
        // Supabase GoTrue API round-trip (~50-150ms) on every page load.
        if (!initialUser) {
            const fetchUserWithRetry = async (attempt = 0) => {
                try {
                    const { data, error } = await supabase.auth.getUser()
                    if (error) throw error
                    if (data?.user) {
                        setUser(data.user)
                    }
                } catch (err) {
                    // Transient network errors are common on mobile - retry up to 2 times
                    if (attempt < 2) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
                        return fetchUserWithRetry(attempt + 1)
                    }
                    console.warn("[SupabaseProvider] getUser failed after retries:", err)
                }
            }
            fetchUserWithRetry()
        }

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event: any, session: any) => {
            setUser(session?.user ?? null)
            if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
                clearAccountScopedBrowserState()
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [supabase, initialUser])

    // Handle Back-Forward Cache (bfcache): when the page is frozen/hidden the
    // realtime WebSocket is killed by the browser. Disconnect cleanly on hide
    // and reconnect on restore so channels rejoin instead of staying dead.
    useEffect(() => {
        const disconnect = () => {
            try { supabase.realtime.disconnect() } catch { }
        }

        const reconnect = (event: Event) => {
            // "pageshow" only fires with persisted=true when restoring from
            // bfcache; the "resume" event always means the page was frozen.
            if ("persisted" in event && !event.persisted) return
            try {
                supabase.realtime.connect()
                for (const channel of supabase.realtime.getChannels()) {
                    if (channel.state === "errored" || channel.state === "closed") {
                        channel.subscribe()
                    }
                }
            } catch { }
        }

        window.addEventListener("pagehide", disconnect)
        window.addEventListener("pageshow", reconnect)
        document.addEventListener("freeze", disconnect)
        document.addEventListener("resume", reconnect as EventListener)

        return () => {
            window.removeEventListener("pagehide", disconnect)
            window.removeEventListener("pageshow", reconnect)
            document.removeEventListener("freeze", disconnect)
            document.removeEventListener("resume", reconnect as EventListener)
        }
    }, [supabase])

    const contextValue = useMemo(() => ({
        supabase,
        user,
        isLoading,
        sessionData,
        isSessionLoading
    }), [supabase, user, isLoading, sessionData, isSessionLoading])

    return (
        <SupabaseContext.Provider value={contextValue}>
            <SWRConfig value={{
                revalidateOnMount: false,
                revalidateOnFocus: false,
                revalidateIfStale: false,
                dedupingInterval: 60000,
            }}>
                {children}
            </SWRConfig>
        </SupabaseContext.Provider>
    )
}

export function useSupabase() {
    const context = useContext(SupabaseContext)
    if (context === undefined) {
        throw new Error("useSupabase must be used inside a SupabaseProvider")
    }
    return context
}
