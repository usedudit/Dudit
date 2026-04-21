"use client"

import { createContext, useContext, useEffect, useState, useMemo } from "react"
// ... (lines 4-49 remain same)
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
