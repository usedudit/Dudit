import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { generatePdf } from "@/lib/pdf/generator"

interface RouteParams {
    params: Promise<{
        type: string
        id: string
    }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const { type, id } = await params
    
    // 1. Authenticate user session
    const user = await getCurrentUser()
    if (!user) {
        return new Response(JSON.stringify({ error: "Não autenticado" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        })
    }

    // 2. Identify the resource type, query partner_id, and set up permission validation
    const supabase = getAdminClient()
    let partnerId: string | null = null
    let resource = ""

    if (type === "orcamento") {
        resource = "quotes"
        const { data: quote } = await supabase
            .from("quotes")
            .select("partner_id")
            .eq("id", id)
            .maybeSingle()
        partnerId = quote?.partner_id || null
    } else if (type === "recibo") {
        resource = "orders"
        const { data: order } = await supabase
            .from("orders")
            .select("partner_id")
            .eq("id", id)
            .maybeSingle()
        
        if (order?.partner_id) {
            partnerId = order.partner_id
        } else {
            const { data: sale } = await supabase
                .from("sales")
                .select("partner_id")
                .eq("id", id)
                .maybeSingle()
            partnerId = sale?.partner_id || null
        }
    } else {
        return new Response(JSON.stringify({ error: "Tipo de documento inválido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    if (!partnerId) {
        return new Response(JSON.stringify({ error: "Documento não encontrado" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        })
    }

    // 3. Verify user permissions for the current partner/resource
    try {
        await requirePartnerAccessWithPermission(partnerId, resource as any, "view", user)
    } catch {
        return new Response(JSON.stringify({ error: "Acesso negado" }), {
            status: 403,
            headers: { "Content-Type": "application/json" }
        })
    }

    // 4. Construct print template page URL with matching protocol, host, and search parameters
    const requestUrl = new URL(request.url)
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
    const searchParamsStr = requestUrl.search
    const printUrl = `${baseUrl}/print/${type}/${id}${searchParamsStr}`

    // 5. Gather request cookies to forward to the Puppeteer browser
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()

    // 6. Generate the PDF
    try {
        const pdfBuffer = await generatePdf(printUrl, allCookies)
        
        return new Response(new Uint8Array(pdfBuffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${type}-${id}.pdf"`,
                "Cache-Control": "no-store, must-revalidate",
            }
        })
    } catch (error: any) {
        console.error(`[PDF Route Error] type=${type} id=${id}:`, error)
        return new Response(
            JSON.stringify({
                error: "Falha ao gerar o PDF.",
                details: error.message || error,
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        )
    }
}
