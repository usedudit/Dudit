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
        // Only fetch user client-side if SSR didn't provide one.
        // When initialUser is available (the common case), this avoids a redundant
        // Supabase GoTrue API round-trip (~50-150ms) on every page load.
        if (!initialUser) {
            supabase.auth.getUser().then(({ data }: any) => {
                if (data?.user) setUser(data.user)
            })
        }

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event: any, session: any) => {
            setUser(session?.user ?? null)
            if (event === "SIGNED_IN") {
                localStorage.removeItem("dudit_city")
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [supabase, initialUser])

    const contextValue = useMemo(() => ({
        supabase,
        user,
        isLoading,
        sessionData,
        isSessionLoading
    }), [supabase, user, isLoading, sessionData, isSessionLoading])

    return (
        <SupabaseContext.Provider value={{ supabase, user, isLoading, sessionData, isSessionLoading }}>
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
