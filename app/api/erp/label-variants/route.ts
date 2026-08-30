import { NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getAdminClient } from "@/lib/supabase/admin"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"

export async function GET(request: NextRequest) {
    const user = await getCurrentUser()
    if (!user) {
        return new Response(JSON.stringify({ error: "Não autenticado" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        })
    }

    const searchParams = request.nextUrl.searchParams
    const productIdsStr = searchParams.get("productIds")
    const partnerId = searchParams.get("partnerId")

    if (!productIdsStr) {
        return new Response(JSON.stringify({ error: "productIds obrigatório" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    let productIds: string[]
    try {
        productIds = JSON.parse(productIdsStr)
    } catch {
        return new Response(JSON.stringify({ error: "productIds inválido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
        return Response.json({ variants: {} })
    }

    const supabase = getAdminClient()
    let allowedProductIds: string[] = []

    if (partnerId) {
        try {
            await requirePartnerAccessWithPermission(partnerId, "products", "view", user)
        } catch {
            return new Response(JSON.stringify({ error: "Acesso negado ao parceiro" }), {
                status: 403,
                headers: { "Content-Type": "application/json" }
            })
        }

        const { data: ownedProducts, error: prodError } = await supabase
            .from("products")
            .select("id")
            .eq("partner_id", partnerId)
            .in("id", productIds)

        if (prodError) {
            return new Response(JSON.stringify({ error: prodError.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            })
        }

        allowedProductIds = (ownedProducts || []).map((p: any) => p.id)
    } else {
        // Fallback: verify user has partner access to each product's partner
        const [{ data: ownedPartners }, { data: memberPartners }] = await Promise.all([
            supabase.from("partners").select("id").eq("user_id", user.id),
            supabase.from("partner_users").select("partner_id").eq("user_id", user.id),
        ])

        const userPartnerIds = Array.from(
            new Set([
                ...(ownedPartners || []).map((p: any) => p.id),
                ...(memberPartners || []).map((p: any) => p.partner_id),
            ])
        )

        if (userPartnerIds.length === 0) {
            return Response.json({ variants: {} })
        }

        const { data: ownedProducts, error: prodError } = await supabase
            .from("products")
            .select("id")
            .in("partner_id", userPartnerIds)
            .in("id", productIds)

        if (prodError) {
            return new Response(JSON.stringify({ error: prodError.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            })
        }

        allowedProductIds = (ownedProducts || []).map((p: any) => p.id)
    }

    if (allowedProductIds.length === 0) {
        return Response.json({ variants: {} })
    }

    const { data: variants, error } = await supabase
        .from("product_variants")
        .select("id, product_id, variant_type, variant_name, sku, price_adjustment, stock_quantity, is_active")
        .in("product_id", allowedProductIds)
        .eq("is_active", true)
        .order("variant_name")

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }

    const grouped: Record<string, any[]> = {}
    for (const v of variants || []) {
        if (!grouped[v.product_id]) grouped[v.product_id] = []
        grouped[v.product_id].push(v)
    }

    return Response.json({ variants: grouped })
}
