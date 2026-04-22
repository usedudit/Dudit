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
        // Hydrate user from existing session on mount (compensates for no SSR prefetch)
        supabase.auth.getUser().then(({ data }: any) => {
            if (data?.user) setUser(data.user)
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
            setUser(session?.user ?? null)
        })

        return () => {
            subscription.unsubscribe()
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
