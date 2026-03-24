import { NextResponse } from 'next/server'
import { syncToExploreRedis, removeFromExploreRedis } from '@/lib/redis-sync'
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
        if (table === 'products') {
          if (type === 'DELETE' || (type === 'UPDATE' && record.show_in_marketplace === false) || (type === 'UPDATE' && record.is_active === false)) {
            await removeFromExploreRedis(old_record?.id || record.id, 'produto')
          } else if (type === 'INSERT' || type === 'UPDATE') {
            await syncToExploreRedis({ id: record.id, type: 'produto', data: {} })
          }
        }
        else if (table === 'services') {
          if (type === 'DELETE' || (type === 'UPDATE' && record.is_active === false)) {
            await removeFromExploreRedis(old_record?.id || record.id, 'servico')
          } else if (type === 'INSERT' || type === 'UPDATE') {
            await syncToExploreRedis({ id: record.id, type: 'servico', data: {} })
          }
        }
        else if (table === 'partners') {
          if (type === 'DELETE' || (type === 'UPDATE' && record.is_active === false)) {
            await removeFromExploreRedis(old_record?.id || record.id, 'loja')
          } else if (type === 'INSERT' || type === 'UPDATE') {
            await syncToExploreRedis({ id: record.id, type: 'loja', data: {} })
          }
        }

        // Invalidate INDIVIDUAL page tags (product detail / partner profile)
        if (table === 'products' && record?.id) {
          await revalidateProducts(record.partner_id || '', record.id)
        }
        if (table === 'services' && record?.partner_id) {
          await revalidatePartnerProfile(record.partner_id)
        }
        if (table === 'partners' && record?.id) {
          await revalidatePartnerProfile(record.id)
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
