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
    const partnerId = searchParams.get("partnerId")
    if (!partnerId) {
        return new Response(JSON.stringify({ error: "partnerId obrigatório" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    const supabase = getAdminClient()

    const { data: methods, error } = await supabase
        .from("payment_methods")
        .select("max_installments")
        .eq("partner_id", partnerId)
        .eq("is_active", true)
        .not("max_installments", "is", null)

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }

    const maxInstallments = (methods as { max_installments: number | null }[] || [])
        .map((m: { max_installments: number | null }) => m.max_installments)
        .filter((n: number | null): n is number => n != null && n > 0)
        .reduce((max: number, n: number) => Math.max(max, n), 0) || undefined

    return Response.json({ maxInstallments })
}
