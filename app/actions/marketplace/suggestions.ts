"use server"

import { unstable_cache } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"

/**
 * Busca uma lista simplificada de nomes de produtos, serviços e lojas para sugestões de busca.
 * O objetivo é ser um bucket leve para filtragem no cliente.
 */
export const getSearchSuggestionsBucket = async () => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()

      // Buscamos produtos, serviços e parceiros em paralelo (nomes apenas)
      const [productsRes, servicesRes, partnersRes] = await Promise.all([
        supabase
          .from("products")
          .select("name")
          .eq("is_active", true)
          .eq("show_in_marketplace", true)
          .limit(200),
        supabase
          .from("services")
          .select("name")
          .eq("is_active", true)
          .limit(200),
        supabase
          .from("partners")
          .select("store_name")
          .eq("is_active", true)
          .limit(100)
      ])

      const suggestions: { label: string; type: 'produto' | 'servico' | 'loja' }[] = []

      if (productsRes.data) {
        productsRes.data.forEach((p: any) => {
          if (p.name) suggestions.push({ label: p.name, type: 'produto' })
        })
      }

      if (servicesRes.data) {
        servicesRes.data.forEach((s: any) => {
          if (s.name) suggestions.push({ label: s.name, type: 'servico' })
        })
      }

      if (partnersRes.data) {
        partnersRes.data.forEach((pr: any) => {
          if (pr.store_name) suggestions.push({ label: pr.store_name, type: 'loja' })
        })
      }

      // Remove duplicados (baseado no label) e limita o total
      const uniqueLabels = new Set<string>()
      const result = suggestions.filter(item => {
        const lowerLabel = item.label.toLowerCase().trim()
        if (uniqueLabels.has(lowerLabel)) return false
        uniqueLabels.add(lowerLabel)
        return true
      })

      return result
    },
    ["search-suggestions-bucket-v1"],
    { tags: ["products", "services", "partners", "search-suggestions"], revalidate: 3600 }
  )

  return fn()
}
