import { normalizeSearchQuery, sanitizeTsQueryToken } from "./normalize"
import { expandSynonyms } from "./synonyms"

/**
 * Build a PostgreSQL to_tsquery string from user input.
 * - Normalizes accents/case
 * - Expands synonyms per token (OR within token, AND across tokens)
 * - Example: "camisa nike" -> "(camisa | camiseta | roupa | moda) & nike"
 */
export function buildMarketplaceTsQuery(rawQuery: string): string | null {
  const normalized = normalizeSearchQuery(rawQuery)
  if (!normalized) return null

  const tokens = normalized
    .split(/\s+/)
    .map(sanitizeTsQueryToken)
    .filter(Boolean)

  if (!tokens.length) return null

  const clauses = tokens.map((token) => {
    const group = expandSynonyms(token)
      .map(sanitizeTsQueryToken)
      .filter(Boolean)

    const unique = Array.from(new Set(group))
    if (!unique.length) return null
    if (unique.length === 1) return unique[0]
    return `(${unique.join(" | ")})`
  }).filter(Boolean) as string[]

  if (!clauses.length) return null
  return clauses.join(" & ")
}
