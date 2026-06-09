/**
 * Prefix matching helpers (mirrors SQL mp_search_row_matches prefix logic).
 * Used for unit tests; production search runs in PostgreSQL.
 */
import { normalizeSearchQuery } from "./normalize"

export function nameMatchesPrefix(query: string, name: string): boolean {
  const q = normalizeSearchQuery(query)
  const n = normalizeSearchQuery(name)
  if (!q || !n) return false
  if (n.startsWith(q)) return true
  return n.split(/\s+/).some((word) => word.startsWith(q))
}

export function nameMatchesExact(query: string, name: string): boolean {
  return normalizeSearchQuery(query) === normalizeSearchQuery(name)
}

export function textContainsAnyTerm(text: string, terms: string[]): boolean {
  const haystack = normalizeSearchQuery(text)
  if (!haystack) return false
  return terms.some((term) => {
    const t = normalizeSearchQuery(term)
    return t.length > 0 && haystack.includes(t)
  })
}

/**
 * Client-side approximation of category boost (full logic is in SQL).
 */
export function categoryMatchesExpandedTerms(
  category: string | null | undefined,
  subcategory: string | null | undefined,
  expandedTerms: string[],
): boolean {
  const cat = normalizeSearchQuery(category || "")
  const sub = normalizeSearchQuery(subcategory || "")
  return expandedTerms.some((term) => {
    const t = normalizeSearchQuery(term)
    return (cat && (cat === t || cat.includes(t))) || (sub && (sub === t || sub.includes(t)))
  })
}
