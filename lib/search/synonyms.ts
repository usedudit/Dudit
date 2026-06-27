/**
 * @deprecated Synonym expansion is handled in PostgreSQL (marketplace_synonym_groups).
 * This module remains for backwards-compatible imports only.
 */
import { normalizeSearchQuery } from "./normalize"

/** Returns the normalized token only - DB expands synonyms at query time. */
export function expandSynonyms(token: string): string[] {
  const normalized = normalizeSearchQuery(token)
  return normalized ? [normalized] : []
}

/** @deprecated Use database-managed synonym groups instead. */
export const MARKETPLACE_SYNONYMS: Record<string, string[]> = {}
