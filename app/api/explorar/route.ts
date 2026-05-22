/**
 * @deprecated CÓDIGO MORTO / DEAD CODE
 * Este endpoint não é mais utilizado pelo sistema. A página de explorar (/explorar)
 * agora carrega os dados diretamente via Server Actions (getCachedExploreProducts).
 * NÃO remover o arquivo fisicamente sem autorização.
 */

import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        
        const type = searchParams.get('type') || 'tudo'
        const limitStr = searchParams.get('limit') || '20'
        const limit = parseInt(limitStr, 10)
        
        // O cursor agora é o ZSET score (Timestamp)
        const cursor = searchParams.get('cursor')
        
        // Se temos cursor, buscamos itens EXATAMENTE mais velhos (menores) que o cursor
        // O '(' significa buscar valores menores que o cursor (exclusive)
        const maxScore: any = cursor ? `(${cursor}` : "+inf"
        
        const indexKey = type === 'tudo' ? 'explore:index:all' : `explore:index:${type}`

        // 1. ZRANGE com byScore e rev para pegar a lista ordenada de IDs do Redis
        const ids = (await redis.zrange(indexKey, maxScore, "-inf" as any, { byScore: true, rev: true, offset: 0, count: limit })) as string[]

        if (!ids || ids.length === 0) {
            return NextResponse.json({ data: [], nextCursor: null })
        }

        // 2. MGET para tentar pegar objetos completos já do Redis
        const dataKeys = ids.map((id: string) => `data:v2:${id}`)
        const cachedObjectsRaw = await redis.mget(...dataKeys)
        
        const cachedObjects = cachedObjectsRaw.map(obj => 
            typeof obj === 'string' ? JSON.parse(obj) : obj
        )

        // Ver se todos vieram completos (Cache Hit 100%)
        const missingIndices = cachedObjects.reduce((acc: number[], obj, idx) => {
            if (!obj) acc.push(idx)
            return acc
        }, [])

        // 3. Postgres Fallback para os 'buracos' nulos
        if (missingIndices.length > 0) {
            const supabase = getAdminClient()
            const missingIds = missingIndices.map(idx => ids[idx])

            // Separa os missing IDs por tipo para buscar na tabela certa
            const produtosIds = missingIds.filter((id: string) => id.startsWith('produto:')).map((id: string) => id.replace('produto:', ''))
            const servicosIds = missingIds.filter((id: string) => id.startsWith('servico:')).map((id: string) => id.replace('servico:', ''))
            const lojasIds = missingIds.filter((id: string) => id.startsWith('loja:')).map((id: string) => id.replace('loja:', ''))

            const promises = []

            if (produtosIds.length > 0) {
                promises.push(
                    supabase.from("products").select(`
              id, name, description, price, promotional_price, stock_available, stock_quantity, images, rating,
              category_id, category:product_categories!category_id(name), created_at,
                        partners(id, store_name, store_image_url, addresses(city, state)),
                        product_variants(variant_options, price_adjustment, is_active)
                    `).in("id", produtosIds)
                )
            }
            if (servicosIds.length > 0) {
                promises.push(
                    supabase.from("services").select(`
                        id, name, description, price, images, rating, category, created_at,
                        partners(id, store_name, store_image_url, addresses(city, state))
                    `).in("id", servicosIds)
                )
            }
            if (lojasIds.length > 0) {
                promises.push(
                    supabase.from("partners").select(`
                        id, store_name, store_description, store_image_url, banner_url, logo_moderation_status, banner_moderation_status, rating, created_at, addresses(city, state)
                    `).in("id", lojasIds)
                )
            }

            const results = await Promise.all(promises)
            let fallbackRecords: any[] = []
            
            // Juntar todos resultados do Postgres numa lista plana
            results.forEach((res) => {
                if (res.data) {
                    fallbackRecords = fallbackRecords.concat(res.data)
                }
            })

            // Lógica de Normalização Simplificada (Para evitar duplicação do ExtractFallback, faremos inline ou base simples)
            const normalizeRecord = (item: any) => {
                if (item.store_name) { // È Partner
                    return {
                        id: item.id, name: item.store_name, description: item.store_description,
                        images: [item.banner_url || item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"],
                        rating: item.rating, itemType: 'loja', category: 'Loja Parceira',
                        partners: {
                            id: item.id, store_name: item.store_name,
                            store_avatar: item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                            banner_url: item.banner_url || null,
                            logo_moderation_status: item.logo_moderation_status || "approved",
                            banner_moderation_status: item.banner_moderation_status || "approved",
                            city: item.addresses?.[0]?.city || null, state: item.addresses?.[0]?.state || null
                        }
                    }
                }
                
                 const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
                 const partner = rawPartner ? {
                     ...rawPartner,
                     store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
                     city: rawPartner.addresses?.[0]?.city || null, state: rawPartner.addresses?.[0]?.state || null
                 } : null
 
                 if (item.product_variants !== undefined) { // É Produto
                     const variants = item.product_variants
                     const withImage = variants?.find((v: any) => v.is_active && v.variant_options?.image)
                     const first = variants?.find((v: any) => v.is_active) || variants?.[0]
                     const image = withImage?.variant_options?.image || null
                     const priceAdj = first?.price_adjustment
                     const fallbackPrice = priceAdj && priceAdj > 0 ? priceAdj : null
                     const { product_variants, ...rest } = item
                     return {
                         ...rest,
                         category: item.category?.name || null,
                         itemType: 'produto',
                         partners: partner,
                         fallback_variant_image: image,
                         fallback_variant_price: fallbackPrice
                     }
                 }
 
                 // É Serviço
                 return { ...item, itemType: 'servico', partners: partner }
            }

            // Mapear os missingIndices preenchendo o array cachedObjects e salvando assincronamente no Redis
            const pipeline = redis.pipeline()
            let shouldExec = false

            for (const idx of missingIndices) {
                const globalId = ids[idx] // ex: 'produto:123'
                const rawId = globalId.split(':')[1]
                
                // Procurar no flat list de fallback
                const found = fallbackRecords.find(r => r.id === rawId)
                if (found) {
                    const normalized = normalizeRecord(found)
                    cachedObjects[idx] = normalized
                    // Cache Aside (Lazy Update)
                    pipeline.set(`data:v2:${globalId}`, JSON.stringify(normalized))
                    shouldExec = true
                }
            }

            if (shouldExec) {
                // Background update, não aguarda pra responder o front
                pipeline.exec().catch(console.error)
            }
        }

        // 4. Filtrar nulls (caso o item tenha sido apagado definitivamente do banco e esteja orfão no index do Redis)
        const finalData = cachedObjects.filter(Boolean)

        // Descobrir o cursor do PRÓXIMO bloco (Score do último item da lista devolvida)
        // Para isso, faremos um ZSCORE rápido do último ID retornado:
        let nextCursor = null
        if (ids.length > 0) {
            const lastId = ids[ids.length - 1]
            const lastScore = await redis.zscore(indexKey, lastId)
            nextCursor = lastScore
        }

        return NextResponse.json({
            data: finalData,
            nextCursor: nextCursor
        })

    } catch (error) {
        console.error("API /explorar erro:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
