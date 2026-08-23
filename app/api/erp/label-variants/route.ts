import { NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getAdminClient } from "@/lib/supabase/admin"

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

    if (productIds.length === 0) {
        return Response.json({ variants: {} })
    }

    const supabase = getAdminClient()

    const { data: variants, error } = await supabase
        .from("product_variants")
        .select("id, product_id, variant_type, variant_name, sku, price_adjustment, stock_quantity, is_active")
        .in("product_id", productIds)
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
