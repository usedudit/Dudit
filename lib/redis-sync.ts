import { redis } from './redis'
import { getAdminClient } from './supabase/admin'
import { revalidateExploreSearch } from './utils/revalidation'
import {
  isExploreProductPublic,
  isExploreServicePublic,
  isExploreStorePublic,
  serializeExploreItem,
} from './redis-explore-serializer'

export type ItemType = 'produto' | 'servico' | 'loja'

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
  throwOnError?: boolean
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

// Extrai imagem e menor preço das variantes ativas como fallback
function extractFirstVariantFallback(variants: any[] | null | undefined, basePrice?: number) {
  if (!variants || variants.length === 0) return { fallback_variant_image: null, fallback_variant_price: null }

  const activeVariants = variants.filter((v: any) => v.is_active !== false)
  const withImage = activeVariants.find((v: any) => v.variant_options?.image) || variants.find((v: any) => v.variant_options?.image)
  const image = withImage?.variant_options?.image || null

  const prices = (activeVariants.length > 0 ? activeVariants : variants)
    .map((v: any) => Number(v.price_adjustment || 0))
    .filter((p: number) => p > 0)

  const lowestPrice = prices.length > 0 ? Math.min(...prices) : null

  return { fallback_variant_image: image, fallback_variant_price: lowestPrice }
}

