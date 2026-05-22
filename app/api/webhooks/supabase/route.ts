import { NextResponse } from 'next/server'
import { syncPartnerItemsToExploreRedis, syncToExploreRedis, removeFromExploreRedis } from '@/lib/redis-sync'
import { revalidateExploreSearch, revalidateProducts, revalidatePartnerProfile } from '@/lib/utils/revalidation'

// Secret header to prevent unauthorized access
const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET

// DEBOUNCE: Prevent revalidateTag storms when multiple updates arrive in quick succession
let revalidationScheduled = false
const REVALIDATION_DEBOUNCE_MS = 500

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
          if (type === 'DELETE' || (type === 'UPDATE' && record.show_in_marketplace === false) || (type === 'UPDATE' && record.is_active === false)) {
            await removeFromExploreRedis(id, 'produto', true)
          } else if (type === 'INSERT' || type === 'UPDATE') {
            await syncToExploreRedis({ id, type: 'produto', data: {}, silent: true })
          }
        }
        else if (table === 'services') {
          if (type === 'DELETE' || (type === 'UPDATE' && record.is_active === false)) {
            await removeFromExploreRedis(id, 'servico', true)
          } else if (type === 'INSERT' || type === 'UPDATE') {
            await syncToExploreRedis({ id, type: 'servico', data: {}, silent: true })
          }
        }
        else if (table === 'partners') {
          if (type === 'DELETE' || (type === 'UPDATE' && record.is_active === false)) {
            await removeFromExploreRedis(id, 'loja', true)
          } else if (type === 'INSERT' || type === 'UPDATE') {
            await syncToExploreRedis({ id: id, type: 'loja', data: {}, silent: true })
            await syncPartnerItemsToExploreRedis(id)
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
      }
    }

    await processWebhook()

    return NextResponse.json({ received: true, status: 'processed' })
  } catch (error) {
    console.error('[Webhook Critical Error]:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
