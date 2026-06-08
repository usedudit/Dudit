import { createClient } from "@supabase/supabase-js"
import { Redis } from "@upstash/redis"
import path from "path"
import fs from "fs"

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
    const withImage = variants.find((v: any) => v.is_active && v.variant_options?.image)
    const first = variants.find((v: any) => v.is_active) || variants[0]
    const image = withImage?.variant_options?.image || null
    const priceAdj = first?.price_adjustment
    const price = priceAdj && priceAdj > 0 ? priceAdj : null
    return { fallback_variant_image: image, fallback_variant_price: price }
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
            id, name, description, price, promotional_price, images, rating,
            category_id, category:product_categories!category_id(name), created_at,
            marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
            partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state)),
            product_variants(variant_options, price_adjustment, is_active)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)

    if (produtos) {
        for (const item of produtos) {
            const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
            const partner = rawPartner ? {
                ...rawPartner,
                store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                latitude: rawPartner.latitude, longitude: rawPartner.longitude,
                city: rawPartner.addresses?.[0]?.city || null, state: rawPartner.addresses?.[0]?.state || null
            } : null
            const variantFallback = extractFirstVariantFallback((item as any).product_variants)
            const { product_variants, ...rest } = item
            
            const mCat = item.marketplace_category as any
            const categoryName = mCat?.parent?.name || mCat?.name || (item.category as any)?.name || null
            const subcategoryName = mCat?.parent ? mCat.name : null
            const produtoNormalizado = { ...rest, category: categoryName, subcategoryName, itemType: 'produto', partners: partner, ...variantFallback }
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
            id, name, description, price, images, rating, created_at,
            marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name)),
            partners(id, store_name, store_image_url, latitude, longitude, addresses(city, state))
        `)
        .eq("is_active", true)

    if (servicos) {
        for (const item of servicos) {
            const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
            const partner = rawPartner ? {
                ...rawPartner,
                store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                latitude: rawPartner.latitude, longitude: rawPartner.longitude,
                city: rawPartner.addresses?.[0]?.city || null, state: rawPartner.addresses?.[0]?.state || null
            } : null
            
            const servicoNormalizado = { ...item, itemType: 'servico', partners: partner }
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
        .from("partners")
        .select(`
            id, store_name, store_description, store_image_url, banner_url, logo_moderation_status, banner_moderation_status, rating, latitude, longitude, created_at,
            category_id, category:marketplace_partner_categories!category_id(name, slug, parent:marketplace_partner_categories!parent_id(name)),
            addresses(city, state),
            reviews(count)
        `)
        .eq("is_active", true)

    if (vitrines) {
        for (const item of vitrines) {
            const city = item.addresses?.[0]?.city || null
            const state = item.addresses?.[0]?.state || null
            const reviewsCount = item.reviews?.[0]?.count || 0
            const cat = item.category as any
            const categoryName = cat?.parent?.name || cat?.name || 'Loja Parceira'
            const vitrineNormalizada = {
                id: item.id, name: item.store_name, description: item.store_description,
                images: [item.banner_url || item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"],
                rating: item.rating, itemType: 'loja', category: categoryName,
                partners: {
                    id: item.id, store_name: item.store_name,
                    store_avatar: item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                    banner_url: item.banner_url || null,
                    logo_moderation_status: item.logo_moderation_status || "approved",
                    banner_moderation_status: item.banner_moderation_status || "approved",
                    latitude: item.latitude, longitude: item.longitude,
                    city, state, reviewsCount
                }
            }
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
