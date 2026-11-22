import "server-only"
import { syncToExploreRedis, removeFromExploreRedis } from "@/lib/redis-sync"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { invalidateInMemoryVersionCache } from "@/app/actions/marketplace/search"

let localCacheVersion = 1

export async function getCacheVersion(): Promise<number> {
  return localCacheVersion
}

export async function incrementCacheVersion(): Promise<number> {
  localCacheVersion++
  invalidateInMemoryVersionCache()
  return localCacheVersion
}

export async function invalidateProductCache(
  productId: string,
  partnerId: string,
  action: 'create' | 'update' | 'delete' = 'update',
  options?: { silent?: boolean }
) {
  console.log(`[CACHE] INVALIDATING product:${productId} (partner:${partnerId}) action:${action} silent:${!!options?.silent}`)

  // If silent update (e.g. stock decrements/reservations from sales, orders, cart checkout),
  // skip all remote Redis sync. Only purge local RAM version and revalidate Next.js cache layers.
  if (options?.silent) {
    // Silent updates don't touch Redis - they rely on Next.js tag revalidation below
  } else {
    // 1. Increment in-memory version (purges RAM search cache)
    await incrementCacheVersion()

    // 2. Synchronize individual product cache (ZSETs and object cache) for direct requests/FTS
    try {
      if (action === 'delete') {
        await removeFromExploreRedis(productId, "produto", true)
      } else {
        await syncToExploreRedis({ id: productId, type: "produto", data: {}, silent: true })
      }
    } catch (error) {
      console.error(`[CACHE] Erro ao sincronizar ZSETs do Redis:`, error)
    }
  }

  // 3. Purge Next.js Cache Layers
  try {
    const { revalidateTag, revalidatePath } = await import('next/cache')
    const safeRevalidateTag = (tag: string) => {
      try {
        (revalidateTag as any)(tag, 'max')
      } catch {
        // Silently ignore - Next.js 16 throws if called during render
      }
    }

    // Always revalidate the specific product tag (for vitrine consistency)
    safeRevalidateTag(`product-${productId}`)

    // Always revalidate the list tags and path so that the ERP product list updates instantly
    safeRevalidateTag(`partner-${partnerId}`)
    safeRevalidateTag(TAGS.products(partnerId))
    safeRevalidateTag('products')

    // Force the Next.js router cache to refresh the products page
    try {
      revalidatePath('/erp/produtos')
    } catch {
      // Silently ignore if called during render
    }
  } catch (error) {
    console.error(`[CACHE] Erro ao revalidar Next.js cache layers:`, error)
  }

  console.log(`[CACHE] INVALIDATION COMPLETE product:${productId}`)
}

export async function invalidateStoreCache(
  storeId: string,
  partnerId: string,
  slug?: string,
  options?: { silent?: boolean }
) {
  console.log(`[CACHE] INVALIDATING store:${storeId} (partner:${partnerId}) slug:${slug}`)
  if (!options?.silent) {
    await incrementCacheVersion()
  }

  try {
    const { revalidateTag, revalidatePath } = await import('next/cache')
    const safeRevalidateTag = (tag: string) => {
      try {
        (revalidateTag as any)(tag, 'max')
      } catch {
        // Silently ignore
      }
    }

    safeRevalidateTag(`store-${storeId}`)
    safeRevalidateTag(TAGS.storeProfile(storeId))
    safeRevalidateTag("store-profile")
    safeRevalidateTag("store-products")
    // Expira imediatamente o cache do parceiro (read-your-own-writes no checklist/dashboard do ERP)
    try {
      (revalidateTag as any)(TAGS.partner(partnerId), { expire: 0 })
    } catch {
      safeRevalidateTag(TAGS.partner(partnerId))
    }
    safeRevalidateTag(TAGS.products(partnerId))
    safeRevalidateTag(TAGS.storeProducts(partnerId, storeId))

    if (slug) {
      safeRevalidateTag(`store-${slug}`)
      try {
        revalidatePath(`/${slug}`)
      } catch { }
    }

    try {
      revalidatePath("/sacola")
      revalidatePath("/erp/lojas")
      revalidatePath("/erp/inicio")
    } catch { }
  } catch (error) {
    console.error(`[CACHE] Erro ao revalidar store cache:`, error)
  }
}

export async function invalidateServiceCache(
  serviceId: string,
  partnerId: string,
  action: 'create' | 'update' | 'delete' = 'update',
  options?: { silent?: boolean }
) {
  console.log(`[CACHE] INVALIDATING service:${serviceId} (partner:${partnerId}) action:${action} silent:${!!options?.silent}`)
  if (options?.silent) {
    // Silent updates don't touch Redis - they rely on Next.js tag revalidation below
  } else {
    await incrementCacheVersion()

    try {
      if (action === 'delete') {
        await removeFromExploreRedis(serviceId, "servico", true)
      } else {
        await syncToExploreRedis({ id: serviceId, type: "servico", data: {}, silent: true })
      }
    } catch (error) {
      console.error(`[CACHE] Erro ao sincronizar servico no Redis:`, error)
    }
  }

  try {
    const { revalidateTag, revalidatePath } = await import('next/cache')
    const safeRevalidateTag = (tag: string) => {
      try {
        (revalidateTag as any)(tag, 'max')
      } catch {
        // Silently ignore
      }
    }

    safeRevalidateTag(`service-${serviceId}`)
    safeRevalidateTag(`partner-${partnerId}`)
    safeRevalidateTag(TAGS.services(partnerId))
    safeRevalidateTag('services')
    safeRevalidateTag(TAGS.marketplace)

    try {
      revalidatePath('/erp/servicos')
    } catch { }
  } catch (error) {
    console.error(`[CACHE] Erro ao revalidar Next.js cache layers para servico:`, error)
  }
}

export async function invalidateRecurringPlanCache(
  planId: string,
  partnerId: string,
  action: 'create' | 'update' | 'delete' = 'update',
  options?: { silent?: boolean }
) {
  console.log(`[CACHE] INVALIDATING recurring_plan:${planId} (partner:${partnerId}) action:${action} silent:${!!options?.silent}`)
  if (!options?.silent) {
    await incrementCacheVersion()
  }

  try {
    const { revalidateTag, revalidatePath } = await import('next/cache')
    const safeRevalidateTag = (tag: string) => {
      try {
        (revalidateTag as any)(tag, 'max')
      } catch {
        // Silently ignore
      }
    }

    safeRevalidateTag(`recurring-plan-${planId}`)
    safeRevalidateTag(`partner-${partnerId}`)
    safeRevalidateTag(TAGS.partner(partnerId))
    safeRevalidateTag('recurring-plans')
    safeRevalidateTag('marketplace-search')
    safeRevalidateTag(TAGS.marketplace)

    try {
      revalidatePath('/erp/recorrentes/planos')
    } catch { }
  } catch (error) {
    console.error(`[CACHE] Erro ao revalidar Next.js cache layers para plano recorrente:`, error)
  }
}
