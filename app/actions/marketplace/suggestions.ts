"use server"

import { unstable_cache } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { normalizeSearchQuery } from "@/lib/search/normalize"
import { filterMarketplaceVisibleProducts, filterMarketplaceVisibleServices } from "@/lib/resolve-marketplace-visibility"

export type AutocompleteSuggestion = {
  label: string
  type: "produto" | "servico" | "loja" | "plano"
  id?: string
  score?: number
}

const TYPE_MAP: Record<string, AutocompleteSuggestion["type"]> = {
  produto: "produto",
  servico: "servico",
  loja: "loja",
  plano: "plano",
}

/**
 * Prefix + trigram autocomplete via PostgreSQL (marketplace_search_autocomplete RPC).
 */
export async function getMarketplaceAutocompleteAction(
  query: string,
  type: "tudo" | "produtos" | "servicos" | "vitrines" | "planos" = "tudo",
): Promise<AutocompleteSuggestion[]> {
  const normalized = normalizeSearchQuery(query)
  if (normalized.length < 2) return []

  const supabase = getAdminClient()
  const { data, error } = await supabase.rpc("marketplace_search_autocomplete", {
    p_query: query,
    p_type: type,
    p_limit: 12,
    p_partner_ids: null,
  })

  if (error) {
    console.error("[Autocomplete] RPC error:", error.message)
    return []
  }

  return (data || []).map((row: { label: string; item_type: string; id: string; score: number }) => ({
    label: row.label,
    type: TYPE_MAP[row.item_type] || "produto",
    id: row.id,
    score: row.score,
  }))
}

/**
 * Legacy bucket for offline fallback - kept for first-focus warm cache.
 * @deprecated Prefer getMarketplaceAutocompleteAction for typed queries.
 */
export const getSearchSuggestionsBucket = async () => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()

      const [productsRes, servicesRes, partnersRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name")
          .eq("is_active", true)
          .eq("show_in_marketplace", true)
          .limit(200),
        supabase
          .from("services")
          .select("id, name")
          .eq("is_active", true)
          .limit(200),
        supabase
          .from("partners")
          .select("store_name")
          .eq("is_active", true)
          .limit(100),
      ])

      const suggestions: AutocompleteSuggestion[] = []

      if (productsRes.data && productsRes.data.length > 0) {
        const visibleIds = await filterMarketplaceVisibleProducts(productsRes.data.map((p: any) => p.id))
        productsRes.data = productsRes.data.filter((p: any) => visibleIds.has(p.id))
      }
      if (servicesRes.data && servicesRes.data.length > 0) {
        const visibleIds = await filterMarketplaceVisibleServices(servicesRes.data.map((s: any) => s.id))
        servicesRes.data = servicesRes.data.filter((s: any) => visibleIds.has(s.id))
      }

      if (productsRes.data) {
        productsRes.data.forEach((p: { name: string }) => {
          if (p.name) suggestions.push({ label: p.name, type: "produto" })
        })
      }

      if (servicesRes.data) {
        servicesRes.data.forEach((s: { name: string }) => {
          if (s.name) suggestions.push({ label: s.name, type: "servico" })
        })
      }

      if (partnersRes.data) {
        partnersRes.data.forEach((pr: { store_name: string }) => {
          if (pr.store_name) suggestions.push({ label: pr.store_name, type: "loja" })
        })
      }

      const uniqueLabels = new Set<string>()
      return suggestions.filter((item) => {
        const lowerLabel = item.label.toLowerCase().trim()
        if (uniqueLabels.has(lowerLabel)) return false
        uniqueLabels.add(lowerLabel)
        return true
      })
    },
    ["search-suggestions-bucket-v2"],
    { tags: ["products", "services", "partners", "search-suggestions"], revalidate: 3600 },
  )

  return fn()
}
