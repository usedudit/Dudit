"use client"

import { useUserSession, UserProfileData } from "@/hooks/use-user-session"

interface UserProfileHookResult {
  profile: UserProfileData | null
  isLoading: boolean
  mutate: any
}

export function useUserProfile(fallbackData?: UserProfileData | null): UserProfileHookResult {
  const { data, isLoading, mutate } = useUserSession()

  return {
    // If a specific component provided fallbackData (e.g., from server props), use it
    // otherwise rely on the unified session cache
    profile: fallbackData !== undefined ? fallbackData : (data?.profile ?? null),
    isLoading,
    mutate
  }
}
