import "server-only"
import { redis } from './redis'
import { getAdminClient } from './supabase/admin'
import { revalidateExploreSearch } from './utils/revalidation'

type ItemType = 'produto' | 'servico' | 'loja'

interface SyncItemOptions {
  id: string
  type: ItemType
  data: any // Objeto completo formatado para o marketplace
  score?: number // Se não informado, usa Date.now()
  removeFromRedis?: boolean
}

// Extrai imagem e preço da primeira variante ativa como fallback
function extractFirstVariantFallback(variants: any[] | null | undefined, basePrice: number) {
  if (!variants || variants.length === 0) return { fallback_variant_image: null, fallback_variant_price: null }

  const withImage = variants.find((v: any) => v.is_active && v.variant_options?.image)
  const first = variants.find((v: any) => v.is_active) || variants[0]

  const image = withImage?.variant_options?.image || null
  const priceAdj = first?.price_adjustment
  const price = priceAdj && priceAdj > 0 ? priceAdj : null

  return { fallback_variant_image: image, fallback_variant_price: price }
}

/**
 * Utilitário para sincronizar itens com o cache/índice do Explorar no Redis.
 * Garante que a criação/edição no ERP reflita instantaneamente no Marketplace.
 */
export async function syncToExploreRedis({
  id,
  type,
  data,
  score,
  removeFromRedis = false
}: SyncItemOptions) {
  const typeIndexKey = `explore:index:${type === 'produto' ? 'produtos' : type === 'servico' ? 'servicos' : 'vitrines'}`
  const globalIndexKey = `explore:index:all`
  const dataKey = `data:${type}:${id}`
  const memberId = `${type}:${id}`
  const finalScore = score ?? new Date(data.created_at || Date.now()).getTime()

  try {
    if (removeFromRedis) {
      // Remove de todos os índices e do cache de objeto
      await Promise.all([
        redis.zrem(typeIndexKey, memberId),
        redis.zrem(globalIndexKey, memberId),
        redis.del(dataKey)
      ])
      // Invalidate Next.js cache so home/explore reflect the removal immediately
      await revalidateExploreSearch()
      console.log(`[RedisSync] Removido: ${memberId}`)
      return
    }

    // Validação básica para evitar lixo no Redis
    let finalData = data

    // Se a data estiver vazia e não for remoção, tentamos buscar o objeto completo
    // para garantir que o Redis tenha todos os joins (parceiro, endereço, etc)
    if (!removeFromRedis && (Object.keys(data).length <= 1 || !data.partners)) {
      const admin = getAdminClient()
      
      if (type === 'produto') {
        const { data: dbData } = await admin
          .from("products")
          .select(`
            id, name, price, promotional_price, images, rating, category, created_at, updated_at,
            partners(id, store_name, store_image_url, addresses(city, state)),
            product_variants(variant_options, price_adjustment, is_active)
          `)
          .eq("id", id)
          .single()
        
        if (dbData) {
          // Normalização básica idêntica ao que o marketplace espera
          const rawPartner = Array.isArray(dbData.partners) ? dbData.partners[0] : dbData.partners
          const partner = rawPartner ? {
            ...rawPartner,
            store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
            city: rawPartner.addresses?.[0]?.city || null,
            state: rawPartner.addresses?.[0]?.state || null
          } : null

          const variantFallback = extractFirstVariantFallback(dbData.product_variants, Number(dbData.price))

          finalData = { ...dbData, partners: partner, ...variantFallback }
          delete finalData.product_variants // Não cacheamos variantes no objeto principal
        }
      } else if (type === 'servico') {
         // Lógica similar para serviços se necessário
         const { data: dbData } = await admin
          .from("services")
          .select(`
            id, name, price, promotional_price, images, rating, category, created_at, updated_at,
            partners(id, store_name, store_image_url, addresses(city, state))
          `)
          .eq("id", id)
          .single()
        
        if (dbData) {
          const rawPartner = Array.isArray(dbData.partners) ? dbData.partners[0] : dbData.partners
          const partner = rawPartner ? {
            ...rawPartner,
            store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
            city: rawPartner.addresses?.[0]?.city || null,
            state: rawPartner.addresses?.[0]?.state || null
          } : null
          finalData = { ...dbData, partners: partner }
        }
      } else if (type === 'loja') {
        const { data: dbData } = await admin
          .from("partners")
          .select(`
            id, store_name, store_image_url, rating, created_at, updated_at,
            addresses(city, state)
          `)
          .eq("id", id)
          .single()
        
        if (dbData) {
          const city = dbData.addresses?.[0]?.city || null
          const state = dbData.addresses?.[0]?.state || null
          finalData = { 
            id: dbData.id, 
            name: dbData.store_name, 
            images: [dbData.store_image_url], 
            partners: { ...dbData, city, state },
            created_at: dbData.created_at,
            updated_at: dbData.updated_at
          }
        }
      }
    }

    if (!removeFromRedis && !finalData.name && !finalData.store_name) {
      console.warn(`[RedisSync] Dados insuficientes para sincronizar ${memberId}. Ignorando.`)
      return
    }

    // 1. Atualiza o Cache do Objeto (JSON)
    // 2. Atualiza o Índice Específico (zset)
    // 3. Atualiza o Índice Global (zset)
    await Promise.all([
      redis.set(dataKey, JSON.stringify({ ...finalData, itemType: type })),
      redis.zadd(typeIndexKey, { score: finalScore, member: memberId }),
      redis.zadd(globalIndexKey, { score: finalScore, member: memberId })
    ])

    // 4. Invalidate Next.js cache tags so home/explore reflect changes immediately
    await revalidateExploreSearch()

    console.log(`[RedisSync] Sincronizado com sucesso: ${memberId}`)
  } catch (error) {
    console.error(`[RedisSync] Erro ao sincronizar ${memberId}:`, error)
    // Não lançamos erro para não quebrar a Action principal (graceful degradation)
  }
}

/**
 * Helper para remover item do Redis (ex: deleção de produto)
 */
export async function removeFromExploreRedis(id: string, type: ItemType) {
  return syncToExploreRedis({ id, type, data: {}, removeFromRedis: true })
}
