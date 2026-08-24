import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { getCurrentUser } from "@/lib/auth/server-user"
import { createAdminClient } from "@/lib/supabase/server"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { generatePdf } from "@/lib/pdf/generator"
import { formatDateToBR } from "@/lib/utils"

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
  const storeId = requestUrl.searchParams.get("storeId")
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

  // 2. Validar plano Escalar e roles (owner, admin, manager)
  const admin = createAdminClient()
  const [plan, partnerRes, puRes] = await Promise.all([
    getPartnerPlan(partnerId),
    admin.from("partners").select("user_id").eq("id", partnerId).maybeSingle(),
    admin.from("partner_users").select("id, role_id").eq("partner_id", partnerId).eq("user_id", user.id).maybeSingle(),
  ])

  if (!hasMinimumPlan(plan.slug, "escalar")) {
    return new Response(JSON.stringify({ error: "O DRE é um recurso exclusivo do Plano Escalar." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  const isPartnerOwner = partnerRes.data?.user_id === user.id
  const roleId = String(puRes.data?.role_id || "").toLowerCase()

  if (!isPartnerOwner && !["owner", "admin", "manager"].includes(roleId)) {
    return new Response(JSON.stringify({ error: "Apenas proprietários, administradores e gerentes podem exportar o DRE." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  // 3. Validar acesso à loja
  if (!isPartnerOwner && roleId !== "owner") {
    if (!puRes.data) {
      return new Response(JSON.stringify({ error: "Acesso negado às lojas desta empresa." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }
    const { data: members } = await admin
      .from("store_members")
      .select("store_id")
      .eq("partner_user_id", puRes.data.id)

    const memberStoreIds = (members || []).map((m: any) => m.store_id)
    if (memberStoreIds.length === 0) {
      return new Response(JSON.stringify({ error: "Acesso negado às lojas desta empresa." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (storeId && storeId !== "all" && !memberStoreIds.includes(storeId)) {
      return new Response(JSON.stringify({ error: "Você não tem acesso à loja selecionada." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }
  }

  // 4. Montar URL interna de impressão
  const port = process.env.PORT || requestUrl.port || "3000"
  const searchParamsStr = requestUrl.search
  const printUrl = `http://127.0.0.1:${port}/print/dre${searchParamsStr}`

  // 5. Repassar cookies de sessão para o headless Chromium
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  // 6. Gerar PDF binário via Chromium
  try {
    const pdfBuffer = await generatePdf(printUrl, allCookies)

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="DRE-${formatDateToBR(startDate)}_a_${formatDateToBR(endDate)}.pdf"`,
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
