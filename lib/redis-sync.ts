import "server-only"
import { redis } from './redis'
import { getAdminClient } from './supabase/admin'
import { revalidateExploreSearch } from './utils/revalidation'

type ItemType = 'produto' | 'servico' | 'loja'

export function getExploreRedisDataKey(type: string, id: string): string {
  return `data:v2:${type}:${id}`
}

interface SyncItemOptions {
  id: string
  type: ItemType
  data: any // Objeto completo formatado para o marketplace
  score?: number // Se não informado, usa marketplace_score + desempate por created_at
  removeFromRedis?: boolean
  silent?: boolean
}

/** Redis ZSET score: higher marketplace_score ranks first; created_at breaks ties. */
export function computeExploreRedisScore(
  data: { marketplace_score?: number; marketplace_reputation?: number; created_at?: string },
  explicitScore?: number,
): number {
  if (explicitScore !== undefined) return explicitScore
  const rankScore = Number(data.marketplace_score ?? data.marketplace_reputation ?? 0)
  const timePart = new Date(data.created_at || Date.now()).getTime() / 1e15
  return rankScore * 1e6 + timePart
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
  removeFromRedis = false,
  silent = false
}: SyncItemOptions): Promise<void> {
  const typeIndexKey = `explore:index:${type === 'produto' ? 'produtos' : type === 'servico' ? 'servicos' : 'vitrines'}`
  const globalIndexKey = `explore:index:all`
  const dataKey = getExploreRedisDataKey(type, id)
  const memberId = `${type}:${id}`

  try {
    if (removeFromRedis) {
      // Remove de todos os índices e do cache de objeto
      await Promise.all([
        redis.zrem(typeIndexKey, memberId),
        redis.zrem(globalIndexKey, memberId),
        redis.del(dataKey)
      ])
      // Invalidate Next.js cache so home/explore reflect the removal immediately
      await revalidateExploreSearch({ silent })
      console.log(`[RedisSync] Removido: ${memberId} silent:${silent}`)
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
            id, name, description, price, promotional_price, images, video_thumbnail, rating,
            marketplace_score, sales_last_30_days, favorites_count, views_last_30_days,
            category_id, category:product_categories!category_id(name), created_at, updated_at, is_active, show_in_marketplace,
            marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
            partners(id),
            stores(id, name, logo_url, addresses!store_id!left(city, state, latitude, longitude)),
            product_variants(variant_options, price_adjustment, is_active),
            show_price_in_store
          `)
          .eq("id", id)
          .single()

        if (!dbData) {
          console.warn(`[RedisSync] Produto ${id} não encontrado no DB. Removendo do Redis.`)
          return await removeFromExploreRedis(id, type)
        }

        // Verifica se o produto pode ser público no marketplace
        const isPublic = dbData.is_active && dbData.show_in_marketplace !== false
        if (!isPublic) {
          console.log(`[MarketplaceTrace] produto:${id} removido do Redis - is_active=${dbData.is_active} show_in_marketplace=${dbData.show_in_marketplace}`)
          return await removeFromExploreRedis(id, type)
        }

        console.log(`[MarketplaceTrace] produto:${id} sincronizado no Redis (db ok, query ok)`)

        // Normalização básica idêntica ao que o marketplace espera
        const rawPartner = Array.isArray(dbData.partners) ? dbData.partners[0] : dbData.partners
        const rawStore = Array.isArray(dbData.stores) ? dbData.stores[0] : dbData.stores
        const partner = rawPartner ? {
          ...rawPartner,
          store_name: rawStore?.name,
          store_avatar: rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
          latitude: rawStore?.addresses?.[0]?.latitude,
          longitude: rawStore?.addresses?.[0]?.longitude,
          city: rawStore?.addresses?.[0]?.city || null,
          state: rawStore?.addresses?.[0]?.state || null
        } : null

        const variantFallback = extractFirstVariantFallback(dbData.product_variants, Number(dbData.price))

        const categoryName = dbData.marketplace_category?.parent?.name || dbData.marketplace_category?.name || (dbData.category as any)?.name || null
        const subcategoryName = dbData.marketplace_category?.parent ? dbData.marketplace_category.name : null

        finalData = {
          ...dbData,
          category: categoryName,
          subcategoryName,
          partners: partner,
          ...variantFallback
        }
        delete finalData.product_variants // Não cacheamos variantes no objeto principal
      } else if (type === 'servico') {
        // Lógica similar para serviços
        const { data: dbData } = await admin
          .from("services")
          .select(`
            id, name, price, promotional_price, images, rating, marketplace_score, bookings_last_30_days, favorites_count, views_count,
            category_id, duration_minutes, created_at, updated_at, is_active, show_in_marketplace,
            marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name)),
            partners(id),
            stores(id, name, logo_url, addresses!store_id!left(city, state, latitude, longitude)),
            show_price_in_store
          `)
          .eq("id", id)
          .single()

        if (!dbData) {
          return await removeFromExploreRedis(id, type)
        }

        if (dbData.is_active === false || dbData.show_in_marketplace !== true) {
          return await removeFromExploreRedis(id, type)
        }

        const rawPartner = Array.isArray(dbData.partners) ? dbData.partners[0] : dbData.partners
        const rawStore = Array.isArray(dbData.stores) ? dbData.stores[0] : dbData.stores
        const partner = rawPartner ? {
          ...rawPartner,
          store_name: rawStore?.name,
          store_avatar: rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
          latitude: rawStore?.addresses?.[0]?.latitude,
          longitude: rawStore?.addresses?.[0]?.longitude,
          city: rawStore?.addresses?.[0]?.city || null,
          state: rawStore?.addresses?.[0]?.state || null
        } : null
        const catName = dbData.marketplace_category?.parent?.name || dbData.marketplace_category?.name || null
        finalData = { ...dbData, category: catName, partners: partner, subcategoryName: dbData.marketplace_category?.parent ? dbData.marketplace_category.name : null }
      }
      else if (type === 'loja') {
        const { data: dbData } = await admin
          .from("stores")
          .select(`
            id, name, slug, description, logo_url, banner_url, rating, marketplace_reputation, created_at, updated_at, partner_id,
            addresses!store_id!left(city, state, latitude, longitude),
            partners!inner(id, category_id, category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)), reviews(count))
          `)
          .eq("id", id)
          .single()

        if (dbData) {
          const addr = dbData.addresses?.[0]
          const city = addr?.city || null
          const state = addr?.state || null
          const latitude = addr?.latitude || null
          const longitude = addr?.longitude || null
          const p = dbData.partners as any
          const reviewsCount = p?.reviews?.[0]?.count || 0
          const cat = p?.category
          const categoryName = cat?.parent?.name || cat?.name || 'Loja Parceira'
          finalData = {
            id: dbData.id,
            name: dbData.name || "Loja",
            slug: dbData.slug || undefined,
            description: dbData.description || "",
            images: [dbData.banner_url || dbData.logo_url || "https://img.dudit.com.br/static/Placeholder.png"],
            rating: dbData.rating || 0,
            category: categoryName,
            partners: {
              id: dbData.partner_id || dbData.id,
              store_id: dbData.id,
              store_name: dbData.name || "Loja",
              slug: dbData.slug || null,
              store_avatar: dbData.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
              store_image_url: dbData.logo_url,
              banner_url: dbData.banner_url || null,
              latitude,
              longitude,
              city,
              state,
              reviewsCount
            },
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

    const finalScore = computeExploreRedisScore(finalData, score)

    // 1. Atualiza o Cache do Objeto (JSON) com TTL de 7 dias
    // 2. Atualiza o Índice Específico (zset)
    // 3. Atualiza o Índice Global (zset)
    await Promise.all([
      redis.set(dataKey, JSON.stringify({ ...finalData, itemType: type }), { ex: 604800 }),
      redis.zadd(typeIndexKey, { score: finalScore, member: memberId }),
      redis.zadd(globalIndexKey, { score: finalScore, member: memberId })
    ])

    // 4. Invalidate Next.js cache tags so home/explore reflect changes immediately
    await revalidateExploreSearch({ silent })

    console.log(`[RedisSync] Sincronizado com sucesso: ${memberId}`)
  } catch (error) {
    console.error(`[RedisSync] Erro ao sincronizar ${memberId}:`, error)
    // Não lançamos erro para não quebrar a Action principal (graceful degradation)
  }
}

/**
 * Helper para remover item do Redis (ex: deleção de produto)
 */
export async function removeFromExploreRedis(id: string, type: ItemType, silent: boolean = false): Promise<void> {
  return syncToExploreRedis({ id, type, data: {}, removeFromRedis: true, silent })
}

/**
 * Atualiza todos os produtos e serviços de um parceiro no Redis.
 * Útil quando o parceiro altera o nome da loja ou endereço, o que afeta a URL dos itens.
 */
export async function syncPartnerItemsToExploreRedis(partnerId: string): Promise<void> {
  const admin = getAdminClient()

  // Buscar produtos ativos
  const { data: products } = await admin
    .from("products")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("status", "ativo")
    .neq("show_in_marketplace", false)

  // Buscar serviços ativos
  const { data: services } = await admin
    .from("services")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("status", "ativo")
    .eq("show_in_marketplace", true)

  const promises: Promise<void>[] = []

  if (products && products.length > 0) {
    for (const prod of products) {
      promises.push(syncToExploreRedis({ id: prod.id, type: "produto", data: {}, silent: true }))
    }
  }

  if (services && services.length > 0) {
    for (const serv of services) {
      promises.push(syncToExploreRedis({ id: serv.id, type: "servico", data: {}, silent: true }))
    }
  }

  if (promises.length > 0) {
    await Promise.all(promises)
    // Forçar uma revalidação não-silenciosa ao final
    await revalidateExploreSearch({ silent: false })
    console.log(`[RedisSync] Sincronizados ${products?.length || 0} produtos e ${services?.length || 0} serviços para o parceiro ${partnerId}`)
  }
}




