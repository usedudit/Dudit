import "server-only"
import { redis } from "@/lib/redis"
import { syncToExploreRedis, removeFromExploreRedis } from "@/lib/redis-sync"
import { TAGS } from "@/lib/utils/revalidation-tags"

const GLOBAL_VERSION_KEY = "marketplace:global_cache_version"

export async function getCacheVersion(): Promise<number> {
  try {
    const version = await redis.get<number>(GLOBAL_VERSION_KEY)
    return version || 1
  } catch (err) {
    console.error(`[REDIS] Error reading cache version`, err)
    return 1 // Fallback so searches still work
  }
}

export async function incrementCacheVersion(): Promise<number> {
  try {
    const newVersion = await redis.incr(GLOBAL_VERSION_KEY)
    console.log(`[REDIS] CACHE VERSION BUMPED TO: v${newVersion}`)
    return newVersion
  } catch (err) {
    console.error(`[REDIS] Error incrementing cache version`, err)
    return 2
  }
}

export async function invalidateProductCache(
  productId: string, 
  partnerId: string, 
  action: 'create' | 'update' | 'delete' = 'update',
  options?: { silent?: boolean }
) {
  console.log(`[CACHE] INVALIDATING product:${productId} (partner:${partnerId}) action:${action} silent:${!!options?.silent}`)
  
  // 1. Increment Global Redis Version (Orphans all dynamic query lists)
  await incrementCacheVersion()

  // 2. Synchronize individual product cache (ZSETs and object cache) for direct requests/FTS
  try {
    if (action === 'delete') {
      await removeFromExploreRedis(productId, "produto")
    } else {
      await syncToExploreRedis({ id: productId, type: "produto", data: {} })
    }
  } catch (error) {
    console.error(`[CACHE] Erro ao sincronizar ZSETs do Redis:`, error)
  }

  // 3. Purge Next.js Cache Layers
  try {
    const { revalidateTag } = await import('next/cache')
    const safeRevalidateTag = (tag: string) => (revalidateTag as any)(tag, 'max')

    // Always revalidate the specific product tag (for vitrine consistency)
    safeRevalidateTag(`product-${productId}`)

    // Only revalidate list tags if NOT in silent mode
    // Silent mode avoids background re-renders of the current active page (like ERP list)
    if (!options?.silent) {
      safeRevalidateTag(`partner-${partnerId}`)
      safeRevalidateTag(TAGS.products(partnerId))
      safeRevalidateTag('products')
    }
  } catch (error) {
    console.error(`[CACHE] Erro ao revalidar Next.js cache layers:`, error)
  }
  
  console.log(`[CACHE] INVALIDATION COMPLETE product:${productId}`)
}
