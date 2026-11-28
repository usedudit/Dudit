"use client"

import useSWR from "swr"
import { useCallback, useEffect, useMemo } from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { useAddressSync } from "@/lib/utils/address-sync"

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
      supabase.from("user_profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
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
          const hasExplicitCookie = /(?:^|; )dudit_city=([^;]+)/.test(document.cookie)
          if (!hasExplicitCookie) {
            localStorage.setItem("dudit_city", citySlug)
            document.cookie = `dudit_city=${citySlug}; path=/; max-age=${60 * 60 * 24 * 30}`
          }
        } catch {}
      }
    }

    const cartItems = cartRes.data || []
    const cartCount = cartItems.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0)

    return {
      profile: profileData ? {
        full_name: profileData.full_name,
        address: addressStr,
        avatar_url: null,
        city: addressData?.city || null,
        state: addressData?.state || null,
        citySlug: citySlug || null,
      } : null,
      cartCount
    }
  }, [user, supabase])

  const key = user ? `user-session-${user.id}` : null

  const { data, isLoading: isDataLoading, mutate } = useSWR<UserSessionData | null>(
    key,
    fetcher,
    {
      fallbackData: serverData || undefined,
      revalidateOnMount: serverData === undefined,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 5000,
    }
  )

  // Revalida automaticamente a sessão quando qualquer componente notificar mudança de endereço
  useAddressSync(useCallback(() => {
    void mutate()
  }, [mutate]))

  const resolvedProfile = useMemo(() => {
    const raw = data?.profile !== undefined ? data.profile : (serverData ? serverData.profile : null)
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
      return { ...raw, citySlug: derivedSlug }
    }

    return raw
  }, [serverData, data?.profile])

  // Sincroniza o cookie dudit_city a partir do endereço salvo SOMENTE quando autenticado
  // e sem preferência explícita no cookie (evita regravar a cidade antiga durante logout).
  useEffect(() => {
    if (typeof window === "undefined") return
    if (isAuthLoading || !user) return
    const slug = resolvedProfile?.citySlug
    if (!slug || slug === "brasil" || slug.startsWith("estado-")) return
    try {
      const hasExplicitCookie = /(?:^|; )dudit_city=([^;]+)/.test(document.cookie)
      if (!hasExplicitCookie) {
        localStorage.setItem("dudit_city", slug)
        document.cookie = `dudit_city=${slug}; path=/; max-age=${60 * 60 * 24 * 30}`
      }
    } catch {}
  }, [user, isAuthLoading, resolvedProfile?.citySlug])

  return {
    profile: resolvedProfile,
    cartCount: data?.cartCount !== undefined ? data.cartCount : (serverData?.cartCount || 0),
    isLoading: isAuthLoading || (!serverData && isDataLoading),
    mutate
  }
}