function normalizeCityToSlug(city: string, state: string): string {
  const normCity = city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return `${normCity}-${state.toLowerCase()}`
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
  silent = false,
  throwOnError = false
}: SyncItemOptions): Promise<boolean> {
  // Silent updates (e.g. stock decrements, inventory ticks, views) do not touch Redis
  if (silent && !removeFromRedis) {
    return true
  }

  const typeIndexKey = `explore:index:${type === 'produto' ? 'produtos' : type === 'servico' ? 'servicos' : 'vitrines'}`
  const globalIndexKey = `explore:index:all`
  const dataKey = getExploreRedisDataKey(type, id)
  const memberId = `${type}:${id}`

  try {
    if (removeFromRedis) {
      let citySlug: string | null = null
      try {
        const existingRaw = await redis.get<string | Record<string, any>>(dataKey)
        const existing = typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw
        const partnerCity = existing?.partners?.city
        const partnerState = existing?.partners?.state
        if (partnerCity && partnerState) {
          citySlug = normalizeCityToSlug(partnerCity, partnerState)
        }
      } catch { }

      const p = redis.pipeline()
      p.zrem(typeIndexKey, memberId)
      p.zrem(globalIndexKey, memberId)
      p.del(dataKey)
      if (citySlug) {
        p.zrem(`explore:index:cidade:${citySlug}`, memberId)
        p.zrem(`explore:index:cidade:${citySlug}:${type === 'produto' ? 'produtos' : type === 'servico' ? 'servicos' : 'vitrines'}`, memberId)
      }
      await p.exec()

      // Invalidate Next.js cache so home/explore reflect the removal immediately
      await revalidateExploreSearch({ silent })
      console.log(`[RedisSync] Removido: ${memberId} silent:${silent}`)
      return true
    }

    // Validação básica para evitar lixo no Redis
    let finalData = data

    // Se a data estiver vazia e não for remoção, tentamos buscar o objeto completo
    // para garantir que o Redis tenha todos os joins (parceiro, endereço, etc)
    const needsAuthoritativeLookup = type === 'produto'
      ? !isExploreProductPublic(data)
      : type === 'servico'
        ? !isExploreServicePublic(data)
        : !isExploreStorePublic(data)
    if (!removeFromRedis && (Object.keys(data).length <= 1 || !data.partners || needsAuthoritativeLookup)) {
      const admin = getAdminClient()

      if (type === 'produto') {
        const { data: dbData } = await admin
          .from("products")
          .select(`
            id, name, description, price, promotional_price, images, video_thumbnail, rating,
            marketplace_score, sales_last_30_days, favorites_count, views_last_30_days,
            stock_quantity, stock_available,
            category_id, category:product_categories!category_id(name), created_at, updated_at, is_active, status, moderation_status, deleted_at, show_in_marketplace,
            marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
            partners(id),
            stores(id, name, logo_url, addresses!store_id!left(city, state, neighborhood, latitude, longitude)),
            product_variants(variant_options, price_adjustment, is_active),
            show_price_in_store
          `)
          .eq("id", id)
          .maybeSingle()

        if (!dbData) {
          console.warn(`[RedisSync] Produto ${id} não encontrado no DB. Removendo do Redis.`)
          return await removeFromExploreRedis(id, type, silent, throwOnError)
        }

        // Verifica se o produto pode ser público no marketplace
        const isPublic = isExploreProductPublic(dbData)
        if (!isPublic) {
          console.log(`[MarketplaceTrace] produto:${id} removido do Redis - is_active=${dbData.is_active} show_in_marketplace=${dbData.show_in_marketplace}`)
          return await removeFromExploreRedis(id, type, silent, throwOnError)
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
          state: rawStore?.addresses?.[0]?.state || null,
          neighborhood: rawStore?.addresses?.[0]?.neighborhood || null
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
            category_id, duration_minutes, created_at, updated_at, is_active, status, moderation_status, deleted_at, show_in_marketplace,
            marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name)),
            partners(id),
            stores(id, name, logo_url, addresses!store_id!left(city, state, neighborhood, latitude, longitude)),
            show_price_in_store
          `)
          .eq("id", id)
          .maybeSingle()

        if (!dbData) {
          return await removeFromExploreRedis(id, type, silent, throwOnError)
        }

        if (!isExploreServicePublic(dbData)) {
          return await removeFromExploreRedis(id, type, silent, throwOnError)
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
          state: rawStore?.addresses?.[0]?.state || null,
          neighborhood: rawStore?.addresses?.[0]?.neighborhood || null
        } : null
        const catName = dbData.marketplace_category?.parent?.name || dbData.marketplace_category?.name || null
        finalData = { ...dbData, category: catName, partners: partner, subcategoryName: dbData.marketplace_category?.parent ? dbData.marketplace_category.name : null }
      }
      else if (type === 'loja') {
        const { data: dbData } = await admin
          .from("stores")
          .select(`
            id, name, slug, description, logo_url, banner_url, rating, marketplace_reputation, created_at, updated_at, partner_id, is_active,
            addresses!store_id!left(city, state, neighborhood, latitude, longitude),
            partners!inner(id, category_id, category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)), reviews(count))
          `)
          .eq("id", id)
          .maybeSingle()

        if (!dbData || !isExploreStorePublic(dbData)) {
          return await removeFromExploreRedis(id, type, silent, throwOnError)
        }

        if (dbData && isExploreStorePublic(dbData)) {
          const addr = dbData.addresses?.[0]
          const city = addr?.city || null
          const state = addr?.state || null
          const neighborhood = addr?.neighborhood || null
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
              neighborhood,
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
      return false
    }

    const publicData = { ...serializeExploreItem({ ...finalData, itemType: type }, type), itemType: type }
    const finalScore = computeExploreRedisScore((publicData as any), score)

    // 1. Atualiza o Cache do Objeto (JSON) com TTL de 7 dias
    // 2. Atualiza o Índice Específico (zset)
    // 3. Atualiza o Índice Global (zset)
    // 4. Atualiza o Índice da Cidade (zset) se houver endereço
    // PIPELINE ATÔMICO: 1 única requisição HTTP para o Upstash ao invés de 3 a 5
    const p = redis.pipeline()
    p.set(dataKey, JSON.stringify(publicData), { ex: 604800 })
    p.zadd(typeIndexKey, { score: finalScore, member: memberId })
    p.zadd(globalIndexKey, { score: finalScore, member: memberId })

    const partnerCity = (publicData as any)?.partners?.city || (finalData as any)?.partners?.city
    const partnerState = (publicData as any)?.partners?.state || (finalData as any)?.partners?.state
    if (partnerCity && partnerState) {
      const citySlug = normalizeCityToSlug(partnerCity, partnerState)
      p.zadd(`explore:index:cidade:${citySlug}`, { score: finalScore, member: memberId })
      p.zadd(`explore:index:cidade:${citySlug}:${type === 'produto' ? 'produtos' : type === 'servico' ? 'servicos' : 'vitrines'}`, { score: finalScore, member: memberId })
    }

    await p.exec()

    // 4. Invalidate Next.js cache tags so home/explore reflect changes immediately
    await revalidateExploreSearch({ silent })

    console.log(`[RedisSync] Sincronizado com sucesso via pipeline: ${memberId}`)
    return true
  } catch (error) {
    console.error(`[RedisSync] Erro ao sincronizar ${memberId}:`, error)
    if (throwOnError) throw error
    return false
    // Não lançamos erro para não quebrar a Action principal (graceful degradation)
  }
}

/**
 * Helper para remover item do Redis (ex: deleção de produto)
 */
export async function removeFromExploreRedis(id: string, type: ItemType, silent: boolean = false, throwOnError: boolean = false): Promise<boolean> {
  return syncToExploreRedis({ id, type, data: {}, removeFromRedis: true, silent, throwOnError })
}

/**
 * Atualiza todos os produtos e serviços de um parceiro no Redis.
 * Útil quando o parceiro altera o nome da loja ou endereço, o que afeta a URL dos itens.
 *
 * OTIMIZADO: Executa apenas 2 queries no Supabase em lote e 1 único pipeline HTTP no Upstash Redis
 * (ao invés de N queries sequenciais e N*5 chamadas HTTP separadas).
 */
export async function syncPartnerItemsToExploreRedis(partnerId: string, options: { throwOnError?: boolean } = {}): Promise<void> {
  const admin = getAdminClient()

  // Buscar produtos e serviços com todos os dados necessários em uma única consulta paralela
  const [productsRes, servicesRes] = await Promise.all([
    admin
      .from("products")
      .select(`
        id, name, description, price, promotional_price, images, video_thumbnail, rating,
        marketplace_score, sales_last_30_days, favorites_count, views_last_30_days,
        stock_quantity, stock_available,
        category_id, category:product_categories!category_id(name), created_at, updated_at, is_active, status, moderation_status, deleted_at, show_in_marketplace,
        marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
        partners(id),
        stores(id, name, logo_url, addresses!store_id!left(city, state, neighborhood, latitude, longitude)),
        product_variants(variant_options, price_adjustment, is_active),
        show_price_in_store
      `)
      .eq("partner_id", partnerId)
      .eq("status", "ativo")
      .eq("show_in_marketplace", true),
    admin
      .from("services")
      .select(`
        id, name, price, promotional_price, images, rating, marketplace_score, bookings_last_30_days, favorites_count, views_count,
        category_id, duration_minutes, created_at, updated_at, is_active, status, moderation_status, deleted_at, show_in_marketplace,
        marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name)),
        partners(id),
        stores(id, name, logo_url, addresses!store_id!left(city, state, neighborhood, latitude, longitude)),
        show_price_in_store
      `)
      .eq("partner_id", partnerId)
      .in("status", ["ativo", "active"])
      .is("deleted_at", null)
      .eq("show_in_marketplace", true)
  ])

  if (options.throwOnError && (productsRes.error || servicesRes.error)) {
    throw productsRes.error || servicesRes.error
  }

  const products = productsRes.data || []
  const services = servicesRes.data || []

  if (products.length === 0 && services.length === 0) {
    return
  }

  const p = redis.pipeline()
  let hasOps = false

  for (const dbData of products) {
    if (!isExploreProductPublic(dbData)) continue

    const rawPartner = Array.isArray(dbData.partners) ? dbData.partners[0] : dbData.partners
    const rawStore = Array.isArray(dbData.stores) ? dbData.stores[0] : dbData.stores
    const partner = rawPartner ? {
      ...rawPartner,
      store_name: rawStore?.name,
      store_avatar: rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
      latitude: rawStore?.addresses?.[0]?.latitude,
      longitude: rawStore?.addresses?.[0]?.longitude,
      city: rawStore?.addresses?.[0]?.city || null,
      state: rawStore?.addresses?.[0]?.state || null,
      neighborhood: rawStore?.addresses?.[0]?.neighborhood || null
    } : null

    const variantFallback = extractFirstVariantFallback(dbData.product_variants, Number(dbData.price))
    const categoryName = dbData.marketplace_category?.parent?.name || dbData.marketplace_category?.name || (dbData.category as any)?.name || null
    const subcategoryName = dbData.marketplace_category?.parent ? dbData.marketplace_category.name : null

    const finalData = {
      ...dbData,
      category: categoryName,
      subcategoryName,
      partners: partner,
      ...variantFallback
    }
    delete (finalData as any).product_variants

    const publicData = { ...serializeExploreItem({ ...finalData, itemType: "produto" }, "produto"), itemType: "produto" }
    const finalScore = computeExploreRedisScore((publicData as any), undefined)
    const memberId = `produto:${dbData.id}`
    const dataKey = getExploreRedisDataKey("produto", dbData.id)

    p.set(dataKey, JSON.stringify(publicData), { ex: 604800 })
    p.zadd("explore:index:produtos", { score: finalScore, member: memberId })
    p.zadd("explore:index:all", { score: finalScore, member: memberId })

    const partnerCity = partner?.city
    const partnerState = partner?.state
    if (partnerCity && partnerState) {
      const citySlug = normalizeCityToSlug(partnerCity, partnerState)
      p.zadd(`explore:index:cidade:${citySlug}`, { score: finalScore, member: memberId })
      p.zadd(`explore:index:cidade:${citySlug}:produtos`, { score: finalScore, member: memberId })
    }
    hasOps = true
  }

  for (const dbData of services) {
    if (!isExploreServicePublic(dbData)) continue

    const rawPartner = Array.isArray(dbData.partners) ? dbData.partners[0] : dbData.partners
    const rawStore = Array.isArray(dbData.stores) ? dbData.stores[0] : dbData.stores
    const partner = rawPartner ? {
      ...rawPartner,
      store_name: rawStore?.name,
      store_avatar: rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
      latitude: rawStore?.addresses?.[0]?.latitude,
      longitude: rawStore?.addresses?.[0]?.longitude,
      city: rawStore?.addresses?.[0]?.city || null,
      state: rawStore?.addresses?.[0]?.state || null,
      neighborhood: rawStore?.addresses?.[0]?.neighborhood || null
    } : null
    const catName = dbData.marketplace_category?.parent?.name || dbData.marketplace_category?.name || null

    const finalData = {
      ...dbData,
      category: catName,
      partners: partner,
      subcategoryName: dbData.marketplace_category?.parent ? dbData.marketplace_category.name : null
    }

    const publicData = { ...serializeExploreItem({ ...finalData, itemType: "servico" }, "servico"), itemType: "servico" }
    const finalScore = computeExploreRedisScore((publicData as any), undefined)
    const memberId = `servico:${dbData.id}`
    const dataKey = getExploreRedisDataKey("servico", dbData.id)

    p.set(dataKey, JSON.stringify(publicData), { ex: 604800 })
    p.zadd("explore:index:servicos", { score: finalScore, member: memberId })
    p.zadd("explore:index:all", { score: finalScore, member: memberId })

    const partnerCity = partner?.city
    const partnerState = partner?.state
    if (partnerCity && partnerState) {
      const citySlug = normalizeCityToSlug(partnerCity, partnerState)
      p.zadd(`explore:index:cidade:${citySlug}`, { score: finalScore, member: memberId })
      p.zadd(`explore:index:cidade:${citySlug}:servicos`, { score: finalScore, member: memberId })
    }
    hasOps = true
  }

  if (hasOps) {
    await p.exec()
  }

  await revalidateExploreSearch({ silent: false })
  console.log(`[RedisSync] Sincronizados em lote pipeline ${products.length} produtos e ${services.length} serviços para o parceiro ${partnerId}`)
}




