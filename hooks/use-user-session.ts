"use client"

import useSWR from "swr"
import { useCallback, useMemo } from "react"
import { useSupabase } from "@/providers/supabase-provider"

export interface UserProfileData {
  full_name: string | null
  address: string | null
  avatar_url: string | null
  city?: string | null
  state?: string | null
  citySlug?: string | null
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

function normalizeCityToSlug(city: string, state: string): string {
  const normCity = city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return `${normCity}-${state.toLowerCase()}`
}

export function useUserSession(serverData?: UserSessionData | null): UserSessionHookResult {
  const { user, supabase, isLoading: isAuthLoading } = useSupabase()

  const fetcher = useCallback(async (): Promise<UserSessionData | null> => {
    if (!user) return null

    const [profileRes, cartRes, addressRes] = await Promise.all([
      supabase.from("user_profiles").select("full_name, avatar_url").eq("user_id", user.id).maybeSingle(),
      supabase.from("cart_items").select("quantity").eq("user_id", user.id),
      supabase.from("addresses").select("city, state")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle()
    ])

    const profileData = profileRes.data || null
    let addressData = addressRes.data || null

    if (!addressData) {
      const fallbackAddressRes = await supabase.from("addresses")
        .select("city, state")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      addressData = fallbackAddressRes.data || null
    }

    let addressStr: string | null = null
    let citySlug: string | null = null

    if (addressData?.city && addressData?.state) {
      addressStr = `${addressData.city} - ${addressData.state}`
      citySlug = normalizeCityToSlug(addressData.city, addressData.state)

      if (typeof window !== "undefined" && citySlug) {
        try {
          localStorage.setItem("dudit_city", citySlug)
          document.cookie = `dudit_city=${citySlug}; path=/; max-age=${60 * 60 * 24 * 30}`
        } catch {}
      }
    }

    const cartItems = cartRes.data || []
    const cartCount = cartItems.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0)

    return {
      profile: profileData ? {
        full_name: profileData.full_name,
        address: addressStr,
        avatar_url: profileData.avatar_url || null,
        city: addressData?.city || null,
        state: addressData?.state || null,
        citySlug: citySlug || null,
      } : null,
      cartCount
    }
  }, [user, supabase])

  const key = user ? `user-session-${user.id}` : null

  // HARD GUARD: Se os dados do servidor já existem (mesmo sendo null), não faça fetch no cliente
  const shouldSkipFetch = serverData !== undefined
  
  const { data, isLoading: isDataLoading, mutate } = useSWR<UserSessionData | null>(
    shouldSkipFetch ? null : key, // Se tem dados do servidor, desativa o SWR para essa mount (Hard guard SWR way)
    fetcher,
    {
      fallbackData: serverData || undefined,
      revalidateOnMount: !shouldSkipFetch, // Fetch on mount only when no server data was provided
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    }
  )

  const resolvedProfile = useMemo(() => {
    const raw = serverData ? serverData.profile : (data?.profile || null)
    if (!raw) return null
    if (raw.citySlug) return raw

    let derivedSlug: string | null = null
    if (raw.city && raw.state) {
      derivedSlug = normalizeCityToSlug(raw.city, raw.state)
    } else if (raw.address && raw.address.includes(" - ") && raw.address !== "Brasil" && raw.address !== "Estado de São Paulo") {
      const [cityName, stateUf] = raw.address.split(" - ")
      if (cityName && stateUf && stateUf.trim().length === 2) {
        derivedSlug = normalizeCityToSlug(cityName.trim(), stateUf.trim())
      }
    }

    if (derivedSlug) {
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("dudit_city", derivedSlug)
          document.cookie = `dudit_city=${derivedSlug}; path=/; max-age=${60 * 60 * 24 * 30}`
        } catch {}
      }
      return { ...raw, citySlug: derivedSlug }
    }

    return raw
  }, [serverData, data?.profile])

  // Em fallback, se o hook foi hard-guarded pelo shouldSkipFetch, retornamos o serverData direto
  if (serverData) {
    return {
      profile: resolvedProfile,
      cartCount: serverData.cartCount,
      isLoading: false,
      mutate
    }
  }

  return {
    profile: resolvedProfile,
    cartCount: data?.cartCount || 0,
    isLoading: isAuthLoading || isDataLoading,
    mutate
  }
}
