"use client"

import useSWR from "swr"
import { useSupabase } from "@/providers/supabase-provider"
import { getUserProfileAction } from "@/app/actions/profile"

interface UserProfileData {
  full_name: string | null
  address: string | null
}

interface UserProfileHookResult {
  profile: UserProfileData | null
  isLoading: boolean
  mutate: any
}

// Stable fetcher to avoid unnecessary React/SWR re-renders
const userProfileFetcher = () => getUserProfileAction()

export function useUserProfile(fallbackData?: UserProfileData | null): UserProfileHookResult {
  const { user, isLoading: isAuthLoading, sessionData } = useSupabase()

  // Use sessionData from context if available as higher priority fallback
  const contextProfile = sessionData?.profile ? {
    full_name: sessionData.profile.full_name || null,
    address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null
  } : null

  const effectiveFallback = fallbackData || contextProfile

  const { data, isLoading: isDataLoading, mutate } = useSWR(
    user ? ["user-profile", user.id] : null,
    userProfileFetcher,
    {
      fallbackData: effectiveFallback,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Only revalidate on mount if we have ABSOLUTELY no data (neither prop nor context)
      revalidateOnMount: !effectiveFallback,
      dedupingInterval: 60000,
      keepPreviousData: true,
    }
  )

  return {
    profile: data || null,
    isLoading: isAuthLoading || isDataLoading,
    mutate
  }
}
