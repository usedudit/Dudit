"use client"

import useSWR from "swr"
import { useCallback } from "react"
import { useSupabase } from "@/providers/supabase-provider"

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
  const { user, supabase, isLoading: isAuthLoading, sessionData } = useSupabase()

  // Use sessionData from context if available as higher priority fallback
  const contextProfile = sessionData?.profile ? {
    full_name: sessionData.profile.full_name || null,
    address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null,
    avatar_url: null
  } : null

  const effectiveFallback = fallbackData || contextProfile

  const fetcher = useCallback(async () => {
    if (!user) return null
    const [profileRes, addressRes] = await Promise.all([
      supabase.from("user_profiles").select("full_name, avatar_url").eq("user_id", user.id).maybeSingle(),
      supabase.from("addresses").select("city, state")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle()
    ])
    
    let addressStr: string | null = null
    if (profileRes.data && addressRes.data) {
      addressStr = `${addressRes.data.city} - ${addressRes.data.state}`
    }

    return {
      full_name: profileRes.data?.full_name || null,
      address: addressStr,
      avatar_url: profileRes.data?.avatar_url || null
    }
  }, [user, supabase])

  const key = user ? `user-profile-${user.id}` : null
  const shouldSkipFetch = effectiveFallback !== undefined

  const { data, isLoading: isDataLoading, mutate } = useSWR(
    shouldSkipFetch ? null : key,
    fetcher,
    {
      fallbackData: effectiveFallback || null,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: false,
      dedupingInterval: 60000,
      keepPreviousData: true,
    }
  )

  if (effectiveFallback) {
    return {
      profile: effectiveFallback,
      isLoading: false,
      mutate
    }
  }

  return {
    profile: data || null,
    isLoading: isAuthLoading || isDataLoading,
    mutate
  }
}
