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
  score?: number // Se não informado, usa Date.now()
  removeFromRedis?: boolean
  silent?: boolean
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
            category_id, category:product_categories!category_id(name), created_at, updated_at, is_active, show_in_marketplace,
            marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
            partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state)),
            product_variants(variant_options, price_adjustment, is_active)
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
          console.log(`[MarketplaceTrace] produto:${id} removido do Redis — is_active=${dbData.is_active} show_in_marketplace=${dbData.show_in_marketplace}`)
          return await removeFromExploreRedis(id, type)
        }

        console.log(`[MarketplaceTrace] produto:${id} sincronizado no Redis (db ok, query ok)`)

        // Normalização básica idêntica ao que o marketplace espera
        const rawPartner = Array.isArray(dbData.partners) ? dbData.partners[0] : dbData.partners
        const partner = rawPartner ? {
          ...rawPartner,
          store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
          latitude: rawPartner.latitude,
          longitude: rawPartner.longitude,
          city: rawPartner.addresses?.[0]?.city || null,
          state: rawPartner.addresses?.[0]?.state || null
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
            id, name, price, promotional_price, images, rating, category, category_id, duration_minutes, created_at, updated_at, is_active, show_in_marketplace,
            service_categories:service_categories!category_id(name),
            partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state))
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
        const partner = rawPartner ? {
          ...rawPartner,
          store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
          latitude: rawPartner.latitude,
          longitude: rawPartner.longitude,
          city: rawPartner.addresses?.[0]?.city || null,
          state: rawPartner.addresses?.[0]?.state || null
        } : null
        const serviceCategoryName = dbData.service_categories?.name || dbData.category || null
        finalData = { ...dbData, category: serviceCategoryName, partners: partner, subcategoryName: serviceCategoryName }
      }
      else if (type === 'loja') {
        const { data: dbData } = await admin
          .from("partners")
          .select(`
            id, store_name, store_description, store_image_url, banner_url, logo_moderation_status, banner_moderation_status, rating, latitude, longitude, created_at, updated_at,
            category_id, category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)),
            addresses(city, state),
            reviews(count)
          `)
          .eq("id", id)
          .single()

        if (dbData) {
          const city = dbData.addresses?.[0]?.city || null
          const state = dbData.addresses?.[0]?.state || null
          const reviewsCount = dbData.reviews?.[0]?.count || 0
          const categoryName = dbData.category?.parent?.name || dbData.category?.name || 'Loja Parceira'
          finalData = {
            id: dbData.id,
            name: dbData.store_name,
            description: dbData.store_description,
            images: [dbData.banner_url || dbData.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"],
            rating: dbData.rating,
            category: categoryName,
            partners: {
              ...dbData,
              city,
              state,
              reviewsCount,
              store_avatar: dbData.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"
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

    // 1. Atualiza o Cache do Objeto (JSON)
    // 2. Atualiza o Índice Específico (zset)
    // 3. Atualiza o Índice Global (zset)
    await Promise.all([
      redis.set(dataKey, JSON.stringify({ ...finalData, itemType: type })),
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
    .eq("is_active", true)
    .neq("show_in_marketplace", false)

  // Buscar serviços ativos
  const { data: services } = await admin
    .from("services")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
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
