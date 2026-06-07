/**
 * Normalize user search input for consistent matching.
 * Lowercase, trim, collapse spaces, strip accents.
 */
export function normalizeSearchQuery(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

/**
 * Strip characters unsafe for to_tsquery while preserving operators we emit.
 */
export function sanitizeTsQueryToken(token: string): string {
  return token.replace(/[^\p{L}\p{N}]+/gu, "").trim()
}
