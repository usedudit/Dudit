import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { generatePdf } from "@/lib/pdf/generator"

export async function GET(request: NextRequest) {
  // 1. Autenticar usuário
  const user = await getCurrentUser()
  if (!user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const requestUrl = new URL(request.url)
  const partnerId = requestUrl.searchParams.get("partnerId")
  const startDate = requestUrl.searchParams.get("startDate")
  const endDate = requestUrl.searchParams.get("endDate")

  if (!partnerId || !startDate || !endDate) {
    return new Response(
      JSON.stringify({ error: "Parâmetros obrigatórios ausentes (partnerId, startDate, endDate)" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  // 2. Validar permissão
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "view", user)
  } catch {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  // 3. Montar URL interna de impressão
  const port = process.env.PORT || requestUrl.port || "3000"
  const searchParamsStr = requestUrl.search
  const printUrl = `http://127.0.0.1:${port}/print/dre${searchParamsStr}`

  // 4. Repassar cookies de sessão para o headless Chromium
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  // 5. Gerar PDF binário via Chromium
  try {
    const pdfBuffer = await generatePdf(printUrl, allCookies)

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="DRE-${startDate}_a_${endDate}.pdf"`,
        "Cache-Control": "no-store, must-revalidate",
      },
    })
  } catch (error: any) {
    console.error("[PDF Route Error - DRE]:", error)
    return new Response(
      JSON.stringify({
        error: "Falha ao gerar o PDF da DRE via Chromium.",
        details: error.message || error,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}
