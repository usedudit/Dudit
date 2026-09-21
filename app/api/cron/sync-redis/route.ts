import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { redis } from '@/lib/redis'
import { syncToExploreRedis, getExploreRedisDataKey } from '@/lib/redis-sync'
import { removeFromExploreRedis } from '@/lib/redis-sync'
import { isExploreItemProjection, isExploreProductPublic, isExploreServicePublic, isExploreStorePublic } from '@/lib/redis-explore-serializer'
import { revalidateExploreSearch } from '@/lib/utils/revalidation'
import { checkRateLimitForAPI } from '@/lib/security/require-rate-limit'
import { RateLimitCategory } from '@/lib/rate-limiter'

const ORPHAN_AUDIT_LIMIT = 250

async function reconcileOrphanedExploreIndex() {
  const members = await redis.zrange(
    "explore:index:all",
    "+inf",
    "-inf",
    { byScore: true, rev: true, offset: 0, count: ORPHAN_AUDIT_LIMIT },
  ) as string[]

  if (!members.length) return { audited: 0, missingObjects: 0, repaired: 0 }

  const keys = members.map(member => {
    const [type, ...idParts] = String(member).split(":")
    return getExploreRedisDataKey(type, idParts.join(":"))
  })
  const objects = await redis.mget(...keys)
  const typedMembers = members.map(member => {
    const [type, ...idParts] = String(member).split(":")
    return { member: String(member), type, id: idParts.join(":") }
  })
  const productIds = typedMembers.filter(item => item.type === 'produto' && item.id).map(item => item.id)
  const serviceIds = typedMembers.filter(item => item.type === 'servico' && item.id).map(item => item.id)
  const storeIds = typedMembers.filter(item => item.type === 'loja' && item.id).map(item => item.id)
  const admin = getAdminClient()
  const [productsRes, servicesRes, storesRes] = await Promise.all([
    productIds.length > 0
      ? admin.from('products').select('id, is_active, status, moderation_status, deleted_at, show_in_marketplace').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length > 0
      ? admin.from('services').select('id, is_active, status, moderation_status, deleted_at, show_in_marketplace').in('id', serviceIds)
      : Promise.resolve({ data: [], error: null }),
    storeIds.length > 0
      ? admin.from('stores').select('id, is_active').in('id', storeIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (productsRes.error || servicesRes.error || storesRes.error) {
    throw productsRes.error || servicesRes.error || storesRes.error
  }

  const eligible = new Set<string>()
  for (const row of productsRes.data || []) {
    if (isExploreProductPublic(row)) eligible.add(`produto:${row.id}`)
  }
  for (const row of servicesRes.data || []) {
    if (isExploreServicePublic(row)) eligible.add(`servico:${row.id}`)
  }
  for (const row of storesRes.data || []) {
    if (isExploreStorePublic(row)) eligible.add(`loja:${row.id}`)
  }

  const ineligibleMembers = typedMembers
    .filter(item => !eligible.has(item.member))
    .map(item => item.member)
  const missing = members.filter((member, index) => !objects.at(index) && !ineligibleMembers.includes(String(member)))
  let repaired = 0

  const removeResults = await Promise.allSettled(ineligibleMembers.map(member => {
    const [type, ...idParts] = String(member).split(":")
    if (!['produto', 'servico', 'loja'].includes(type) || !idParts.length) return Promise.resolve(false)
    return removeFromExploreRedis(idParts.join(":"), type as 'produto' | 'servico' | 'loja', true, true)
  }))
  const results = await Promise.allSettled(missing.map(member => {
    const [type, ...idParts] = String(member).split(":")
    if (!['produto', 'servico', 'loja'].includes(type) || !idParts.length) return Promise.resolve(false)
    return syncToExploreRedis({
      id: idParts.join(":"),
      type: type as 'produto' | 'servico' | 'loja',
      data: {},
      silent: true,
      throwOnError: true,
    })
  }))
  repaired = results.filter(result => result.status === 'fulfilled' && result.value === true).length
  const removed = removeResults.filter(result => result.status === 'fulfilled' && result.value === true).length

  console.log(`[Cron Reconciliation] indexAudited=${members.length} missingObjects=${missing.length} ineligible=${ineligibleMembers.length} repaired=${repaired} removed=${removed}`)
  return { audited: members.length, missingObjects: missing.length, ineligible: ineligibleMembers.length, repaired, removed }
}

export async function GET(req: Request) {
  const start = Date.now()
  try {
    const authHeader = req.headers.get('Authorization')
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResult = await checkRateLimitForAPI(RateLimitCategory.INTERNAL_CRON, 'sync-redis')
    if (rateLimitResult.limited) {
      return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
    }

    const supabase = getAdminClient()
    
    // Buscar itens modificados recentemente dos 3 tipos
    const [prodRes, servRes, partRes] = await Promise.all([
      supabase.from("products").select("id, updated_at").eq("status", "ativo").eq("is_active", true).neq("moderation_status", "rejected").is("deleted_at", null).eq("show_in_marketplace", true).order("updated_at", { ascending: false }).limit(100),
      supabase.from("services").select("id, updated_at").in("status", ["ativo", "active"]).is("deleted_at", null).eq("show_in_marketplace", true).order("updated_at", { ascending: false }).limit(50),
      supabase.from("partners").select("id, updated_at").eq("is_active", true).order("updated_at", { ascending: false }).limit(50)
    ])

    const recentItems: { id: string, updated_at: string, type: 'produto'|'servico'|'loja' }[] = [
      ...(prodRes.data || []).map((i: any) => ({ ...i, type: 'produto' as const })),
      ...(servRes.data || []).map((i: any) => ({ ...i, type: 'servico' as const })),
      ...(partRes.data || []).map((i: any) => ({ ...i, type: 'loja' as const }))
    ]

    let synced = 0
    let missed = 0

    if (recentItems.length > 0) {
      // 1. O(N) memory reconciliation via MGET das chaves do objeto para validar stale data
      // O PIPELINE apenas dizia se existia, o MGET traz os JSONs para comparar updated_at
      const keys = recentItems.map(item => getExploreRedisDataKey(item.type, item.id))
      const cachedObjectsRaw = await redis.mget(...keys)
      
      const missingOrStaleItems = recentItems.filter((dbItem, idx) => {
        const rawJson = cachedObjectsRaw.at(idx)
        if (!rawJson) return true // Está faltando no Redis
        
        try {
           const obj = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson
           // Comparar datas. Se o BD for mais novo ou o Redis não tiver a data, é STALE!
            if (!obj.updated_at) return true
            if (!isExploreItemProjection(obj, dbItem.type)) return true
           
           const dbTime = new Date(dbItem.updated_at).getTime()
           const redisTime = new Date(obj.updated_at).getTime()
           // Se o BD estiver 2s à frente (pra evitar micro drifts), considera stale
           if (dbTime > redisTime + 2000) return true
        } catch (e) {
           return true // JSON corrompido, refaz
        }
        
        return false // Está totalmente síncrono
      })
      
      missed = missingOrStaleItems.length

      // Sincronizar em lotes via Action nativa
      const batches = []
      for (const p of missingOrStaleItems) {
        // Revalidate once after the batch instead of incrementing the search
        // version for every repaired item.
        batches.push(syncToExploreRedis({ id: p.id, type: p.type, data: {}, silent: true }))
        synced++
      }
      
      await Promise.allSettled(batches)
      if (missingOrStaleItems.length > 0) {
        await revalidateExploreSearch({ silent: false })
      }
    }

    const orphanReconciliation = await reconcileOrphanedExploreIndex()

    const elapsed = Date.now() - start
    return NextResponse.json({
      status: 'success',
      audited: recentItems.length,
      synced,
      missed,
      orphanReconciliation,
      elapsedMs: Math.round(elapsed)
    })
  } catch (error: any) {
    console.error("[Cron Reconciliation Error]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
