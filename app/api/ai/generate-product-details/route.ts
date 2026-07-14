import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser, requirePartnerAccess } from "@/lib/auth/authorization"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { AiGeneratorService } from "@/lib/services/ai-generator.service"

async function handleGenerateProductDetails(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 })
    }

    const { title, partnerId, itemType = "product" } = body

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Título é obrigatório." }, { status: 400 })
    }

    if (!partnerId) {
      return NextResponse.json({ error: "partnerId é obrigatório." }, { status: 400 })
    }

    if (itemType !== "product" && itemType !== "service") {
      return NextResponse.json({ error: "itemType inválido." }, { status: 400 })
    }

    // Segurança: Garante que o usuário logado pertence ao partnerId informado
    try {
      await requirePartnerAccess(partnerId)
    } catch {
      return NextResponse.json({ error: "Acesso negado para este parceiro." }, { status: 403 })
    }

    const result = await AiGeneratorService.generateProductDetails(partnerId, user.id, {
      title,
      itemType,
    })

    if (!result.success) {
      if (result.error === "plan_blocked" || result.error === "limit_exceeded") {
        return NextResponse.json({ error: result.message, code: result.error }, { status: 403 })
      }
      return NextResponse.json({ error: result.message }, { status: 500 })
    }

    return NextResponse.json({ data: result.data, cached: result.cached })
  } catch (error: any) {
    console.error("[API_GENERATE_DETAILS] Erro Fatal:", error)
    return NextResponse.json({ error: "Ocorreu um erro interno de processamento." }, { status: 500 })
  }
}

export const POST = withCSRFProtection(handleGenerateProductDetails)
