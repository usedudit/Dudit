"use client"

import useSWR, { mutate as globalMutate } from "swr"
import { useSupabase } from "@/providers/supabase-provider"
import { getUnifiedUserSessionAction } from "@/app/actions/marketplace/session"

export interface UserProfileData {
  full_name: string | null
  address: string | null
}

export interface UnifiedSessionData {
  profile: UserProfileData | null
  cartCount: number
}

interface UserSessionHookResult {
  data: UnifiedSessionData | null
  isLoading: boolean
  mutate: any
}

// Single fetcher for all initial user session requests
const sessionFetcher = () => getUnifiedUserSessionAction()

export function useUserSession(): UserSessionHookResult {
  const { user, isLoading: isAuthLoading, sessionData: contextSession } = useSupabase()

  const contextProfile = contextSession?.profile ? {
    full_name: contextSession.profile.full_name || null,
    address: contextSession.profile.city ? `${contextSession.profile.city} - ${contextSession.profile.state}` : null
  } : null

  const contextCartCount = contextSession?.cart?.length ?? 0

  const hasContextData = contextSession?.profile !== undefined && contextSession?.cart !== undefined

  const { data, isLoading: isDataLoading, mutate } = useSWR(
    user ? ["unified-session", user.id] : null,
    sessionFetcher,
    {
      fallbackData: hasContextData ? { profile: contextProfile, cartCount: contextCartCount } : undefined,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: !hasContextData,
      dedupingInterval: 60000,
      keepPreviousData: true,
    }
  )

  return {
    data: data || null,
    isLoading: isAuthLoading || isDataLoading,
    mutate
  }
}

/**
 * Call this to invalidate BOTH the cart and profile together across the app.
 */
export function invalidateUserSessionCache() {
  return globalMutate((key: any) => Array.isArray(key) && key[0] === "unified-session")
}
