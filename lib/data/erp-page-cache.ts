import "server-only"

import { unstable_cache } from "next/cache"

/**
 * Shared cache wrapper for ERP read models.
 *
 * Authorization is intentionally performed by the caller before invoking this
 * helper. The cached function only receives tenant-scoped, read-only data and
 * is invalidated by the entity tag whenever a mutation succeeds.
 */
export function getCachedErpPage<T>(
  keyParts: string[],
  tags: string[],
  loader: () => Promise<T>,
  revalidate = 60,
): Promise<T> {
  return unstable_cache(loader, keyParts, { tags, revalidate })()
}
