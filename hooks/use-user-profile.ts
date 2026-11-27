"use client"

import { useSupabase } from "@/providers/supabase-provider"
import { useUserSession } from "@/hooks/use-user-session"

interface UserProfileData {
  full_name: string | null
  address: string | null
  avatar_url: string | null
}

interface UserProfileHookResult {
  profile: UserProfileData | null
  isLoading: boolean
  mutate: any
}

export function useUserProfile(fallbackData?: UserProfileData | null): UserProfileHookResult {
  const { isLoading: isAuthLoading, sessionData } = useSupabase()

  // Use sessionData from context if available as higher priority fallback
  const contextProfile = sessionData?.profile ? {
    full_name: sessionData.profile.full_name || null,
    address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null,
    avatar_url: null
  } : null

  const effectiveFallback = fallbackData !== undefined ? fallbackData : contextProfile

  // Reuse the shared `user-session-${user.id}` SWR cache from `useUserSession`
  // instead of maintaining a second SWR key (`user-profile-${user.id}`) that
  // queries the same `user_profiles` and `addresses` tables.
  const session = useUserSession(
    effectiveFallback !== undefined
      ? { profile: effectiveFallback, cartCount: 0 }
      : undefined
  )

  if (effectiveFallback) {
    return {
      profile: effectiveFallback,
      isLoading: false,
      mutate: session.mutate,
    }
  }

  return {
    profile: session.profile
      ? {
          full_name: session.profile.full_name,
          address: session.profile.address,
          avatar_url: null,
        }
      : null,
    isLoading: isAuthLoading || session.isLoading,
    mutate: session.mutate,
  }
}
