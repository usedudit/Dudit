import { NextResponse } from 'next/server'
import { syncPartnerItemsToExploreRedis, syncToExploreRedis, removeFromExploreRedis } from '@/lib/redis-sync'
import { revalidateExploreSearch, revalidateProducts, revalidatePartnerProfile } from '@/lib/utils/revalidation'

// Secret header to prevent unauthorized access
const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET

// DEBOUNCE: Prevent revalidateTag storms when multiple updates arrive in quick succession
let revalidationScheduled = false
const REVALIDATION_DEBOUNCE_MS = 500
const REDIS_SYNC_ATTEMPTS = 3

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function retryRedisSync<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= REDIS_SYNC_ATTEMPTS; attempt++) {
    try {
      console.log(`[Webhook][RedisSync] ${label} attempt=${attempt}`)
      const result = await operation()
      console.log(`[Webhook][RedisSync] ${label} success attempt=${attempt}`)
      return result
    } catch (error) {
      lastError = error
      console.error(`[Webhook][RedisSync] ${label} failed attempt=${attempt}`, error)
      if (attempt < REDIS_SYNC_ATTEMPTS) await sleep(100 * 2 ** (attempt - 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Redis sync failed: ${label}`)
}

async function debouncedRevalidate() {
  if (revalidationScheduled) return // Already scheduled, coalesce
  revalidationScheduled = true
  setTimeout(async () => {
    try {
      await revalidateExploreSearch()
      console.log(`[Webhook] Debounced revalidation fired`)
    } catch (err) {
      console.error(`[Webhook] Debounced revalidation failed:`, err)
    } finally {
      revalidationScheduled = false
    }
  }, REVALIDATION_DEBOUNCE_MS)
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!WEBHOOK_SECRET || authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { type, table, record, old_record } = body

    const processWebhook = async () => {
      const startTime = performance.now()
      try {
        const id = record?.id || old_record?.id
        const partnerId = record?.partner_id || old_record?.partner_id

        if (table === 'products') {
          if (type === 'DELETE') {
            await retryRedisSync(`products:${id}:remove`, () => removeFromExploreRedis(id, 'produto', true, true))
          } else if (type === 'INSERT' || type === 'UPDATE') {
            await retryRedisSync(`products:${id}:sync`, () => syncToExploreRedis({ id, type: 'produto', data: {}, silent: true, throwOnError: true }))
          }
        }
        else if (table === 'services') {
          if (type === 'DELETE') {
            await retryRedisSync(`services:${id}:remove`, () => removeFromExploreRedis(id, 'servico', true, true))
          } else if (type === 'INSERT' || type === 'UPDATE') {
            await retryRedisSync(`services:${id}:sync`, () => syncToExploreRedis({ id, type: 'servico', data: {}, silent: true, throwOnError: true }))
          }
        }
        else if (table === 'partners') {
          if (type === 'DELETE') {
            await retryRedisSync(`partners:${id}:remove`, () => removeFromExploreRedis(id, 'loja', true, true))
          } else if (type === 'INSERT' || type === 'UPDATE') {
            await retryRedisSync(`partners:${id}:sync`, () => syncToExploreRedis({ id: id, type: 'loja', data: {}, silent: true, throwOnError: true }))
            await retryRedisSync(`partners:${id}:items`, () => syncPartnerItemsToExploreRedis(id, { throwOnError: true }))
          }
        }

        // Invalidate INDIVIDUAL page tags (product detail / partner profile)
        if (table === 'products' && id) {
          await revalidateProducts(partnerId || '', id)
        }
        if (table === 'services' && partnerId) {
          await revalidatePartnerProfile(partnerId)
        }
        if (table === 'partners' && id) {
          await revalidatePartnerProfile(id)
        }

        // Debounced: coalesce multiple rapid updates into single explore/home revalidation
        debouncedRevalidate()

        console.log(`[Webhook] Processed ${type} on ${table} (${record?.id || old_record?.id}) in ${(performance.now() - startTime).toFixed(2)}ms`)
      } catch (err) {
        console.error(`[Webhook Error] Failed to process ${type} on ${table}:`, err)
        throw err
      }
    }

    await processWebhook()

    return NextResponse.json({ received: true, status: 'processed' })
  } catch (error) {
    console.error('[Webhook Critical Error]:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
