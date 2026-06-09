import { normalizeSearchQuery, sanitizeTsQueryToken } from "./normalize"

/**
 * Build a simple PostgreSQL to_tsquery string from user input.
 * Synonym expansion is performed server-side via build_marketplace_tsquery().
 */
export function buildMarketplaceTsQuery(rawQuery: string): string | null {
  const normalized = normalizeSearchQuery(rawQuery)
  if (!normalized) return null

  const tokens = normalized
    .split(/\s+/)
    .map(sanitizeTsQueryToken)
    .filter(Boolean)

  if (!tokens.length) return null
  return tokens.join(" & ")
}
