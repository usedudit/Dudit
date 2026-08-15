import { createClient } from "@supabase/supabase-js"
import { Redis } from "@upstash/redis"
import path from "path"
import fs from "fs"
import { isExploreProductPublic, isExploreServicePublic, isExploreStorePublic, serializeExploreItem } from "../lib/redis-explore-serializer"

// @ts-nocheck

// Manual .env loader to avoid 'dotenv' dependency
function loadEnv() {
    const paths = [
        path.resolve(process.cwd(), '.env.local'),
        path.resolve(process.cwd(), '.env')
    ]
    
    for (const envPath of paths) {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8')
            envContent.split('\n').forEach(line => {
                const trimmedLine = line.trim()
                if (!trimmedLine || trimmedLine.startsWith('#')) return
                
                const [key, ...valueParts] = trimmedLine.split('=')
                if (key && valueParts.length > 0) {
                    process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
                }
            })
        }
    }
}

loadEnv()

const kvUrl = process.env.KV_REST_API_URL
const kvToken = process.env.KV_REST_API_TOKEN
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!kvUrl || !kvToken || !supabaseUrl || !supabaseKey) {
    console.error("Faltam variáveis de ambiente (KV_REST_API_URL, KV_REST_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).")
    process.exit(1)
}

const redis = new Redis({ url: kvUrl, token: kvToken })
const supabase = createClient(supabaseUrl, supabaseKey)

