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
  options?: { silent?: boolean; data?: any }
) {
  const startTime = performance.now()
  console.log(`[CACHE] START INVALIDATION product:${productId} action:${action}`)
  
  const tasks: Promise<any>[] = []

  // 1. Synchronize individual product cache (ZSETs and object cache) for direct requests/FTS
  // If data is provided, it will skip the DB fetch inside syncToExploreRedis
  tasks.push((async () => {
    try {
      if (action === 'delete') {
        await removeFromExploreRedis(productId, "produto")
      } else {
        await syncToExploreRedis({ id: productId, type: "produto", data: options?.data || {} })
      }
    } catch (error) {
      console.error(`[CACHE] Erro ao sincronizar ZSETs do Redis:`, error)
    }
  })())

  // Note: revalidateExploreSearch (called inside syncToExploreRedis) already increments GLOBAL_VERSION_KEY.
  // We only increment it here manually if we are NOT calling syncToExploreRedis (which is never the case here)
  // or if we want to be doubly sure. But to save latency, we'll let syncToExploreRedis handle the version bump
  // via its internal call to revalidateExploreSearch().

  // 2. Purge Next.js Cache Layers
  tasks.push((async () => {
    try {
      const { revalidateTag } = await import('next/cache')
      // @ts-ignore
      const safeRevalidateTag = (tag: string) => revalidateTag(tag)

      // Always revalidate the specific product tag (for vitrine consistency)
      safeRevalidateTag(`product-${productId}`)

      // Only revalidate list tags if NOT in silent mode
      if (!options?.silent) {
        safeRevalidateTag(`partner-${partnerId}`)
        safeRevalidateTag(TAGS.products(partnerId))
        safeRevalidateTag('products')
      }
    } catch (error) {
      console.error(`[CACHE] Erro ao revalidar Next.js cache layers:`, error)
    }
  })())

  // Wait for all non-blocking-but-important tasks to finish
  await Promise.all(tasks)
  
  console.log(`[CACHE] COMPLETE in ${Math.round(performance.now() - startTime)}ms for product:${productId}`)
}
