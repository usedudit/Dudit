"use client"

import useSWR from "swr"
import { useCallback } from "react"
import { useSupabase } from "@/providers/supabase-provider"

interface UserProfileData {
  full_name: string | null
  address: string | null
}

interface UserSessionData {
  profile: UserProfileData | null
  cartCount: number
}

interface UserSessionHookResult {
  profile: UserProfileData | null
  cartCount: number
  isLoading: boolean
  mutate: any
}

export function useUserSession(serverData?: UserSessionData | null): UserSessionHookResult {
  const { user, supabase, isLoading: isAuthLoading } = useSupabase()

  const fetcher = useCallback(async () => {
    if (!user) return null

    const [profileRes, cartRes, addressRes] = await Promise.all([
      supabase.from("user_profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
      supabase.from("cart_items").select("quantity").eq("user_id", user.id),
      supabase.from("addresses").select("city, state")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle()
    ])

    const profileData = profileRes.data || null
    let addressStr: string | null = null

    if (profileData && addressRes.data) {
      addressStr = `${addressRes.data.city} - ${addressRes.data.state}`
    }

    const cartItems = cartRes.data || []
    const cartCount = cartItems.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0)

    return {
      profile: profileData ? { full_name: profileData.full_name, address: addressStr } : null,
      cartCount
    }
  }, [user, supabase])

  const key = user ? `user-session-${user.id}` : null

  // HARD GUARD: Se os dados do servidor já existem (mesmo sendo null), não faça fetch no cliente
  const shouldSkipFetch = serverData !== undefined
  
  const { data, isLoading: isDataLoading, mutate } = useSWR(
    shouldSkipFetch ? null : key, // Se tem dados do servidor, desativa o SWR para essa mount (Hard guard SWR way)
    fetcher,
    {
      fallbackData: serverData || null,
      revalidateOnMount: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    }
  )

  // Em fallback, se o hook foi hard-guarded pelo shouldSkipFetch, retornamos o serverData direto
  if (serverData) {
    return {
      profile: serverData.profile,
      cartCount: serverData.cartCount,
      isLoading: false,
      mutate
    }
  }

  return {
    profile: data?.profile || null,
    cartCount: data?.cartCount || 0,
    isLoading: isAuthLoading || isDataLoading,
    mutate
  }
}
