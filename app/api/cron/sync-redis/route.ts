import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { redis } from '@/lib/redis'
import { syncToExploreRedis, getExploreRedisDataKey } from '@/lib/redis-sync'

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
  const missing = members.filter((_, index) => !objects.at(index))
  let repaired = 0

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

  console.log(`[Cron Reconciliation] indexAudited=${members.length} missingObjects=${missing.length} repaired=${repaired}`)
  return { audited: members.length, missingObjects: missing.length, repaired }
}

export async function GET(req: Request) {
  const start = Date.now()
  try {
    const authHeader = req.headers.get('Authorization')
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getAdminClient()
    
    // Buscar itens modificados recentemente dos 3 tipos
    const [prodRes, servRes, partRes] = await Promise.all([
      supabase.from("products").select("id, updated_at").eq("status", "ativo").eq("is_active", true).eq("moderation_status", "approved").is("deleted_at", null).eq("show_in_marketplace", true).order("updated_at", { ascending: false }).limit(100),
      supabase.from("services").select("id, updated_at").eq("status", "ativo").eq("is_active", true).eq("moderation_status", "approved").is("deleted_at", null).eq("show_in_marketplace", true).order("updated_at", { ascending: false }).limit(50),
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
        batches.push(syncToExploreRedis({ id: p.id, type: p.type, data: {} }))
        synced++
      }
      
      await Promise.allSettled(batches)
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