// Reuse the extract logic from search.ts
function extractFirstVariantFallback(variants: any[] | null | undefined) {
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

async function seedRedis() {
    console.log("Iniciando Seed no Upstash Redis...")

    // 1. Limpar índices antigosp para ser idempotente
    console.log("Limpando índices existentes...")
    await redis.del("explore:index:all", "explore:index:produtos", "explore:index:servicos", "explore:index:vitrines")

    let pipeline = redis.pipeline()
    let count = 0

    const executePipelineIfFull = async () => {
        if (count >= 100) {
            await pipeline.exec()
            pipeline = redis.pipeline()
            count = 0
            console.log("Lote salvo no Redis...")
        }
    }

    // --- PRODUTOS ---
    console.log("Buscando Produtos...")
    const { data: produtos } = await supabase
        .from("products")
        .select(`
            id, name, description, price, promotional_price, images, rating, status, is_active, moderation_status, deleted_at, show_in_marketplace,
            category_id, category:product_categories!category_id(name), created_at, updated_at,
            marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
            partners(id, is_showcase_active),
            stores(id, name, logo_url, banner_url, is_showcase_active, addresses!store_id!left(city, state, neighborhood, latitude, longitude)),
            product_variants(variant_options, price_adjustment, is_active)
        `)
        .eq("status", "ativo")
        .eq("is_active", true)
        .eq("moderation_status", "approved")
        .is("deleted_at", null)
        .eq("show_in_marketplace", true)

    if (produtos) {
        for (const item of (produtos as any[])) {
            const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
            const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
            const storeName = rawStore?.name || "Vendedor"
            const storeImage = rawStore?.logo_url || null
            const storeCity = rawStore?.addresses?.[0]?.city || null
            const storeState = rawStore?.addresses?.[0]?.state || null
            const storeNeighborhood = rawStore?.addresses?.[0]?.neighborhood || null
            const storeLat = rawStore?.addresses?.[0]?.latitude || null
            const storeLng = rawStore?.addresses?.[0]?.longitude || null
            const partner = rawPartner || rawStore ? {
                id: rawPartner?.id || rawStore?.id,
                store_id: rawStore?.id || rawPartner?.id,
                store_name: storeName,
                store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                store_image_url: storeImage,
                banner_url: rawStore?.banner_url || null,
                city: storeCity,
                state: storeState,
                neighborhood: storeNeighborhood,
                latitude: storeLat,
                longitude: storeLng,
                is_showcase_active: rawStore?.is_showcase_active ?? rawPartner?.is_showcase_active ?? true
            } : null
            const variantFallback = extractFirstVariantFallback((item as any).product_variants)
            const { product_variants, ...rest } = item
            
            const mCat = item.marketplace_category as any
            const categoryName = mCat?.parent?.name || mCat?.name || (item.category as any)?.name || null
            const subcategoryName = mCat?.parent ? mCat.name : null
            if (!isExploreProductPublic(item)) continue
            const produtoNormalizado = serializeExploreItem({ ...rest, category: categoryName, subcategoryName, itemType: 'produto', partners: partner, ...variantFallback }, "produto")
            const score = new Date(item.created_at).getTime()
            const globalId = `produto:${item.id}`

            // Salvar Data JSON
            pipeline.set(`data:v2:${globalId}`, JSON.stringify(produtoNormalizado))
            // Salvar no index específico
            pipeline.zadd("explore:index:produtos", { score, member: globalId })
            // Salvar no index ALL
            pipeline.zadd("explore:index:all", { score, member: globalId })
            
            count += 3
            await executePipelineIfFull()
        }
        console.log(`✅ ${produtos.length} Produtos processados.`)
    }

    // --- SERVIÇOS ---
    console.log("Buscando Serviços...")
    const { data: servicos } = await supabase
        .from("services")
        .select(`
            id, name, description, price, promotional_price, images, rating, updated_at, is_active, status, moderation_status, deleted_at, show_in_marketplace,
            created_at,
            marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name)),
            partners(id, is_showcase_active),
            stores(id, name, logo_url, banner_url, addresses(city, state, neighborhood, latitude, longitude))
        `)
        .eq("status", "ativo")
        .eq("is_active", true)
        .eq("moderation_status", "approved")
        .is("deleted_at", null)
        .eq("show_in_marketplace", true)

    if (servicos) {
        for (const item of (servicos as any[])) {
            const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
            const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
            const storeName = rawStore?.name || "Vendedor"
            const storeImage = rawStore?.logo_url || null
            const storeCity = rawStore?.addresses?.[0]?.city || null
            const storeState = rawStore?.addresses?.[0]?.state || null
            const storeNeighborhood = rawStore?.addresses?.[0]?.neighborhood || null
            const storeLat = rawStore?.addresses?.[0]?.latitude || null
            const storeLng = rawStore?.addresses?.[0]?.longitude || null
            const partner = rawPartner || rawStore ? {
                id: rawPartner?.id || rawStore?.id,
                store_id: rawStore?.id || rawPartner?.id,
                store_name: storeName,
                store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                store_image_url: storeImage,
                banner_url: rawStore?.banner_url || null,
                city: storeCity,
                state: storeState,
                neighborhood: storeNeighborhood,
                latitude: storeLat,
                longitude: storeLng,
                is_showcase_active: rawStore?.is_showcase_active ?? rawPartner?.is_showcase_active ?? true
            } : null
            
            if (!isExploreServicePublic(item)) continue
            const servicoNormalizado = serializeExploreItem({ ...item, itemType: 'servico', partners: partner }, "servico")
            const score = new Date(item.created_at).getTime()
            const globalId = `servico:${item.id}`

            pipeline.set(`data:v2:${globalId}`, JSON.stringify(servicoNormalizado))
            pipeline.zadd("explore:index:servicos", { score, member: globalId })
            pipeline.zadd("explore:index:all", { score, member: globalId })
            
            count += 3
            await executePipelineIfFull()
        }
        console.log(`✅ ${servicos.length} Serviços processados.`)
    }

    // --- VITRINES (Partners) ---
    console.log("Buscando Vitrines...")
    const { data: vitrines } = await supabase
        .from("stores")
        .select(`
            id, name, slug, description, logo_url, banner_url, rating, created_at, partner_id,
            addresses(city, state, neighborhood, latitude, longitude),
            partners(id, category_id, category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)), reviews(count))
        `)
        .eq("is_active", true)

    if (vitrines) {
        for (const item of (vitrines as any[])) {
            const city = item.addresses?.[0]?.city || null
            const state = item.addresses?.[0]?.state || null
            const neighborhood = item.addresses?.[0]?.neighborhood || null
            const latitude = item.addresses?.[0]?.latitude || null
            const longitude = item.addresses?.[0]?.longitude || null
            const p = item.partners as any
            const reviewsCount = p?.reviews?.[0]?.count || 0
            const cat = p?.category as any
            const categoryName = cat?.parent?.name || cat?.name || 'Loja Parceira'
            const storeName = item.name || "Loja"
            const storeImage = item.logo_url
            if (!isExploreStorePublic(item)) continue
            const vitrineNormalizada = serializeExploreItem({
                id: item.id,
                name: storeName,
                slug: item.slug || undefined,
                description: item.description || "",
                images: [item.banner_url || storeImage || "https://img.dudit.com.br/static/Placeholder.png"],
                rating: item.rating || 0,
                itemType: 'loja',
                category: categoryName,
                partners: {
                    id: item.partner_id || item.id,
                    store_id: item.id,
                    store_name: storeName,
                    slug: item.slug || null,
                    store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                    store_image_url: storeImage,
                    banner_url: item.banner_url || null,
                    latitude,
                    longitude,
                    city, state, neighborhood, reviewsCount
                }
            }, "loja")
            const score = new Date(item.created_at).getTime()
            const globalId = `loja:${item.id}`

            pipeline.set(`data:v2:${globalId}`, JSON.stringify(vitrineNormalizada))
            pipeline.zadd("explore:index:vitrines", { score, member: globalId })
            pipeline.zadd("explore:index:all", { score, member: globalId })
            
            count += 3
            await executePipelineIfFull()
        }
        console.log(`✅ ${vitrines.length} Vitrines processadas.`)
    }

    // Flush last batch
    if (count > 0) {
        await pipeline.exec()
        console.log("Lote final salvo no Redis.")
    }

    console.log("🎉 Seed finalizado com sucesso!")
}

seedRedis().catch(console.error)
