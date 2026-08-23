import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { generatePdf } from "@/lib/pdf/generator"

interface PrintData {
    presetId: string
    customPreset?: {
        labelWidth: number
        labelHeight: number
        cols: number
        rows: number
        marginTop: number
        marginRight: number
        marginBottom: number
        marginLeft: number
        spacingX: number
        spacingY: number
        paperSize?: "a4" | "letter"
    }
    contentConfig: any
    products: { id: string; quantity: number; barcodeValue?: string; variantId?: string }[]
}

export async function GET(request: NextRequest) {
    const user = await getCurrentUser()
    if (!user) {
        return new Response(JSON.stringify({ error: "Não autenticado" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        })
    }

    const searchParams = request.nextUrl.searchParams
    const dataStr = searchParams.get("data")
    if (!dataStr) {
        return new Response(JSON.stringify({ error: "Dados não encontrados" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    let printData: PrintData
    try {
        printData = JSON.parse(dataStr)
    } catch {
        return new Response(JSON.stringify({ error: "Dados inválidos" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    if (!printData.products || printData.products.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum produto selecionado" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    // Verify user has access to products
    const { getAdminClient } = await import("@/lib/supabase/admin")
    const supabase = getAdminClient()
    const { data: partner } = await supabase.from("partners").select("id").eq("user_id", user.id).single()

    if (!partner) {
        return new Response(JSON.stringify({ error: "Parceiro não encontrado" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        })
    }

    try {
        await requirePartnerAccessWithPermission(partner.id, "products", "view", user)
    } catch {
        return new Response(JSON.stringify({ error: "Acesso negado" }), {
            status: 403,
            headers: { "Content-Type": "application/json" }
        })
    }

    // Construct internal print URL
    const requestUrl = new URL(request.url)
    const port = process.env.PORT || requestUrl.port || "3000"
    const encodedData = encodeURIComponent(JSON.stringify(printData))
    const printUrl = `http://127.0.0.1:${port}/print/labels?data=${encodedData}&headless=true`

    // Get cookies for auth
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()

    try {
        const pdfBuffer = await generatePdf(printUrl, allCookies)

        return new Response(new Uint8Array(pdfBuffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="etiquetas.pdf"',
                "Cache-Control": "no-store, must-revalidate",
            }
        })
    } catch (error: any) {
        console.error("[PDF Labels Route Error]:", error)
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
