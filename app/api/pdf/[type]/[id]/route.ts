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
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    if (type === "orcamento") {
        resource = "quotes"
        const query = supabase
            .from("quotes")
            .select("partner_id")
        
        if (isUuid) {
            query.eq("id", id)
        } else {
            query.eq("quote_number", id)
        }
        
        const { data: quote } = await query.maybeSingle()
        partnerId = quote?.partner_id || null
    } else if (type === "recibo") {
        resource = "orders"
        const orderQuery = supabase
            .from("orders")
            .select("partner_id")
        
        if (isUuid) {
            orderQuery.eq("id", id)
        } else {
            orderQuery.eq("order_number", id)
        }
        
        const { data: order } = await orderQuery.maybeSingle()
        
        if (order?.partner_id) {
            partnerId = order.partner_id
        } else {
            const saleQuery = supabase
                .from("sales")
                .select("partner_id")
            
            if (isUuid) {
                saleQuery.eq("id", id)
            } else {
                saleQuery.eq("sale_number", id)
            }
            
            const { data: sale } = await saleQuery.maybeSingle()
            partnerId = sale?.partner_id || null
        }
    } else if (type === "caixa") {
        resource = "pdv"
        const { data: cashSession } = await supabase
            .from("cash_sessions")
            .select("partner_id")
            .eq("id", id)
            .maybeSingle()
        
        partnerId = cashSession?.partner_id || null
    } else if (type === "troca") {
        resource = "orders"
        const { data: returnRequest } = await supabase
            .from("return_requests")
            .select("partner_id")
            .eq("id", id)
            .maybeSingle()
        
        partnerId = returnRequest?.partner_id || null
    } else if (type === "invoice") {
        resource = "billing"
        const { data: inv } = await supabase
            .from("billing_invoices")
            .select("partner_id")
            .eq("id", id)
            .maybeSingle()

        partnerId = inv?.partner_id || null
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

    // 4. Construct print template page URL using internal HTTP loopback
    // In containerized deployments (Railway/Docker), the internal Node process listens on HTTP.
    // Calling https://localhost:PORT triggers net::ERR_SSL_PROTOCOL_ERROR.
    // Using http://127.0.0.1:PORT ensures direct, fast, non-SSL internal communication.
    const requestUrl = new URL(request.url)
    const port = process.env.PORT || requestUrl.port || "3000"
    const searchParamsStr = requestUrl.search
    const printUrl = `http://127.0.0.1:${port}/print/${type}/${id}${searchParamsStr}`

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
